import { describe, expect, it, vi } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, IpDevice } from './ipdevice';
import { SwitchDevice } from './switch';
import { parseCidr, parseIp } from './ip';
import { restoreNetwork, serializeNetwork } from './serialize';
import { Shell } from '../commands/shell';
import { PacketCapture } from '../packetCapture';
import { dhcpGlobalFixture } from '../testing/dhcpGlobalFixture';

const ip = (address: string) => parseIp(address)!;
function pair(os: 'linux' | 'windows' = 'linux') {
  const net = new Network(), a = createDevice(net, 'host', { os }) as Host;
  const b = createDevice(net, 'host') as Host, sw = createDevice(net, 'switch') as SwitchDevice;
  a.interfaces[0].ip = parseCidr('192.168.1.10/24'); b.interfaces[0].ip = parseCidr('192.168.1.20/24');
  net.connect(a.id, sw.id); net.connect(b.id, sw.id);
  const capture = new PacketCapture(() => {});
  net.onWireTransfer = (transfer, context) => capture.observe(transfer, context);
  return { net, a, b, sw, capture };
}
function command(device: IpDevice, text: string) {
  let output = '';
  const done = vi.fn(), running = new Shell(device).exec(text, { write: s => output += s }, done);
  expect(running).toBeNull(); expect(done).toHaveBeenCalledOnce();
  return output;
}
function ping(net: Network, a: IpDevice, address: number) {
  a.sendEcho(address, 91, 1); net.scheduler.advanceTo(net.now + 1200);
}

describe('ARP cache removal on the existing engine', () => {
  it.each(['linux', 'windows'] as const)('%s clears learned mappings only and the next ping produces captured ARP Request/Reply', os => {
    const { net, a, b, sw, capture } = pair(os);
    ping(net, a, ip('192.168.1.20'));
    expect(a.arpTable.get(ip('192.168.1.20'))?.mac).toBe(b.interfaces[0].mac);
    const otherCache = [...b.arpTable], macs = [...sw.macTable], saved = serializeNetwork(net, {});
    b.dhcpServer = { enabled: true, rangeStart: ip('192.168.1.100'), rangeEnd: ip('192.168.1.110'), router: null, dns: null, leases: new Map([['client-mac', ip('192.168.1.100')]]) };
    const leases = [...b.dhcpServer.leases];
    const method = vi.spyOn(a, 'clearArpCache');
    expect(command(a, os === 'linux' ? 'ip neigh show' : 'arp -a')).toContain('192.168.1.20');
    capture.start(); const time = net.now, pending = net.scheduler.pending;
    expect(command(a, os === 'linux' ? 'ip neigh flush all' : 'arp -d *')).toBe('');
    expect(method).toHaveBeenCalledOnce(); expect(a.arpTable.size).toBe(0);
    expect(net.now).toBe(time); expect(net.scheduler.pending).toBe(pending);
    expect([...b.arpTable]).toEqual(otherCache); expect([...sw.macTable]).toEqual(macs);
    expect([...b.dhcpServer.leases]).toEqual(leases);
    expect(serializeNetwork(net, {}).devices.find(d => d.id === a.id)).toEqual(saved.devices.find(d => d.id === a.id));
    capture.stop(); expect(capture.state.records).toHaveLength(0);
    capture.start(); ping(net, a, ip('192.168.1.20')); capture.stop();
    const frames = capture.state.records.map(r => r.frame.payload);
    expect(frames.some(p => p.kind === 'arp' && p.op === 'request' && p.senderIp === ip('192.168.1.10') && p.targetIp === ip('192.168.1.20'))).toBe(true);
    expect(frames.some(p => p.kind === 'arp' && p.op === 'reply' && p.senderIp === ip('192.168.1.20'))).toBe(true);
    expect(a.arpTable.has(ip('192.168.1.20'))).toBe(true);
    expect(a.interfaces[0].up && b.interfaces[0].up).toBe(true);
  });

  it('filters a three-interface Router by learned interface, preserving other caches, leases and configuration', () => {
    const { net, router, clients, switches } = dhcpGlobalFixture();
    clients.forEach((client, n) => {
      client.addIp('eth0', ip(`10.20.${n + 1}.20`), 24);
      ping(net, router, ip(`10.20.${n + 1}.20`));
    });
    expect(router.arpTable.size).toBe(3);
    router.dhcpPools.get('eth0')!.leases.set('client', ip('10.20.1.100'));
    const config = serializeNetwork(net, {}), peers = clients.map(d => [...d.arpTable]);
    const macs = switches.map(d => [...(d as SwitchDevice).macTable]);
    expect(command(router, 'ip neigh show dev eth0')).toContain('10.20.1.20');
    expect(command(router, 'ip neigh show dev eth0')).not.toContain('10.20.2.20');
    expect(command(router, 'ip neigh flush dev eth0')).toBe('');
    expect([...router.arpTable.keys()]).toEqual([ip('10.20.2.20'), ip('10.20.3.20')]);
    expect(command(router, 'ip neigh flush dev eth0')).toBe('');
    expect(command(router, 'ip neigh flush dev missing')).toContain('Cannot find device');
    expect(clients.map(d => [...d.arpTable])).toEqual(peers);
    expect(switches.map(d => [...(d as SwitchDevice).macTable])).toEqual(macs);
    expect(router.dhcpPools.get('eth0')!.leases.get('client')).toBe(ip('10.20.1.100'));
    expect(serializeNetwork(net, {})).toEqual(config);
    expect(router.clearArpCache()).toBe(2); expect(router.clearArpCache()).toBe(0);
  });

  it('does not cancel a pending ARP exchange or invent a reply when the cache is cleared', () => {
    const { net, a, b } = pair();
    a.sendEcho(ip('192.168.1.20'), 1, 1);
    const count = net.scheduler.pending;
    expect(a.clearArpCache()).toBe(0); expect(net.scheduler.pending).toBe(count);
    net.scheduler.advanceTo(1200);
    expect(a.arpTable.get(ip('192.168.1.20'))?.mac).toBe(b.interfaces[0].mac);
  });

  it('never serializes runtime caches and starts restored networks empty without changing the original', () => {
    const { net, a, b } = pair(); ping(net, a, ip('192.168.1.20'));
    const saved = serializeNetwork(net, {}), restored = restoreNetwork(saved);
    expect(JSON.stringify(saved)).not.toContain('arpTable');
    expect((restored.devices.get(a.id) as IpDevice).arpTable.size).toBe(0);
    expect((restored.devices.get(b.id) as IpDevice).arpTable.size).toBe(0);
    expect(a.arpTable.size).toBe(1); expect(b.arpTable.size).toBe(1);
  });
});

