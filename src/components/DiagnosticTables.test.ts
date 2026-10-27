import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import type { IpDevice } from '../engine/ipdevice';
import type { SwitchDevice } from '../engine/switch';
import { parseCidr, parseIp } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';
import { ArpTable, MacTable, RoutingTable } from './DiagnosticTables';

const ip = (address: string) => parseIp(address)!;
const text = (html: string) => html.replace(/<[^>]*>/g, '');
const arp = (device: IpDevice) => renderToStaticMarkup(createElement(ArpTable, { device }));
const routes = (device: IpDevice) => renderToStaticMarkup(createElement(RoutingTable, { device }));
const mac = (device: SwitchDevice) => renderToStaticMarkup(createElement(MacTable, { device }));
function pair() {
  const net = new Network(), a = createDevice(net, 'host') as IpDevice, b = createDevice(net, 'host') as IpDevice;
  const sw = createDevice(net, 'switch') as SwitchDevice;
  net.connect(a.id, sw.id); net.connect(b.id, sw.id);
  a.interfaces[0].ip = parseCidr('192.168.1.10/24'); b.interfaces[0].ip = parseCidr('192.168.1.20/24');
  return { net, a, b, sw };
}

it('renders native tables, German column headers, empty states and keyboard scroll regions', () => {
  const { a, sw } = pair(); a.interfaces[0].ip = null;
  for (const [html, label, empty] of [[arp(a), 'ARP-Tabelle', 'Keine ARP-Einträge'],
    [routes(a), 'Routing-Tabelle', 'Keine Routen'], [mac(sw), 'MAC-Tabelle', 'Keine MAC-Adressen']] ) {
    expect(html).toContain(`role="region" aria-label="${label}" tabindex="0"`);
    expect(html).toContain('<table'); expect(html).toContain('<caption');
    expect(html).toContain('scope="col"'); expect(html).toContain(empty); expect(html).not.toContain('<pre');
  }
  expect(arp(a)).toContain('IP-Adresse'); expect(arp(a)).toContain('MAC-Adresse');
  expect(mac(sw)).not.toContain('ARP-Cache leeren');
  expect(mac(sw)).toContain('VLAN'); expect(mac(sw)).toContain('Port');
});

it('offers a small ARP clear action when provided by the Inspector, including on an empty cache', () => {
  const { a } = pair();
  const html = renderToStaticMarkup(createElement(ArpTable, { device: a, onClear: () => {} }));
  expect(html).toContain('class="mini-btn"');expect(html).toContain('ARP-Cache leeren');
  expect(html).toContain('Löscht die dynamisch gelernten ARP-Einträge dieses Geräts.');
  expect(html).toContain('Keine ARP-Einträge');expect(a.arpTable.size).toBe(0);
});

it('shows real ARP learning and update age without changing caches or terminal formatting', () => {
  const { a, b, net } = pair();
  a.sendEcho(ip('192.168.1.20'), 1, 1); net.scheduler.advanceTo(2000);
  const cache = [...a.arpTable.entries()], before = formatNeigh(a), beforeRoutes = formatRoutes(a);
  const html = arp(a), value = text(html);
  expect(value).toContain('192.168.1.20'); expect(value).toContain(b.interfaces[0].mac); expect(value).toContain('eth0');
  expect(html).toContain('<dt>Schnittstelle</dt>');
  expect(value).toContain('Aktualisiert vor1 s'); expect(html).toContain('scope="row"');
  expect(a.arpTable.size).toBe(1); expect([...a.arpTable.entries()]).toEqual(cache);
  expect(formatNeigh(a)).toBe(before); routes(a); expect(formatRoutes(a)).toBe(beforeRoutes);
  a.arpTable.clear(); expect(arp(a)).toContain('Keine ARP-Einträge'); expect(text(arp(a))).not.toContain(b.interfaces[0].mac);
});

it('reads MACs learned by real switch forwarding, preserves VLAN and port, and reflects deletion', () => {
  const { a, b, sw, net } = pair();
  sw.vlans.set('eth0', 42); sw.vlans.set('eth1', 42);
  a.sendEcho(ip('192.168.1.20'), 1, 1); net.scheduler.advanceTo(1000);
  const html = mac(sw), value = text(html), original = [...sw.macTable];
  for (const address of [a.interfaces[0].mac, b.interfaces[0].mac]) expect(value).toContain(address);
  expect(value).toContain('42'); expect(value).toContain('eth0'); expect(value).toContain('eth1');
  expect(html.match(/scope="row"/g)).toHaveLength(2); expect(value).not.toContain('Aktualisiert');
  expect([...sw.macTable]).toEqual(original);
  sw.macTable.delete(`42|${a.interfaces[0].mac}`);
  expect(text(mac(sw))).not.toContain(a.interfaces[0].mac);
});

