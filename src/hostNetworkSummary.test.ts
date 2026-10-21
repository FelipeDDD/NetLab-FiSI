import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import { parseIp } from './engine/ip';
import { emptyIpv4, parseStaticIpv4 } from './engine/ipv4Config';
import { hostDnsSummary, hostGatewaySummary } from './hostNetworkSummary';

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
