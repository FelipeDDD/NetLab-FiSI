import { expect, it, vi } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import { parseIp } from './engine/ip';
import { emptyIpv4, parseStaticIpv4 } from './engine/ipv4Config';
import { defaultRouteSummary, hostDnsSummary, hostGatewaySummary, selectedDefaultGateway } from './hostNetworkSummary';

it('shows only an unambiguous selected gateway on the matching interface without changing independent settings', () => {
  const net = new Network(), d = createDevice(net, 'router') as IpDevice;
  const a = createDevice(net, 'host'), b = createDevice(net, 'host');
  net.connect(d.id, a.id, { aIface: 'eth0' }); net.connect(d.id, b.id, { aIface: 'eth1' });
  const [first, second] = d.interfaces;
  first.configureIpv4(parseStaticIpv4('192.168.1.10', '24', '', '')!);
  second.configureIpv4(parseStaticIpv4('192.168.2.10', '24', '', '')!);
  expect(selectedDefaultGateway(d, first)).toBeNull();
  d.addRoute(0, 0, ip('192.168.1.1'), 'eth0');
  expect(selectedDefaultGateway(d, first)).toBe(ip('192.168.1.1'));
  expect(selectedDefaultGateway(d, second)).toBeNull(); expect(first.gateway).toBeNull();
  first.gateway = ip('192.168.1.1'); // Same next hop, independent ownership; no ambiguity.
  expect(selectedDefaultGateway(d, first)).toBe(ip('192.168.1.1'));
  second.gateway = ip('192.168.2.1');
  const before = structuredClone(d.staticRoutes);
  expect(selectedDefaultGateway(d, first)).toBeNull(); expect(selectedDefaultGateway(d, second)).toBeNull();
  expect(defaultRouteSummary(d, first).selected?.via).toBe(ip('192.168.1.1')); // Netzwerk retains the engine's deterministic choice.
  first.up = false;
  expect(selectedDefaultGateway(d, second)).toBe(ip('192.168.2.1'));
  expect(d.staticRoutes).toEqual(before); expect(second.gateway).toBe(ip('192.168.2.1'));
});

it('explains the actual default selection without copying explicit routes into the IPv4 field', () => {
  const net = new Network(), d = createDevice(net, 'router') as IpDevice;
  const a = createDevice(net, 'host'), b = createDevice(net, 'host');
  net.connect(d.id, a.id, { aIface: 'eth0' }); net.connect(d.id, b.id, { aIface: 'eth1' });
  const [first, second] = d.interfaces;
  first.configureIpv4(parseStaticIpv4('192.168.10.50', '24', '', '')!);
  second.configureIpv4(parseStaticIpv4('192.168.11.50', '24', '192.168.11.1', '')!);
  d.addRoute(0, 0, ip('192.168.10.254'), 'eth0');
  const before = structuredClone(d.staticRoutes);
  let summary = defaultRouteSummary(d, first);
  expect(first.gateway).toBeNull(); expect(summary.explicit).toEqual(before);
  expect(summary.selected?.via).toBe(ip('192.168.10.254')); expect(summary.selectedSource).toBe('Explizite Route'); expect(summary.multiple).toBe(true);
  first.up = false; summary = defaultRouteSummary(d, first);
  expect(summary.selected?.ifaceName).toBe('eth1'); expect(summary.selectedSource).toBe('Schnittstellen-Gateway');
  d.staticRoutes = []; second.gateway = null;
  expect(defaultRouteSummary(d, second).selected).toBeNull();
});