it('keeps the same MAC in two different VLANs as separate records', () => {
  const { sw } = pair(), address = 'aa:bb:cc:dd:ee:ff';
  sw.macTable.set(`1|${address}`, sw.interfaces[0]); sw.macTable.set(`200|${address}`, sw.interfaces[1]);
  const html = mac(sw);
  expect(text(html).match(/aa:bb:cc:dd:ee:ff/g)).toHaveLength(2);
  expect(html.match(/scope="row"/g)).toHaveLength(2);
});

it('shows connected, static, RIP and default routes with only actual metrics and gateways', () => {
  const net = new Network(), a = createDevice(net, 'router') as IpDevice, b = createDevice(net, 'router') as IpDevice;
  a.interfaces[0].ip = parseCidr('192.168.1.1/24'); a.interfaces[1].ip = parseCidr('10.0.0.1/30');
  b.interfaces[0].ip = parseCidr('10.0.0.2/30'); b.interfaces[1].ip = parseCidr('172.16.0.1/24');
  net.connect(a.id, b.id, { aIface: 'eth1', bIface: 'eth0' });
  expect(a.addRoute(0, 0, ip('10.0.0.2'), 'eth1')).toBeNull();
  a.enableRip(true); b.enableRip(true); net.scheduler.advanceTo(100);
  const original = a.routes(), html = routes(a), value = text(html);
  for (const content of ['192.168.1.0/24', '10.0.0.0/30', '172.16.0.0/24', '10.0.0.2',
    'Standardroute', '0.0.0.0/0', 'Connected', 'Static', 'RIP', 'Direkt · ohne Gateway']) expect(value).toContain(content);
  expect(html).toContain('is-connected'); expect(html).toContain('is-static'); expect(html).toContain('is-rip');
  expect(html.match(/<dt>Metrik<\/dt>/g)).toHaveLength(1); expect(html).toContain('<dd>2</dd>');
  expect(a.routes()).toEqual(original);
  a.interfaces[0].up = false; a.delRoute(0, 0); a.enableRip(false);
  const changed = text(routes(a));
  for (const removed of ['192.168.1.0/24', 'Standardroute', '172.16.0.0/24', 'Metrik']) expect(changed).not.toContain(removed);
});

it('preserves full long addresses and interface names with wrap opportunities and no tooltip-only data', () => {
  const { a } = pair(), address = 'ff:ee:dd:cc:bb:aa', name = 'ethernet-interface-with-a-long-name';
  a.arpTable.set(ip('255.255.255.254'), { mac: address, ifaceName: name, at: 0 });
  const html = arp(a), value = text(html);
  expect(value).toContain('255.255.255.254'); expect(value).toContain(address); expect(value).toContain(name);
  expect(html).toContain('<wbr/>'); expect(html).not.toContain('title='); expect(html).not.toContain('ellipsis');
});

it('offers one shared route-type help button per table, regardless of route count', () => {
  const { a } = pair();
  a.addRoute(0, 0, ip('192.168.1.1'), 'eth0');
  const html = routes(a);
  expect(html.match(/aria-label="Routentyp erklären"/g)).toHaveLength(1);
  expect(html).toContain('aria-expanded="false"'); expect(html).toContain('diagnostic-caption');
  expect(html).not.toContain('title='); // No competing native tooltip.
  expect(text(html)).toContain('Connected'); expect(text(html)).toContain('Static');
  a.interfaces[0].ip = null; a.staticRoutes = [];
  expect(routes(a).match(/aria-label="Routentyp erklären"/g)).toHaveLength(1);
});

it.each(['host', 'server', 'router', 'firewall'] as const)('includes route help and Connected routes on %s devices', kind => {
  const net = new Network();
  const device = createDevice(net, kind) as IpDevice;
  device.interfaces[0].ip = parseCidr('192.0.2.10/24');
  expect(routes(device)).toContain('Routentyp erklären'); expect(text(routes(device))).toContain('Connected');
});
