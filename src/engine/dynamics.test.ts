import { describe, expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, RouterDevice, type IcmpEvent } from './ipdevice';
import { ApDevice, SwitchDevice } from './switch';
import { parseCidr, parseIp } from './ip';
import { restoreNetwork, serializeNetwork } from './serialize';
import { Shell } from '../commands/shell';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: Host | RouterDevice, ifname: string, cidr: string): void {
  dev.getInterface(ifname)!.ip = parseCidr(cidr)!;
}

function pingWorks(net: Network, from: Host, to: string): boolean {
  const evs: IcmpEvent[] = [];
  const id = from.allocIcmpId();
  from.onIcmp(id, (e) => evs.push(e));
  from.sendEcho(ip(to), id, 1);
  net.scheduler.advanceTo(net.scheduler.now + 15_000);
  from.offIcmp(id);
  return evs.some((e) => e.type === 'reply');
}

// pc1 — r1 — r2 — pc2 across three subnets; routers have NO static routes.
function ripChain(net: Network) {
  const pc1 = createDevice(net, 'host') as Host;
  const r1 = createDevice(net, 'router') as RouterDevice;
  const r2 = createDevice(net, 'router') as RouterDevice;
  const pc2 = createDevice(net, 'host') as Host;
  net.connect(pc1.id, r1.id);
  const mid = net.connect(r1.id, r2.id);
  net.connect(pc2.id, r2.id);
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(r1, 'eth0', '192.168.1.1/24');
  setIp(r1, 'eth1', '10.0.12.1/30');
  setIp(r2, 'eth0', '10.0.12.2/30');
  setIp(r2, 'eth1', '172.16.0.1/24');
  setIp(pc2, 'eth0', '172.16.0.20/24');
  pc1.addRoute(0, 0, ip('192.168.1.1'));
  pc2.addRoute(0, 0, ip('172.16.0.1'));
  return { pc1, r1, r2, pc2, mid };
}

describe('RIP', () => {
  it('learns remote networks and enables end-to-end ping', () => {
    const net = new Network();
    const { pc1, r1, r2 } = ripChain(net);
    expect(pingWorks(net, pc1, '172.16.0.20')).toBe(false);

    r1.enableRip(true);
    r2.enableRip(true);
    net.scheduler.advanceTo(net.scheduler.now + 30_000);

    const learned = r1.routes().find((r) => r.kind === 'rip' && r.dest === ip('172.16.0.0'));
    expect(learned).toBeTruthy();
    expect(learned!.via).toBe(ip('10.0.12.2'));
    expect(learned!.metric).toBe(2);
    expect(pingWorks(net, pc1, '172.16.0.20')).toBe(true);
  });

  it('shows learned routes as proto rip in ip route', () => {
    const net = new Network();
    const { r1, r2 } = ripChain(net);
    r1.enableRip(true);
    r2.enableRip(true);
    net.scheduler.advanceTo(net.scheduler.now + 30_000);
    const out: string[] = [];
    new Shell(r1).exec('ip route', { write: (s) => out.push(s) }, () => {});
    expect(out.join('')).toContain('172.16.0.0/24 via 10.0.12.2 dev eth1 proto rip metric 2');
  });

  it('expires routes when the neighbour goes silent', () => {
    const net = new Network();
    const { pc1, r1, r2, mid } = ripChain(net);
    r1.enableRip(true);
    r2.enableRip(true);
    net.scheduler.advanceTo(net.scheduler.now + 30_000);
    expect(pingWorks(net, pc1, '172.16.0.20')).toBe(true);

    net.disconnect(mid.id);
    net.scheduler.advanceTo(net.scheduler.now + 60_000);
    expect(r1.routes().some((r) => r.kind === 'rip')).toBe(false);
    expect(pingWorks(net, pc1, '172.16.0.20')).toBe(false);
  });

  it('is blocked by an INPUT drop of udp/520 (firewall lab)', () => {
    const net = new Network();
    const { r1, r2 } = ripChain(net);
    let finished = false;
    new Shell(r2).exec('iptables -A INPUT -p udp --dport 520 -j DROP', { write: () => {} }, () => (finished = true));
    expect(finished).toBe(true);
    r1.enableRip(true);
    r2.enableRip(true);
    net.scheduler.advanceTo(net.scheduler.now + 30_000);
    expect(r2.routes().some((r) => r.kind === 'rip')).toBe(false);
    // r1 still hears r2 (r2's OUTPUT is open).
    expect(r1.routes().some((r) => r.kind === 'rip')).toBe(true);
  });
});

describe('VLANs', () => {
  it('isolates ports in different VLANs even within one subnet', () => {
    const net = new Network();
    const sw = createDevice(net, 'switch') as SwitchDevice;
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    const c = createDevice(net, 'host') as Host;
    net.connect(a.id, sw.id); // sw eth0
    net.connect(b.id, sw.id); // sw eth1
    net.connect(c.id, sw.id); // sw eth2
    setIp(a, 'eth0', '10.0.0.1/24');
    setIp(b, 'eth0', '10.0.0.2/24');
    setIp(c, 'eth0', '10.0.0.3/24');
    sw.vlans.set('eth0', 10);
    sw.vlans.set('eth1', 10);
    sw.vlans.set('eth2', 20);

    expect(pingWorks(net, a, '10.0.0.2')).toBe(true);
    expect(pingWorks(net, a, '10.0.0.3')).toBe(false);
    // MAC table is per-VLAN
    expect([...sw.macTable.keys()].every((k) => k.startsWith('10|'))).toBe(true);
  });
});

describe('wireless AP', () => {
  it('bridges wireless clients like a switch', () => {
    const net = new Network();
    const ap = createDevice(net, 'ap') as ApDevice;
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, ap.id);
    net.connect(b.id, ap.id);
    setIp(a, 'eth0', '10.1.0.1/24');
    setIp(b, 'eth0', '10.1.0.2/24');
    expect(ap.kind).toBe('ap');
    expect(ap.ssid).toBe('netsim-wifi');
    expect(pingWorks(net, a, '10.1.0.2')).toBe(true);
  });
});

describe('serialization round-trip', () => {
  it('preserves ripEnabled, vlans and ssid', () => {
    const net = new Network();
    const { r1, r2 } = ripChain(net);
    const sw = createDevice(net, 'switch') as SwitchDevice;
    const ap = createDevice(net, 'ap') as ApDevice;
    r1.enableRip(true);
    r2.enableRip(true);
    sw.vlans.set('eth0', 30);
    ap.ssid = 'lab-wifi';

    const saved = serializeNetwork(net, {});
    const restored = restoreNetwork(JSON.parse(JSON.stringify(saved)));
    const r1b = [...restored.devices.values()].find((d) => d.name === r1.name) as RouterDevice;
    const swb = [...restored.devices.values()].find((d) => d.name === sw.name) as SwitchDevice;
    const apb = [...restored.devices.values()].find((d) => d.name === ap.name) as ApDevice;
    expect(r1b.ripEnabled).toBe(true);
    expect(swb.vlanOf('eth0')).toBe(30);
    expect(swb.vlanOf('eth1')).toBe(1);
    expect(apb.ssid).toBe('lab-wifi');

    // RIP converges in the restored network too.
    const pc1b = [...restored.devices.values()].find((d) => d.name === 'pc1') as Host;
    restored.scheduler.advanceTo(30_000);
    expect(pingWorks(restored, pc1b, '172.16.0.20')).toBe(true);
  });
});
