import { describe, expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, RouterDevice, type IcmpEvent, type IpDevice } from './ipdevice';
import { SwitchDevice } from './switch';
import { parseCidr, parseIp } from './ip';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: IpDevice, ifname: string, cidr: string): void {
  const c = parseCidr(cidr)!;
  dev.getInterface(ifname)!.ip = c;
}

function collect(dev: IpDevice, id: number): IcmpEvent[] {
  const evs: IcmpEvent[] = [];
  dev.onIcmp(id, (e) => evs.push(e));
  return evs;
}

describe('ARP + ICMP on a direct link', () => {
  it('resolves ARP and answers ping', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, b.id);
    setIp(a, 'eth0', '10.0.0.1/24');
    setIp(b, 'eth0', '10.0.0.2/24');

    const evs = collect(a, 7);
    expect(a.sendEcho(ip('10.0.0.2'), 7, 1)).toBeNull();
    net.scheduler.advanceTo(10_000);

    expect(evs).toHaveLength(1);
    const e = evs[0];
    expect(e.type).toBe('reply');
    if (e.type === 'reply') {
      expect(e.from).toBe(ip('10.0.0.2'));
      expect(e.ttl).toBe(64);
    }
    expect(a.arpTable.get(ip('10.0.0.2'))?.mac).toBe(b.getInterface('eth0')!.mac);
    expect(b.arpTable.get(ip('10.0.0.1'))?.mac).toBe(a.getInterface('eth0')!.mac);
  });

  it('pinging your own address short-circuits', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    setIp(a, 'eth0', '10.0.0.1/24');
    const evs = collect(a, 1);
    expect(a.sendEcho(ip('10.0.0.1'), 1, 1)).toBeNull();
    net.scheduler.advanceTo(1000);
    expect(evs[0]?.type).toBe('reply');
  });
});

describe('switching', () => {
  it('learns MACs and forwards between hosts', () => {
    const net = new Network();
    const sw = createDevice(net, 'switch') as SwitchDevice;
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    const c = createDevice(net, 'host') as Host;
    net.connect(a.id, sw.id);
    net.connect(b.id, sw.id);
    net.connect(c.id, sw.id);
    setIp(a, 'eth0', '192.168.0.1/24');
    setIp(b, 'eth0', '192.168.0.2/24');
    setIp(c, 'eth0', '192.168.0.3/24');

    const evs = collect(a, 3);
    a.sendEcho(ip('192.168.0.2'), 3, 1);
    net.scheduler.advanceTo(10_000);

    expect(evs[0]?.type).toBe('reply');
    // MAC table keys are "vlan|mac"; default access VLAN is 1.
    expect(sw.macTable.get(`1|${a.getInterface('eth0')!.mac}`)).toBeTruthy();
    expect(sw.macTable.get(`1|${b.getInterface('eth0')!.mac}`)).toBeTruthy();
  });
});

function buildRoutedPair(net: Network): { pc1: Host; pc2: Host; r1: RouterDevice } {
  const pc1 = createDevice(net, 'host') as Host;
  const r1 = createDevice(net, 'router') as RouterDevice;
  const pc2 = createDevice(net, 'host') as Host;
  net.connect(pc1.id, r1.id); // r1 eth0
  net.connect(pc2.id, r1.id); // r1 eth1
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(r1, 'eth0', '192.168.1.1/24');
  setIp(r1, 'eth1', '10.0.0.1/24');
  setIp(pc2, 'eth0', '10.0.0.20/24');
  expect(pc1.addRoute(0, 0, ip('192.168.1.1'))).toBeNull();
  expect(pc2.addRoute(0, 0, ip('10.0.0.1'))).toBeNull();
  return { pc1, pc2, r1 };
}

