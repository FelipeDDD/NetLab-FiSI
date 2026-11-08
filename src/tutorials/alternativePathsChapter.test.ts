import { expect, it } from 'vitest';
import { restoreNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { createDevice } from '../engine/factory';
import { IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, TRANSIT_PLAN, alternativePathsDocument, transitConfigured, alternativeConditions, failureBaselineSignature, expectedPcPath } from './alternativePathsChapter';

it('the real triangle supports neighbor reachability, LPM, remote routes, path failure and manual bidirectional recovery', () => {
  const net = restoreNetwork(alternativePathsDocument().topology), wires: string[][] = [];
  const run = (id: string, command: string, advance = false) => { let out = ''; new Shell(net.devices.get(id) as IpDevice).exec(command, { write: s => { out += s; } }, () => {}); if (advance) net.scheduler.advanceTo(net.now + 6000); return out; };
  try {
    expect(net.devices.size).toBe(3); expect(net.links.size).toBe(3); expect(transitConfigured(net)).toBe(false);
    for (const row of TRANSIT_PLAN) expect(run(row.device, `ip address add ${row.address} dev ${row.iface}`)).toBe('');
    expect(transitConfigured(net)).toBe(true);
    expect(run(I.r1, 'ping -c 1 10.0.12.2', true)).toContain('64 bytes from');
    expect(run(I.r1, 'ping -c 1 10.0.23.2', true)).toContain('Network is unreachable');
    for (const [pc, router, link, address, gateway] of [[I.a, I.r1, L.a, '192.168.10.10/24', '192.168.10.1'], [I.b, I.r3, L.b, '192.168.20.20/24', '192.168.20.1']]) {
      const d = createDevice(net, 'host', { id: pc, os: 'linux' }) as IpDevice;
      d.interfaces[0].configureIpv4({ mode: 'static', ip: parseCidr(address), gateway: parseIp(gateway), dns: null });
      net.connect(pc, router, { id: link, aIface: 'eth0', bIface: 'eth2' });
      expect(run(router, `ip address add ${gateway}/24 dev eth2`)).toBe('');
    }
    for (const [id, dest, via] of [[I.r1, '192.168.20.0/24', '10.0.12.2'], [I.r2, '192.168.20.0/24', '10.0.23.2'], [I.r3, '192.168.10.0/24', '10.0.23.1'], [I.r2, '192.168.10.0/24', '10.0.12.1']]) expect(run(id, `ip route add ${dest} via ${via}`)).toBe('');
    expect(run(I.r1, 'ip route add 192.168.0.0/16 via 10.0.13.2')).toBe('');
    expect((net.devices.get(I.r1) as IpDevice).lookupRoute(parseIp('192.168.20.20')!)).toMatchObject({ prefix: 24, via: parseIp('10.0.12.2') });
    expect((net.devices.get(I.r1) as IpDevice).lookupRoute(parseIp('192.168.10.10')!)).toMatchObject({ prefix: 24, kind: 'connected' });
    expect(alternativeConditions(net)).toMatchObject({ via: true, direct: false });
    // The finer teaching steps use the same whole-LAN decision as the final
    // validator: a successful PC-only exception must never replace that proof.
    expect(run(I.r1, 'ip route add 192.168.20.20/32 via 10.0.13.2')).toBe('');
    expect(alternativeConditions(net)).toMatchObject({ r1Forward: false, forward: false, via: false });
    expect(run(I.r1, 'ip route del 192.168.20.20/32')).toBe('');
    expect(run(I.r1, 'ip route del 192.168.20.0/24')).toBe('');
    // With only a broad route via the wrong physical path, the intended path
    // is invalid even if some endpoint could still answer.
    expect(alternativeConditions(net).r1Forward).toBe(false);
    expect(run(I.r1, 'ip route add 192.168.20.0/25 via 10.0.12.2')).toBe('');
    expect(alternativeConditions(net).r1Forward).toBe(false);
    expect(run(I.r1, 'ip route add 192.168.20.128/25 via 10.0.12.2')).toBe('');
    expect(alternativeConditions(net)).toMatchObject({ r1Forward: true, forward: true, via: true });
    expect(run(I.r1, 'ip route del 192.168.20.0/25')).toBe('');
    expect(run(I.r1, 'ip route del 192.168.20.128/25')).toBe('');
    expect(run(I.r1, 'ip route add 192.168.20.0/24 via 10.0.12.2')).toBe('');
    net.onWireTransfer = (transfer, context) => { const p = context.frame.payload; if (p.kind === 'ipv4' && p.l4.kind === 'icmp' && p.l4.msg.type === 'echo-request') wires.push([transfer.fromDeviceId, transfer.toDeviceId]); };
    expect(run(I.a, 'ping -c 1 192.168.20.20', true)).toContain('64 bytes from');
    expect(wires).toEqual(expectedPcPath('ab', 'via').slice(1).map((id, index) => [expectedPcPath('ab', 'via')[index], id])); wires.length = 0;
    expect(run(I.b, 'ping -c 1 192.168.10.10', true)).toContain('64 bytes from');
    const baseline = failureBaselineSignature(net);
    expect(run(I.r2, 'ip link set eth1 down')).toBe(''); expect(failureBaselineSignature(net)).toBe(baseline);
    expect(run(I.a, 'ping -c 1 192.168.20.20', true)).not.toContain('64 bytes from');
    expect(alternativeConditions(net)).toMatchObject({ broken: true, via: false, direct: false });
    expect(run(I.r1, 'ip route replace 192.168.20.0/24 via 10.0.13.2')).toBe('');
    expect(run(I.a, 'ping -c 1 192.168.20.20', true)).not.toContain('64 bytes from'); // Return still uses the failed path.
    expect(run(I.r3, 'ip route replace 192.168.10.0/24 via 10.0.13.1')).toBe(''); wires.length = 0;
    expect(alternativeConditions(net)).toMatchObject({ broken: true, direct: true });
    expect(run(I.a, 'ping -c 1 192.168.20.20', true)).toContain('64 bytes from');
    expect(wires).toEqual(expectedPcPath('ab', 'direct').slice(1).map((id, index) => [expectedPcPath('ab', 'direct')[index], id]));
    expect(run(I.b, 'ping -c 1 192.168.10.10', true)).toContain('64 bytes from');
    expect(run(I.r1, 'ip route add default via 10.0.12.2')).toBe('');
    expect((net.devices.get(I.r1) as IpDevice).lookupRoute(parseIp('10.0.13.2')!)).toMatchObject({ prefix: 30, kind: 'connected' });
    expect(run(I.r1, 'ip route add 10.0.13.2/32 via 10.0.12.2')).toBe('');
    expect((net.devices.get(I.r1) as IpDevice).lookupRoute(parseIp('10.0.13.2')!)).toMatchObject({ prefix: 32, kind: 'static' });
  } finally { disposeNetwork(net); }
});