it('uses engine route order including RIP and specific routes instead of testing a fixed sample IP', () => {
  const net = new Network(), d = createDevice(net, 'router') as IpDevice, host = createDevice(net, 'host');
  net.connect(d.id, host.id, { aIface: 'eth0' });
  d.interfaces[0].configureIpv4(parseStaticIpv4('192.168.10.50', '24', '', '')!);
  const routes = d.routes.bind(d);
  vi.spyOn(d, 'routes').mockImplementation(() => [...routes(), { dest: 0, prefix: 0, via: ip('192.168.10.1'), ifaceName: 'eth0', kind: 'rip', metric: 2 }]);
  d.addRoute(0, 1, ip('192.168.10.2'), 'eth0');
  expect(defaultRouteSummary(d, d.interfaces[0]).selectedSource).toBe('RIP');
  expect(selectedDefaultGateway(d, d.interfaces[0])).toBe(ip('192.168.10.1'));
  d.addRoute(ip('128.0.0.0'), 1, ip('192.168.10.3'), 'eth0');
  expect(defaultRouteSummary(d, d.interfaces[0]).selected).toBeNull(); // two /1 routes cover all destinations
  expect(selectedDefaultGateway(d, d.interfaces[0])).toBeNull();
});

const ip = (value: string) => parseIp(value)!;

it('explains explicit gateway/global DNS with empty interface fields without migrating them into the config', () => {
  const d = createDevice(new Network(), 'host') as IpDevice, iface = d.interfaces[0];
  iface.configureIpv4(parseStaticIpv4('192.168.1.10', '/24', '', '')!);
  expect(d.addRoute(0, 0, ip('192.168.1.1'), iface.name)).toBeNull(); d.nameserver = ip('10.0.0.20');
  const before = iface.ipv4, routes = structuredClone(d.staticRoutes);
  expect(hostGatewaySummary(d, iface)).toEqual([{ value: ip('192.168.1.1'), source: 'Explizite Route' }]);
  expect(hostDnsSummary(d, iface)).toEqual({ value: ip('10.0.0.20'), source: 'Globaler Override' });
  expect(iface.ipv4).toEqual(before); expect(iface.gateway).toBeNull(); expect(iface.dns).toBeNull();
  iface.configureIpv4(parseStaticIpv4('192.168.1.12', '/24', '192.168.1.2', '10.0.0.30')!);
  expect(hostGatewaySummary(d, iface)).toEqual([
    { value: ip('192.168.1.1'), source: 'Explizite Route' }, { value: ip('192.168.1.2'), source: 'Statisch · Schnittstelle' },
  ]);
  expect(hostDnsSummary(d, iface)?.value).toBe(ip('10.0.0.20'));
  expect(d.staticRoutes).toEqual(routes);
});

it('keeps identical route/interface addresses identifiable by their independent ownership', () => {
  const d = createDevice(new Network(), 'host') as IpDevice, iface = d.interfaces[0];
  iface.configureIpv4(parseStaticIpv4('192.168.1.10', '/24', '192.168.1.1', '')!);
  expect(d.addRoute(0, 0, ip('192.168.1.1'), iface.name)).toBeNull();
  expect(hostGatewaySummary(d, iface).map((v) => v.source)).toEqual(['Explizite Route', 'Statisch · Schnittstelle']);
  expect(d.routes().filter((r) => r.prefix === 0)).toHaveLength(1);
});

it('labels DHCP and the actual DNS source interface, honoring resolver order and global override', () => {
  const d = createDevice(new Network(), 'router') as IpDevice, [a, b] = d.interfaces;
  a.configureIpv4(emptyIpv4('dhcp'));
  b.configureIpv4(parseStaticIpv4('192.168.2.10', '24', '', '10.0.0.2')!);
  expect(hostDnsSummary(d, a)).toEqual({ value: ip('10.0.0.2'), source: 'Statisch · Schnittstelle · eth1' });
  a.configureIpv4({ ...parseStaticIpv4('192.168.1.10', '24', '192.168.1.1', '10.0.0.1')!, mode: 'dhcp' });
  expect(hostGatewaySummary(d, a)).toEqual([{ value: ip('192.168.1.1'), source: 'DHCP' }]);
  expect(hostDnsSummary(d, a)).toEqual({ value: ip('10.0.0.1'), source: 'DHCP' });
  a.up = false;
  expect(hostGatewaySummary(d, a)).toEqual([]);
  expect(hostDnsSummary(d, a)?.value).toBe(d.nameserver);
  d.nameserver = 0;
  expect(hostDnsSummary(d, a)).toEqual({ value: 0, source: 'Globaler Override' });
  d.nameserver = null; b.ip = null;
  expect(hostDnsSummary(d, a)).toBeNull();
});
