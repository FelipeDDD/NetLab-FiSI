import { describe, expect, it, vi } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { Host, IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from './shell';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { chooseHostOs } from '../hostOs';

function pair(os: 'linux' | 'windows' = 'linux') {
  const net = new Network();
  const a = createDevice(net, 'host', { os: 'windows' }) as Host;
  const b = createDevice(net, 'host', { os }) as Host;
  a.interfaces[0].ip = parseCidr('10.0.0.1/24'); b.interfaces[0].ip = parseCidr('10.0.0.2/24');
  net.connect(a.id, b.id);
  return { net, a, b };
}
function command(device: IpDevice, line: string) {
  const write = vi.fn(), done = vi.fn();
  const running = new Shell(device).exec(line, { write }, done);
  return { write, done, running, text: () => write.mock.calls.map(([s]) => s).join('') };
}
function finish(device: IpDevice, line: string) {
  const result = command(device, line);
  device.network.scheduler.advanceTo(device.network.now + 15000);
  expect(result.done).toHaveBeenCalledOnce();
  return result.text();
}

describe('Windows command presentation on the shared engine', () => {
  it.each(['linux', 'windows'] as const)('sends four default requests to %s with real RTT and TTL', (os) => {
    const { net, a, b } = pair(os);
    const send = vi.spyOn(a, 'sendEcho'), peerSend = vi.spyOn(b, 'sendEcho');
    const win = command(a, 'PiNg 10.0.0.2');
    const peer = command(b, os === 'linux' ? 'ping -c 4 10.0.0.1' : 'ping 10.0.0.1');
    net.scheduler.advanceTo(8000);
    expect(send).toHaveBeenCalledTimes(4); expect(peerSend).toHaveBeenCalledTimes(4);
    expect(win.done).toHaveBeenCalledOnce(); expect(peer.done).toHaveBeenCalledOnce();
    expect(win.text()).toContain('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)');
    expect(win.text()).toContain('time=160.0ms TTL=64');
    expect(win.text()).not.toMatch(/bytes|icmp_seq|rtt min/);
    expect(peer.text()).toContain(os === 'linux' ? '4 packets transmitted' : 'Packets: Sent = 4');
  });

  it('supports -n, continuous -t and idempotent cancellation, with no later output or sends', () => {
    const { net, a } = pair();
    expect(finish(a, 'ping -n 2 10.0.0.2')).toContain('Sent = 2, Received = 2');
    const send = vi.spyOn(a, 'sendEcho'), result = command(a, 'ping -t 10.0.0.2');
    net.scheduler.advanceTo(net.now + 5500);
    expect(send).toHaveBeenCalledTimes(6); expect(result.done).not.toHaveBeenCalled();
    result.running!.cancel(); result.running!.cancel();
    const text = result.text(); net.scheduler.advanceTo(net.now + 10000);
    expect(result.text()).toBe(text); expect(send).toHaveBeenCalledTimes(6); expect(result.done).toHaveBeenCalledOnce();
  });

  it('reports four missing replies and local routing errors using real outcomes', () => {
    const { net, a } = pair();
    net.disconnect([...net.links.keys()][0]);
    const missing = finish(a, 'ping 10.0.0.2');
    expect(missing).toContain('Sent = 4, Received = 0, Lost = 4'); expect(missing).not.toContain('time=');
    const unreachable = finish(a, 'ping 192.0.2.1');
    expect(unreachable.match(/PING: transmit failed/g)).toHaveLength(4);
    expect(unreachable).toContain('Sent = 4, Received = 0');
  });

  it('rejects incompatible syntax without sending packets in either shell', () => {
    const { a, b } = pair();
    const send = vi.spyOn(a, 'sendEcho');
    for (const line of ['ip a', 'dig example.test', 'clear', 'traceroute 10.0.0.2']) expect(finish(a, line)).toContain('is not recognized');
    for (const line of ['ping -c 4 10.0.0.2', 'ping -n 0 10.0.0.2', 'ping 10.0.0.2 extra']) expect(finish(a, line)).toMatch(/Invalid option|Bad value|Bad parameter/);
    expect(finish(a, 'ping -n 1e2 10.0.0.2')).toContain('Bad value');
    expect(finish(a, 'ping -t -n 4 10.0.0.2')).toContain('Use either');
    for (const line of ['ipconfig', 'cls', 'tracert 10.0.0.1', 'nslookup example.test']) expect(finish(b, line)).toContain('command not found');
    expect(finish(b, 'ping -t 10.0.0.1')).toContain('supports only');
    expect(send).not.toHaveBeenCalled();
    expect(finish(a, 'ping missing.test')).toContain('Ping request could not find host');
    expect(finish(a, 'CLS')).toBe('\x1b[2J\x1b[H');
    expect(finish(a, 'hostname')).toBe(a.name + '\n');
    expect(finish(a, 'help')).toContain('Windows CMD');
  });

  it('prints only actual configuration, ARP entries and routes', () => {
    const { a } = pair();
    a.addRoute(0, 0, parseIp('10.0.0.2')!); a.nameserver = parseIp('10.0.0.2');
    finish(a, 'ping -n 1 10.0.0.2');
    const output = finish(a, 'IPCONFIG /ALL');
    expect(output).toContain('Ethernet adapter eth0'); expect(output).toContain('255.255.255.0');
    expect(output).toContain(a.interfaces[0].mac.replace(/:/g, '-').toUpperCase());
    expect(output).toContain('DNS Servers'); expect(output).toMatch(/DHCP Enabled.*No/); expect(output).not.toContain('Lease Obtained');
    expect(finish(a, 'arp -a')).toContain('10.0.0.2');
    expect(finish(a, 'route print')).toContain('On-link');
    expect(finish(a, 'route print')).toContain('0.0.0.0');
    expect(finish(a, 'ipconfig /release')).toContain('DHCP is not enabled');
  });

  it('queries real DNS records, NXDOMAIN and timeout, and suppresses cancelled callbacks', () => {
    const { net, a, b } = pair();
    b.dnsServer = { enabled: true, records: new Map([['lab.test', parseIp('10.0.0.2')!]]) };
    a.nameserver = parseIp('10.0.0.2');
    expect(finish(a, 'nslookup lab.test')).toContain('Name:    lab.test\nAddress: 10.0.0.2');
    expect(finish(a, 'nslookup missing.test')).toContain('Non-existent domain');
    const cancelled = command(a, 'nslookup lab.test'); cancelled.running!.cancel();
    const output = cancelled.text(); net.scheduler.advanceTo(net.now + 5000);
    expect(cancelled.text()).toBe(output); expect(cancelled.done).toHaveBeenCalledOnce();
    a.nameserver = parseIp('10.0.0.99');
    expect(finish(a, 'nslookup lab.test')).toContain('timed out');
  });

  it('traces multiple routed hops using the existing TTL probes', () => {
    const net = new Network(), a = createDevice(net, 'host', { os: 'windows' }) as Host;
    const router = createDevice(net, 'router') as IpDevice, b = createDevice(net, 'host') as Host;
    net.connect(a.id, router.id); net.connect(router.id, b.id);
    a.interfaces[0].ip = parseCidr('10.0.0.1/24'); router.interfaces[0].ip = parseCidr('10.0.0.254/24');
    router.interfaces[1].ip = parseCidr('10.0.1.254/24'); b.interfaces[0].ip = parseCidr('10.0.1.1/24');
    a.addRoute(0, 0, parseIp('10.0.0.254')!); b.addRoute(0, 0, parseIp('10.0.1.254')!);
    const output = finish(a, 'tracert 10.0.1.1');
    expect(output).toContain('Tracing route'); expect(output).toContain('10.0.0.254'); expect(output).toContain('Trace complete.');
    expect(output).toMatch(/\n\s+2 .*10\.0\.1\.1/); expect(output).not.toContain('byte packets');
  });

  it('renews through real DHCP and leaves no pending client after cancellation', () => {
    const { net, a, b } = pair(); a.interfaces[0].configureIpv4({ mode: 'dhcp', ip: null, gateway: null, dns: null });
    b.dhcpServer = { enabled: true, rangeStart: parseIp('10.0.0.50')!, rangeEnd: parseIp('10.0.0.60')!, router: parseIp('10.0.0.2'), dns: parseIp('10.0.0.2'), leases: new Map() };
    expect(finish(a, 'ipconfig /renew')).toContain('IPv4 Address: 10.0.0.50');
    expect(a.getInterface('eth0')!.ip?.addr).toBe(parseIp('10.0.0.50')); expect(a.nameserver).toBe(parseIp('10.0.0.2'));
    expect(a.dhcpListeners.size).toBe(0);
    const cancelled = command(a, 'ipconfig /renew'); cancelled.running!.cancel();
    const output = cancelled.text(); net.scheduler.advanceTo(net.now + 10000);
    expect(cancelled.text()).toBe(output); expect(a.dhcpListeners.size).toBe(0); expect(cancelled.done).toHaveBeenCalledOnce();
  });
});

it('persists host OS only, defaults old files to Linux and samples Mixed only on creation', () => {
  const { net, a, b } = pair(); createDevice(net, 'server', { os: 'windows' });
  const saved = serializeNetwork(net, {});
  const restored = restoreNetwork(saved);
  expect((restored.devices.get(a.id) as Host).os).toBe('windows'); expect((restored.devices.get(b.id) as Host).os).toBe('linux');
  expect(saved.devices.find((d) => d.kind === 'server')).not.toHaveProperty('os');
  delete saved.devices[0].os;
  expect((restoreNetwork(saved).devices.get(a.id) as Host).os).toBe('linux');
  const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
  expect(chooseHostOs('linux', random)).toBe('linux'); expect(chooseHostOs('windows', random)).toBe('windows');
  expect(random).not.toHaveBeenCalled();
  expect(chooseHostOs('mixed', random)).toBe('linux'); expect(chooseHostOs('mixed', random)).toBe('windows');
});
