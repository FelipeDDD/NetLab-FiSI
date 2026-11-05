import { expect, it } from 'vitest';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { IpDevice } from '../engine/ipdevice';
import { Shell } from '../commands/shell';
import { STATIC_IDS as I, staticRoutingDocument, staticRoutingConditions } from './staticRoutingChapter';
const routes = [
  [I.r1, '192.168.20.0/24', '10.0.12.2'], [I.r2, '192.168.20.0/24', '10.0.23.2'],
  [I.r3, '192.168.10.0/24', '10.0.23.1'], [I.r2, '192.168.10.0/24', '10.0.12.1'],
];
it('real router-to-router forwarding needs routes in both directions and survives serialization', () => {
  let net = restoreNetwork(staticRoutingDocument().topology);
  const command = (id: string, line: string) => { let text = ''; new Shell(net.devices.get(id) as IpDevice).exec(line, { write: s => { text += s; } }, () => {}); net.scheduler.advanceTo(net.now + 6000); return text; };
  try {
    expect(staticRoutingConditions(net)).toMatchObject({ base: true, forward: false, backward: false, firstMissing: I.r1 });
    expect(command(I.a, 'ping -c 1 192.168.20.20')).toContain('Destination Net Unreachable');
    for (const [id, dest, hop] of routes.slice(0, 2)) expect(command(id, `ip route add ${dest} via ${hop}`)).toBe('');
    expect(staticRoutingConditions(net)).toMatchObject({ forward: true, backward: false });
    expect(command(I.a, 'ping -c 1 192.168.20.20')).not.toContain('64 bytes from');
    for (const [id, dest, hop] of routes.slice(2)) expect(command(id, `ip route replace ${dest} via ${hop}`)).toBe('');
    expect(staticRoutingConditions(net)).toMatchObject({ forward: true, backward: true });
    expect(command(I.a, 'ping -c 1 192.168.20.20')).toContain('64 bytes from 192.168.20.20');
    expect(command(I.b, 'ping 192.168.10.10 -c 1')).toContain('64 bytes from 192.168.10.10');
    const saved = serializeNetwork(net, {}); disposeNetwork(net); net = restoreNetwork(saved);
    expect(command(I.a, 'ping -c 1 192.168.20.20')).toContain('64 bytes from 192.168.20.20');
    expect(command(I.b, 'ping -c 1 192.168.10.10')).toContain('64 bytes from 192.168.10.10');
  } finally { disposeNetwork(net); }
});
it('accepts subnet-wide split routes and detects a wrong more-specific next hop inside the LAN', () => {
  const net = restoreNetwork(staticRoutingDocument().topology);
  try {
    for (const [id, via] of [[I.r1, '10.0.12.2'], [I.r2, '10.0.23.2']]) {
      const d = net.devices.get(id) as IpDevice;
      for (const dest of ['192.168.20.0/25', '192.168.20.128/25']) new Shell(d).exec(`ip route add ${dest} via ${via}`, { write: () => {} }, () => {});
    }
    expect(staticRoutingConditions(net).forward).toBe(true);
    const d = net.devices.get(I.r1) as IpDevice;
    new Shell(d).exec('ip route add 192.168.20.90/32 via 10.0.12.1', { write: () => {} }, () => {});
    expect(staticRoutingConditions(net).forward).toBe(false);
    new Shell(d).exec('ip route replace 192.168.20.90/32 via 10.0.12.2', { write: () => {} }, () => {});
    expect(staticRoutingConditions(net).forward).toBe(true);
  } finally { disposeNetwork(net); }
});
