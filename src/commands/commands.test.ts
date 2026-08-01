import { describe, expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { Host, RouterDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from './shell';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: Host | RouterDevice, ifname: string, cidr: string): void {
  dev.getInterface(ifname)!.ip = parseCidr(cidr)!;
}

// Runs one command line to completion (advancing virtual time) and returns
// everything it wrote.
function run(net: Network, dev: Host | RouterDevice, line: string, advance = 60_000): string {
  const out: string[] = [];
  let finished = false;
  new Shell(dev).exec(line, { write: (s) => out.push(s) }, () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + advance);
  expect(finished).toBe(true);
  return out.join('');
}

function routedChain(net: Network) {
  const pc1 = createDevice(net, 'host') as Host;
  const r1 = createDevice(net, 'router') as RouterDevice;
  const r2 = createDevice(net, 'router') as RouterDevice;
  const pc2 = createDevice(net, 'host') as Host;
  net.connect(pc1.id, r1.id);
  net.connect(r1.id, r2.id);
  net.connect(pc2.id, r2.id);
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(r1, 'eth0', '192.168.1.1/24');
  setIp(r1, 'eth1', '10.0.12.1/30');
  setIp(r2, 'eth0', '10.0.12.2/30');
  setIp(r2, 'eth1', '172.16.0.1/24');
  setIp(pc2, 'eth0', '172.16.0.20/24');
  pc1.addRoute(0, 0, ip('192.168.1.1'));
  pc2.addRoute(0, 0, ip('172.16.0.1'));
  r1.addRoute(ip('172.16.0.0'), 24, ip('10.0.12.2'));
  r2.addRoute(ip('192.168.1.0'), 24, ip('10.0.12.1'));
  return { pc1, pc2, r1, r2 };
}

describe('ip command', () => {
  it('adds and shows an address', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(run(net, pc, 'ip address add 192.168.7.1/24 dev eth0')).toBe('');
    expect(run(net, pc, 'ip addr')).toContain('inet 192.168.7.1/24');
    expect(run(net, pc, 'ip a')).toContain('inet 192.168.7.1/24');
  });

  it('requires the dev argument like iproute2', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(run(net, pc, 'ip address add 192.168.7.1/24')).toContain('"dev" argument is required');
  });

  it('rejects a route via an invalid gateway', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    setIp(pc, 'eth0', '10.0.0.1/24');
    expect(run(net, pc, 'ip route add default via 172.16.0.1')).toContain(
      'Nexthop has invalid gateway',
    );
  });

  it('shows connected and static routes', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    const other = createDevice(net, 'host') as Host;
    net.connect(pc.id, other.id);
    setIp(pc, 'eth0', '10.0.0.1/24');
    expect(run(net, pc, 'ip route add default via 10.0.0.254')).toBe('');
    const table = run(net, pc, 'ip route');
    expect(table).toContain('default via 10.0.0.254 dev eth0');
    expect(table).toContain('10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.1');
  });

  it('errors loudly on unsupported syntax', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(run(net, pc, 'ip xfrm state')).toContain('is not supported');
    expect(run(net, pc, 'ip route flush cache')).toContain('is not supported');
  });
});

describe('ping command', () => {
  it('prints replies and statistics', () => {
    const net = new Network();
    const { pc1 } = routedChain(net);
    const out = run(net, pc1, 'ping -c 2 172.16.0.20');
    expect(out).toContain('PING 172.16.0.20');
    expect(out).toContain('icmp_seq=1');
    expect(out).toContain('icmp_seq=2');
    expect(out).toContain('ttl=62');
    expect(out).toContain('2 packets transmitted, 2 received, 0% packet loss');
  });

  it('reports resolution failure when no nameserver is configured', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(run(net, pc, 'ping example.com')).toContain('Temporary failure in name resolution');
  });
});

describe('traceroute command', () => {
  it('lists each router hop then the target', () => {
    const net = new Network();
    const { pc1 } = routedChain(net);
    const out = run(net, pc1, 'traceroute 172.16.0.20', 120_000);
    const lines = out.trim().split('\n');
    expect(lines[0]).toContain('traceroute to 172.16.0.20');
    expect(lines[1]).toContain('192.168.1.1');
    expect(lines[2]).toContain('10.0.12.2');
    expect(lines[3]).toContain('172.16.0.20');
  });
});

describe('sysctl', () => {
  it('toggles IP forwarding', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(pc.forwarding).toBe(false);
    expect(run(net, pc, 'sysctl -w net.ipv4.ip_forward=1')).toContain('net.ipv4.ip_forward = 1');
    expect(pc.forwarding).toBe(true);
    expect(run(net, pc, 'sysctl net.ipv4.ip_forward')).toContain('net.ipv4.ip_forward = 1');
  });
});