describe('routing', () => {
  it('forwards between subnets and decrements TTL', () => {
    const net = new Network();
    const { pc1 } = buildRoutedPair(net);
    const evs = collect(pc1, 9);
    pc1.sendEcho(ip('10.0.0.20'), 9, 1);
    net.scheduler.advanceTo(20_000);
    expect(evs[0]?.type).toBe('reply');
    if (evs[0]?.type === 'reply') expect(evs[0].ttl).toBe(63);
  });

  it('returns "Network is unreachable" when no route matches', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, b.id);
    setIp(a, 'eth0', '10.0.0.1/24');
    expect(a.sendEcho(ip('8.8.8.8'), 1, 1)).toBe('Network is unreachable');
  });

  it('reports Destination Host Unreachable when ARP fails', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, b.id);
    setIp(a, 'eth0', '10.0.0.1/24');
    // b has no IP, so nobody answers ARP for 10.0.0.9.
    const evs = collect(a, 4);
    expect(a.sendEcho(ip('10.0.0.9'), 4, 1)).toBeNull();
    net.scheduler.advanceTo(10_000);
    expect(evs[0]?.type).toBe('send-error');
    if (evs[0]?.type === 'send-error') expect(evs[0].message).toBe('Destination Host Unreachable');
  });

  it('rejects a static route via an unreachable gateway', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    setIp(a, 'eth0', '10.0.0.1/24');
    expect(a.addRoute(0, 0, ip('172.16.0.1'))).toBe('Error: Nexthop has invalid gateway.');
  });

  it('longest prefix match beats the default route', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, b.id);
    setIp(a, 'eth0', '10.0.0.1/24');
    expect(a.addRoute(0, 0, ip('10.0.0.254'))).toBeNull();
    expect(a.addRoute(ip('172.16.0.0'), 16, ip('10.0.0.253'))).toBeNull();
    expect(a.lookupRoute(ip('172.16.5.5'))?.via).toBe(ip('10.0.0.253'));
    expect(a.lookupRoute(ip('8.8.8.8'))?.via).toBe(ip('10.0.0.254'));
  });
});

describe('TTL expiry', () => {
  it('emits time-exceeded from each router in a chain', () => {
    const net = new Network();
    const pc1 = createDevice(net, 'host') as Host;
    const r1 = createDevice(net, 'router') as RouterDevice;
    const r2 = createDevice(net, 'router') as RouterDevice;
    const pc2 = createDevice(net, 'host') as Host;
    net.connect(pc1.id, r1.id); // r1 eth0
    net.connect(r1.id, r2.id); // r1 eth1 - r2 eth0
    net.connect(pc2.id, r2.id); // r2 eth1
    setIp(pc1, 'eth0', '192.168.1.10/24');
    setIp(r1, 'eth0', '192.168.1.1/24');
    setIp(r1, 'eth1', '10.0.12.1/30');
    setIp(r2, 'eth0', '10.0.12.2/30');
    setIp(r2, 'eth1', '172.16.0.1/24');
    setIp(pc2, 'eth0', '172.16.0.20/24');
    expect(pc1.addRoute(0, 0, ip('192.168.1.1'))).toBeNull();
    expect(pc2.addRoute(0, 0, ip('172.16.0.1'))).toBeNull();
    expect(r1.addRoute(ip('172.16.0.0'), 24, ip('10.0.12.2'))).toBeNull();
    expect(r2.addRoute(ip('192.168.1.0'), 24, ip('10.0.12.1'))).toBeNull();

    const evs1 = collect(pc1, 11);
    pc1.sendEcho(ip('172.16.0.20'), 11, 1, 1);
    net.scheduler.advanceTo(20_000);
    expect(evs1[0]?.type).toBe('time-exceeded');
    if (evs1[0]?.type === 'time-exceeded') expect(evs1[0].from).toBe(ip('192.168.1.1'));

    const evs2 = collect(pc1, 12);
    pc1.sendEcho(ip('172.16.0.20'), 12, 1, 2);
    net.scheduler.advanceTo(40_000);
    expect(evs2[0]?.type).toBe('time-exceeded');
    if (evs2[0]?.type === 'time-exceeded') expect(evs2[0].from).toBe(ip('10.0.12.2'));

    const evs3 = collect(pc1, 13);
    pc1.sendEcho(ip('172.16.0.20'), 13, 1, 64);
    net.scheduler.advanceTo(60_000);
    expect(evs3[0]?.type).toBe('reply');
    if (evs3[0]?.type === 'reply') expect(evs3[0].ttl).toBe(62);
  });
});
