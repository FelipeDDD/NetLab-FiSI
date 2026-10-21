import { describe, expect, it, vi } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, IpDevice } from './ipdevice';
import { parseCidr, parseIp } from './ip';
import { emptyIpv4, parseStaticIpv4 } from './ipv4Config';
import { restoreNetwork, serializeNetwork } from './serialize';
import { Shell } from '../commands/shell';
import { runDhclient } from '../commands/dhclient';
import { applyInspectorEdit } from '../topologyEdits';
import type { InspectorOperation } from '../topologyHistory';

const ip = (s: string) => parseIp(s)!;
function lab() {
  const net = new Network(), client = createDevice(net, 'host', { os: 'windows' }) as Host;
  const server = createDevice(net, 'server') as IpDevice;
  net.connect(client.id, server.id);
  server.interfaces[0].ip = parseCidr('10.0.0.1/24');
  server.dhcpServer = { enabled: true, rangeStart: ip('10.0.0.100'), rangeEnd: ip('10.0.0.110'),
    router: ip('10.0.0.1'), dns: ip('10.0.0.2'), leases: new Map() };
  return { net, client, server, iface: client.interfaces[0] };
}
function command(device: IpDevice, text: string) {
  let output = '';
  const done = vi.fn();
  new Shell(device).exec(text, { write: (s) => { output += s; } }, done);
  device.network.scheduler.advanceTo(device.network.now + 10_000);
  expect(done).toHaveBeenCalledOnce();
  return output;
}