describe('strict ARP command argument validation', () => {
  it.each(['ip neigh xyz', 'ip neigh flush', 'ip neigh flush dev', 'ip neigh flush all extra', 'ip neigh flush dev eth0 extra',
    'ip neigh show extra', 'ip neigh show dev missing', 'ip neigh flush dev missing', 'ip neigh flush to 192.168.1.20',
    'ip neigh flush nud permanent', 'arp -d', 'arp -d 192.168.1.20', 'arp -s 192.168.1.20 aa:bb:cc:dd:ee:ff', 'arp -a extra', 'arp xyz'])(
    'rejects Linux %j without displaying or deleting entries', line => {
      const { a } = pair(); a.arpTable.set(ip('192.168.1.20'), { mac: '00:11:22:33:44:55', ifaceName: 'eth0', at: 0 });
      const before = [...a.arpTable], clear = vi.spyOn(a, 'clearArpCache');
      expect(command(a, line)).toMatch(/Error:|Cannot find device|Unsupported/);
      expect(command(a, line)).not.toContain('lladdr');
      expect([...a.arpTable]).toEqual(before); expect(clear).not.toHaveBeenCalled();
    });

  it.each(['arp', 'arp -d', 'arp -d 999.1.1.1', 'arp -d 192.168.1.20/24', 'arp -d missing', 'arp -d ::1',
    'arp -d * extra', 'arp -a extra', 'arp -s 192.168.1.20 aa-bb-cc-dd-ee-ff', 'arp xyz', 'arp -d 192.168.1.20 eth0'])(
    'rejects Windows %j without displaying or deleting entries', line => {
      const { a } = pair('windows'); a.arpTable.set(ip('192.168.1.20'), { mac: '00:11:22:33:44:55', ifaceName: 'eth0', at: 0 });
      const before = [...a.arpTable], clear = vi.spyOn(a, 'clearArpCache');
      expect(command(a, line)).toMatch(/Usage:|Invalid IPv4/);
      expect([...a.arpTable]).toEqual(before); expect(clear).not.toHaveBeenCalled();
    });

  it('deletes only the requested Windows IPv4 entry, reports a miss and handles an empty wildcard flush', () => {
    const { a } = pair('windows');
    for (const address of ['192.168.1.20', '192.168.1.21', '0.0.0.0']) a.arpTable.set(ip(address), { mac: '00:11:22:33:44:55', ifaceName: 'eth0', at: 0 });
    expect(command(a, 'ARP -D 192.168.1.20')).toBe('');
    expect([...a.arpTable.keys()]).toEqual([ip('192.168.1.21'), 0]);
    expect(command(a, 'arp -d 192.168.1.20')).toContain('not found');
    expect(command(a, 'arp -d 0.0.0.0')).toBe(''); expect(a.arpTable.has(0)).toBe(false);
    expect(command(a, 'arp -d *')).toBe(''); expect(command(a, 'arp -d *')).toBe('');
    expect(command(a, 'arp -a')).toContain('No ARP Entries');
  });

  it('preserves supported Linux reads and documents real commands with German descriptions in both help texts', () => {
    const { a } = pair();
    expect(command(a, 'ip neigh')).toBe('');
    expect(command(a, 'ip neighbour show')).toBe('');
    for (const line of ['arp', 'arp -a', 'arp -n', 'arp -an', 'arp -na']) expect(command(a, line)).toContain('HWaddress');
    expect(command(a, 'help')).toContain('ip neigh flush dev eth0');
    expect(command(a, 'help')).toContain('Dynamischen ARP-Cache');
    a.os = 'windows'; expect(command(a, 'help')).toContain('arp -d 192.168.1.20');
    expect(command(a, 'help')).toContain('arp -d *');
  });
});