describe('per-interface IPv4 configuration', () => {
  it('protects static and unconfigured Windows adapters from renew/release', () => {
    const { client, iface, server } = lab();
    expect(command(client, 'ipconfig /renew')).toContain('DHCP is not enabled');
    expect(iface.ipv4Mode).toBe('unconfigured'); expect(iface.ip).toBeNull();
    const config = parseStaticIpv4('10.0.0.50', '255.255.255.0', '10.0.0.1', '10.0.0.3')!;
    iface.configureIpv4(config);
    command(client, 'ipconfig /renew'); command(client, 'ipconfig /release');
    expect(iface.ipv4).toEqual(config); expect(server.dhcpServer!.leases.size).toBe(0);
    expect(command(client, 'ipconfig /all')).toMatch(/DHCP Enabled.*No/);
  });

  it('acquires, renews and releases only interface-owned values and a real server lease', () => {
    const { client, iface, server } = lab();
    iface.configureIpv4(emptyIpv4('dhcp'));
    client.staticRoutes.push({ dest: ip('192.0.2.0'), prefix: 24, via: ip('10.0.0.1'), ifaceName: 'eth0', kind: 'static' });
    const route = client.staticRoutes[0];
    command(client, 'ipconfig /renew');
    expect(iface.ipv4).toEqual({ mode: 'dhcp', ip: parseCidr('10.0.0.100/24'), gateway: ip('10.0.0.1'), dns: ip('10.0.0.2') });
    expect(iface.dhcpLease).not.toBeNull(); expect(client.nameserver).toBe(ip('10.0.0.2'));
    command(client, 'ipconfig /renew');
    expect(client.routes().filter((r) => r.prefix === 0)).toHaveLength(1);
    expect(command(client, 'ipconfig /all')).toMatch(/DHCP Enabled.*Yes/);
    command(client, 'ipconfig /release');
    expect(iface.ipv4).toEqual(emptyIpv4('dhcp')); expect(iface.dhcpLease).toBeNull();
    expect(client.nameserver).toBeNull(); expect(server.dhcpServer!.leases.size).toBe(0);
    expect(client.staticRoutes).toEqual([route]); expect(client.staticRoutes[0]).toBe(route);
  });

  it('Linux dhclient changes the mode immediately, drops manual interface options and times out without inventing an IP', () => {
    const { client, iface, net, server } = lab(); client.os = 'linux';
    iface.configureIpv4(parseStaticIpv4('10.0.0.50', '24', '10.0.0.1', '10.0.0.3')!);
    server.dhcpServer!.enabled = false;
    net.onClientConfiguration = vi.fn();
    const done = vi.fn(); runDhclient(client, [], () => {}, done);
    expect(iface.ipv4).toEqual(emptyIpv4('dhcp'));
    expect(net.onClientConfiguration).toHaveBeenCalledOnce();
    net.scheduler.advanceTo(10_000);
    expect(done).toHaveBeenCalledOnce(); expect(iface.dhcpLease).toBeNull(); expect(iface.cancelDhcp).toBeNull();
    expect(iface.ip).toBeNull(); expect(iface.ipv4Mode).toBe('dhcp');
  });

  it('DHCP without options clears old lease options without touching other interfaces or explicit global settings', () => {
    const { net, server } = lab();
    const client = createDevice(net, 'router') as IpDevice;
    net.disconnect(server.interfaces[0].link!.id);
    net.connect(client.id, server.id, { aIface: 'eth0', bIface: 'eth0' });
    const [first, other] = client.interfaces;
    other.configureIpv4(parseStaticIpv4('192.168.1.10', '24', '192.168.1.1', '192.168.1.2')!);
    const savedOther = other.ipv4;
    first.configureIpv4(emptyIpv4('dhcp'));
    command(client, 'dhclient eth0');
    expect(first.dns).toBe(ip('10.0.0.2'));
    client.nameserver = ip('203.0.113.53');
    server.dhcpServer!.router = null; server.dhcpServer!.dns = null;
    command(client, 'dhclient eth0');
    expect(first.gateway).toBeNull(); expect(first.dns).toBeNull();
    expect(other.ipv4).toEqual(savedOther); expect(client.nameserver).toBe(ip('203.0.113.53'));
    expect(client.routes().filter((r) => r.prefix === 0)).toMatchObject([{ ifaceName: 'eth1', via: ip('192.168.1.1') }]);
    first.configureIpv4(parseStaticIpv4('10.0.0.20', '/24', '', '')!);
    expect(other.ipv4).toEqual(savedOther); expect(client.nameserver).toBe(ip('203.0.113.53'));
  });

  it('cancels in-flight DHCP before a static change so a late ACK cannot replace it', () => {
    const { client, iface, net } = lab();
    iface.configureIpv4(emptyIpv4('dhcp'));
    const send = vi.spyOn(client, 'sendDhcpClient'), done = vi.fn();
    runDhclient(client, [], () => {}, done);
    while (send.mock.calls.length < 2 && net.now < 5000) net.scheduler.advanceTo(net.now + 10);
    expect(send.mock.calls.at(-1)?.[1].op).toBe('request');
    const config = parseStaticIpv4('10.0.0.55', '24', '', '')!;
    iface.configureIpv4(config); net.scheduler.advanceTo(net.now + 10_000);
    expect(iface.ipv4).toEqual(config); expect(iface.dhcpLease).toBeNull();
    expect(client.dhcpListeners.size).toBe(0); expect(done).toHaveBeenCalledOnce();
  });

  it('roundtrips all modes and options without resurrecting leases, and infers legacy modes', () => {
    const { net, client, iface } = lab();
    iface.configureIpv4(emptyIpv4('dhcp')); command(client, 'ipconfig /renew');
    const saved = serializeNetwork(net, {}), restored = restoreNetwork(saved);
    const copy = restored.devices.get(client.id)!.interfaces[0];
    expect(copy.ipv4).toEqual(iface.ipv4); expect(copy.dhcpLease).toBeNull();
    expect(serializeNetwork(restored, {})).toEqual(saved);
    iface.configureIpv4(emptyIpv4('dhcp'));
    expect(restoreNetwork(serializeNetwork(net, {})).devices.get(client.id)!.interfaces[0].ipv4Mode).toBe('dhcp');
    for (const d of saved.devices) for (const i of d.ifaces) { delete i.ipv4Mode; delete i.gateway; delete i.dns; }
    expect(restoreNetwork(saved).devices.get(client.id)!.interfaces[0].ipv4Mode).toBe('static');
    saved.devices.find((d) => d.id === client.id)!.ifaces[0].ip = null;
    expect(restoreNetwork(saved).devices.get(client.id)!.interfaces[0].ipv4Mode).toBe('unconfigured');
  });

  it('replays atomic config edits on the same interface and rejects stale history', () => {
    const { net, client, iface } = lab();
    const before = parseStaticIpv4('10.0.0.50', '24', '10.0.0.1', '10.0.0.2')!, after = emptyIpv4('dhcp');
    iface.configureIpv4(after);
    const operation: InspectorOperation = { type: 'set-interface-ipv4', label: 'IPv4', deviceId: client.id, ifaceName: iface.name, before, after };
    expect(applyInspectorEdit(net, operation, 'undo')).toBe(true); expect(iface.ipv4).toEqual(before);
    expect(applyInspectorEdit(net, operation, 'redo')).toBe(true); expect(iface.ipv4).toEqual(after);
    expect(client.interfaces[0]).toBe(iface); expect(net.devices.get(client.id)).toBe(client);
    iface.ip = parseCidr('10.0.0.77/24');
    expect(applyInspectorEdit(net, operation, 'undo')).toBe(false);
  });

  it('validates complete static forms including masks and optional options before mutation', () => {
    expect(parseStaticIpv4('10.0.0.5', '255.255.255.0', '', '')).toEqual(parseStaticIpv4('10.0.0.5', '/24', '', ''));
    for (const mask of ['255.0.255.0', '33', '', 'wat']) expect(parseStaticIpv4('10.0.0.5', mask, '', '')).toBeNull();
    expect(parseStaticIpv4('bad', '24', '', '')).toBeNull();
    expect(parseStaticIpv4('10.0.0.5', '24', '10.1.0.1', '')).toBeNull();
    expect(parseStaticIpv4('10.0.0.5', '24', '', 'bad')).toBeNull();
  });
});
