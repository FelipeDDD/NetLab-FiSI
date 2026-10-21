import { beforeEach, expect, it, vi } from 'vitest';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector, HostOverview, RouterOverview, ServerOverview, OverviewServices, OverviewInterface, SwitchOverview } from './Inspector';
import { SwitchDevice } from '../engine/switch';
import { Palette } from './Palette';
import { createDevice } from '../engine/factory';
import { Host, IpDevice, RouterDevice, ServerDevice } from '../engine/ipdevice';
import { Network } from '../engine/network';
import { sim } from '../sim';
import { parseStaticIpv4, emptyIpv4 } from '../engine/ipv4Config';
import { parseCidr, parseIp } from '../engine/ip';

const view = vi.hoisted(() => ({ selected: null as string | null, nodes: [], uiPulse: 0,
  toggleDhcpServer: vi.fn(), toggleDnsServer: vi.fn(), toggleHttpServer: vi.fn() }));
vi.mock('../store', () => ({ useStore: Object.assign((select: (s: typeof view) => unknown) => select(view), { getState: () => view }) }));
beforeEach(() => { sim.net = new Network(); view.selected = null; vi.clearAllMocks(); });
const render = () => renderToStaticMarkup(createElement(Inspector));

it('keeps draggable device controls without the permanent cabling instruction', () => {
  const html = renderToStaticMarkup(createElement(Palette));
  expect(html).not.toContain('Drag between the dots'); expect(html).not.toContain('palette-hint');
  expect(html.match(/draggable="true"/g)).toHaveLength(6);
});

it('starts hosts on Allgemein and keeps all three pages mounted with matching accessible tab/panel relationships', () => {
  const host = createDevice(sim.net, 'host'); view.selected = host.id;
  const html = render();
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
  expect(tabs).toHaveLength(3);
  expect(tabs[0]).toContain('aria-selected="true"'); expect(tabs[0]).toContain('Allgemein');
  expect(tabs[1]).toContain('Netzwerk'); expect(tabs[2]).toContain('Sicherheit');
  for (const tab of tabs) {
    const id = tab.match(/ id="([^"]+)"/)![1], panel = tab.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${panel}" aria-labelledby="${id}"`);
  }
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(2);
  expect(html).toContain('aria-label="IP-Adresse eth0"'); // Mounted despite being hidden.
  expect(html).not.toContain('Open terminal'); expect(html).toContain('Delete device');
  expect(html).not.toContain('IP forwarding:');
});

it('preserves services, ports, routing, ARP, global DNS, simulated rules, conntrack and logs inside the host pages', () => {
  const host = createDevice(sim.net, 'host') as Host; view.selected = host.id;
  host.dhcpServer = { enabled: true, rangeStart: 1, rangeEnd: 10, router: null, dns: null, leases: new Map() };
  host.dnsServer = { enabled: true, records: new Map() };
  host.httpServer = { enabled: true, port: 8080, body: 'Saved draft' };
  const html = render();
  for (const label of ['Routing-Tabelle', 'ARP-Tabelle', 'DNS global override', 'Erweiterte Einstellungen', 'DHCP server', 'DNS server', 'Web server',
    'Additional TCP ports', 'Additional UDP ports', 'HTTP response body', 'Conntrack', 'Firewall log', 'Copy firewall config']) expect(html).toContain(label);
  expect(html).toContain('Saved draft'); expect(html).toContain('8080');
  expect(html).toMatch(/<details class="host-inspector-details"><summary>Erweiterte Einstellungen/);
});

it('labels Windows firewall as a NetLab packet filter with nftables representation, not native Windows firewall', () => {
  const host = createDevice(sim.net, 'host', { os: 'windows' }); view.selected = host.id;
  expect(render()).toContain('Simulierte Firewall (NetLab)');
  expect(render()).toContain('kein Windows Defender Firewall');
  expect(render()).toContain('nftables-Format'); expect(render()).not.toContain('Firewall (nftables)');
});

it('derives the host summary from effective addresses, routes, global DNS and modes without duplicating editable IPv4 forms', () => {
  const host = createDevice(sim.net, 'host') as Host;
  const iface = host.interfaces[0]; iface.configureIpv4(parseStaticIpv4('192.168.1.10', '/25', '192.168.1.1', '10.0.0.2')!);
  const summary = () => renderToStaticMarkup(createElement(HostOverview, { device: host, onEdit: vi.fn() }));
  expect(summary()).toContain('192.168.1.10/25'); expect(summary()).toContain('255.255.255.128');
  expect(summary()).toContain('192.168.1.1'); expect(summary()).toContain('10.0.0.2'); expect(summary()).toContain('Static');
  host.nameserver = parseIp('203.0.113.53');
  expect(summary()).toContain('203.0.113.53'); expect(summary()).not.toContain('10.0.0.2');
  iface.configureIpv4(emptyIpv4('dhcp'));
  expect(summary()).toContain('DHCP'); expect(summary()).toContain('Kein aktives Lease');
  iface.configureIpv4(emptyIpv4('unconfigured')); iface.up = false;
  expect(summary()).toContain('Unconfigured'); expect(summary()).toContain('DOWN');
  expect(summary()).not.toContain('aria-label="IP-Adresse eth0"');
});

it('offers an inline edit slot, ARP and terminal actions without rendering a second IPv4 editor', () => {
  const host = createDevice(sim.net, 'host') as Host; view.selected = host.id;
  const html = render();
  expect(html).toContain('aria-label="Bearbeiten eth0"'); expect(html).toContain('ARP-Tabelle');
  expect(html).toContain('>Terminal</button>'); expect(html).not.toContain('Netzwerk konfigurieren');
  expect(html.match(/aria-label="IP-Adresse eth0"/g)).toHaveLength(1);
  const opened = renderToStaticMarkup(createElement(HostOverview, { device: host, editing: 'eth0', onEdit: vi.fn() }));
  expect(opened).toContain('aria-expanded="true"'); expect(opened).toContain('host-quick-editor');
  expect(opened).not.toContain('aria-label="IP-Adresse eth0"');
});

it('uses the same structured ARP source in Allgemein and Netzwerk and reflects cache changes', () => {
  const host = createDevice(sim.net, 'host') as Host; view.selected = host.id;
  host.arpTable.set(parseIp('192.0.2.10')!, { mac: 'aa:bb:cc:dd:ee:ff', ifaceName: 'eth0', at: 0 });
  const populated = render().replace(/<[^>]*>/g, '');
  expect(populated.match(/aa:bb:cc:dd:ee:ff/g)).toHaveLength(2);
  expect(render().match(/caption class="sr-only">ARP-Tabelle/g)).toHaveLength(2);
  host.arpTable.clear();
  expect(render()).not.toContain('aa:bb'); expect(render()).toContain('Keine ARP-Einträge');
});

it('starts routers on Allgemein with five accessible, mounted pages and one IPv4 editor per interface', () => {
  const router = createDevice(sim.net, 'router') as RouterDevice; view.selected = router.id;
  const html = render();
  expect(html).toContain('aria-label="Router-Einstellungen"');
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  expect(tabs).toHaveLength(5); expect(tabs[0]).toContain('aria-selected="true"');
  for (const [index, label] of ['Allgemein', 'Interfaces', 'Routing', 'Dienste', 'Firewall'].entries()) expect(tabs[index]).toContain(label);
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(4);
  for (const iface of router.interfaces) expect(html.match(new RegExp(`aria-label="IP-Adresse ${iface.name}"`, 'g'))).toHaveLength(1);
  expect(html.match(/aria-label="Device name"/g)).toHaveLength(1);
  expect(html).not.toContain('Open terminal'); expect(html).toContain('Delete device');
});

it('shows actual router interfaces, neighbors, forwarding and RIP without an extra form or diagnostics on Allgemein', () => {
  const router = createDevice(sim.net, 'router') as RouterDevice, peer = createDevice(sim.net, 'host');
  sim.net.connect(router.id, peer.id, { aIface: 'eth1' });
  router.interfaces[1].ip = parseCidr('192.168.3.1/24');
  const summary = () => renderToStaticMarkup(createElement(RouterOverview, { device: router, onEdit: vi.fn() }));
  let html = summary();
  for (const value of ['1 von 4', '192.168.3.1/24', `Verbunden mit ${peer.name}`, 'Bearbeiten eth1', 'Nicht verbunden']) expect(html).toContain(value);
  expect(html).not.toContain('<table'); expect(html).not.toContain('IP-Adresse eth1');
  expect(html).toContain('IP-Forwarding: <strong>Aktiv</strong>'); expect(html).toContain('RIP: <strong>Inaktiv</strong>');
  peer.name = 'PC-Lab'; router.interfaces[1].up = false; router.forwarding = false; router.enableRip(true);
  html = summary(); expect(html).toContain('PC-Lab'); expect(html).toContain('DOWN');
  expect(html).toContain('IP-Forwarding: <strong>Inaktiv</strong>'); expect(html).toContain('RIP: <strong>Aktiv</strong>');
});

it('preserves router services, diagnostics, filtering, logs and DNS override in their pages', () => {
  const router = createDevice(sim.net, 'router') as RouterDevice; view.selected = router.id;
  router.httpServer = { enabled: true, port: 8080, body: 'Router response draft' };
  router.services.tcp.add(2222); router.services.udp.add(5353); router.nameserver = parseIp('203.0.113.53');
  router.fw.tables.filter = true; router.fw.declareFilter('forward', 'forward', 'accept');
  const html = render();
  for (const label of ['Routing-Tabelle', 'ARP-Tabelle', 'RIP aktivieren', 'Firewall (nftables)', 'Copy config', 'Conntrack',
    'Firewall logs', 'DHCP server', 'DNS server', 'Web server', 'DNS global override', 'Additional TCP ports', 'Additional UDP ports']) expect(html).toContain(label);
  for (const value of ['Router response draft', '8080', '2222', '5353', '203.0.113.53', 'chain forward']) expect(html).toContain(value);
});

it('starts servers on Allgemein with four mounted pages and no duplicate configuration fields', () => {
  const server = createDevice(sim.net, 'server') as ServerDevice; view.selected = server.id;
  const html = render();
  expect(html).toContain('aria-label="Server-Einstellungen"');
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  expect(tabs).toHaveLength(4); expect(tabs[0]).toContain('aria-selected="true"');
  for (const [index, label] of ['Allgemein', 'Netzwerk', 'Dienste', 'Sicherheit'].entries()) expect(tabs[index]).toContain(label);
  for (const tab of tabs) {
    const id = tab.match(/ id="([^"]+)"/)![1], panel = tab.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${panel}" aria-labelledby="${id}"`);
  }
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(3);
  expect(html.match(/aria-label="Device name"/g)).toHaveLength(1);
  expect(html.match(/aria-label="IP-Adresse eth0"/g)).toHaveLength(1);
  expect(html).not.toContain('Open terminal'); expect(html).toContain('Delete device');
  expect(html).not.toContain('Betriebssystem'); expect(html).not.toContain('RIP aktivieren');
});

it('shows server interface and service states from the engine without adding forms to the summary', () => {
  const server = createDevice(sim.net, 'server') as ServerDevice, peer = createDevice(sim.net, 'host');
  sim.net.connect(server.id, peer.id); server.interfaces[0].configureIpv4(parseStaticIpv4('10.0.0.20', '/24', '', '')!);
  const summary = () => renderToStaticMarkup(createElement(ServerOverview, { device: server, onEdit: vi.fn(), onServices: vi.fn() }));
  let html = summary();
  for (const label of ['10.0.0.20/24', 'UP', 'Static', `Verbunden mit ${peer.name}`, 'Bearbeiten eth0', 'Dienste bearbeiten']) expect(html).toContain(label);
  expect(html.match(/role="switch"/g)).toHaveLength(3); expect(html.match(/aria-checked="false"/g)).toHaveLength(3);
  expect(html.match(/>AUS</g)).toHaveLength(3); expect(html).not.toContain('IP-Adresse eth0'); expect(html).not.toContain('<table');
  server.httpServer = { enabled: true, port: 8080, body: 'Response' }; server.interfaces[0].up = false;
  html = summary(); expect(html).toContain('DOWN'); expect(html.match(/>AN</g)).toHaveLength(1);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
});

it.each(['server', 'router'] as const)('dispatches each %s quick switch to the existing service action', (kind) => {
  const server = createDevice(sim.net, kind) as IpDevice;
  const switches: { onClick?: () => void }[] = [];
  const visit = (nodes: ReactNode) => Children.forEach(nodes, node => {
    if (!isValidElement<{ children?: ReactNode; role?: string; onClick?: () => void }>(node)) return;
    if (node.props.role === 'switch') switches.push(node.props);
    visit(node.props.children);
  });
  visit(OverviewServices({ device: server, onServices: vi.fn() }));
  expect(switches).toHaveLength(3); switches.forEach(control => control.onClick?.());
  for (const action of [view.toggleDhcpServer, view.toggleDnsServer, view.toggleHttpServer]) {
    expect(action).toHaveBeenCalledTimes(1); expect(action).toHaveBeenCalledWith(server.id);
  }
});

it('distinguishes physical cables from administrative UP/DOWN and follows disconnection', () => {
  const router = createDevice(sim.net, 'router') as RouterDevice, server = createDevice(sim.net, 'server');
  const link = sim.net.connect(router.id, server.id, { aIface: 'eth2' });
  const iface = router.interfaces[2];
  const summary = () => renderToStaticMarkup(createElement(OverviewInterface, { iface, onEdit: vi.fn() }));
  iface.up = false; let html = summary();
  expect(html).toContain('Admin: DOWN'); expect(html).toContain('is-inactive'); expect(html).toContain(`Kabel zu ${server.name}`);
  expect(html).toContain(`data-link-id="${link.id}"`); expect(html).toContain('data-interface-name="eth2"');
  sim.net.disconnect(link.id); iface.up = true; html = summary();
  expect(html).toContain('Admin: UP'); expect(html).toContain('is-disconnected'); expect(html).toContain('Nicht verbunden');
  expect(html).not.toContain('data-link-id=');
});

it('preserves every existing server editor and diagnostic with independent service drafts', () => {
  const server = createDevice(sim.net, 'server') as ServerDevice; view.selected = server.id;
  server.dhcpServer = { enabled: true, rangeStart: parseIp('10.0.0.100')!, rangeEnd: parseIp('10.0.0.150')!, router: null, dns: null, leases: new Map() };
  server.dnsServer = { enabled: true, records: new Map([['web.lan', parseIp('10.0.0.20')!]]) };
  server.httpServer = { enabled: true, port: 8080, body: 'Server response draft' };
  server.services.tcp.add(2222); server.services.udp.add(5353); server.nameserver = parseIp('203.0.113.53');
  const html = render();
  for (const label of ['Routing-Tabelle', 'ARP-Tabelle', 'DNS global override', 'IP forwarding:', 'DHCP server', 'DNS server', 'Web server',
    'Additional TCP ports', 'Additional UDP ports', 'Firewall (nftables)', 'Conntrack', 'Firewall log', 'Copy firewall config']) expect(html).toContain(label);
  for (const value of ['10.0.0.100', '10.0.0.150', 'web.lan', 'Server response draft', '8080', '2222', '5353', '203.0.113.53']) expect(html).toContain(value);
  for (const label of ['DNS A records', 'HTTP port', 'HTTP response body', 'DHCP rangeStart']) expect(html.match(new RegExp(`aria-label="${label}"`, 'g'))).toHaveLength(1);
  expect(html).toContain('aria-label="Firewall-Begriffe erklären"'); expect(html).toContain('aria-label="Conntrack erklären"');
});

it('keeps four switch pages mounted with only supported port controls and one VLAN input per port', () => {
  const device = createDevice(sim.net, 'switch') as SwitchDevice; view.selected = device.id;
  const html = render();
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  expect(tabs).toHaveLength(4);
  for (const [index, label] of ['Allgemein', 'Ports', 'VLAN', 'MAC-Tabelle'].entries()) expect(tabs[index]).toContain(label);
  expect(tabs[0]).toContain('aria-selected="true"');
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(3);
  for (const port of device.interfaces) {
    expect(html.match(new RegExp(`aria-label="Access VLAN for ${port.name}"`, 'g'))).toHaveLength(1);
    expect(html).toContain(`aria-label="Admin ${port.name}"`);
  }
  expect(html).toContain('Keine MAC-Adressen gelernt'); expect(html).toContain('Access-VLAN erklären');
  expect(html).not.toContain('IP-Adresse'); expect(html).not.toContain('DHCP'); expect(html).not.toContain('Trunk');
  expect(html).toContain('Delete device'); expect(html).not.toContain('Open terminal');
});

it('derives the switch overview from ports, configured VLANs and current MAC learning', () => {
  const device = createDevice(sim.net, 'switch') as SwitchDevice, host = createDevice(sim.net, 'host');
  const summary = () => renderToStaticMarkup(createElement(SwitchOverview, { device, onPort: vi.fn(), onMac: vi.fn() }));
  expect(summary()).toContain('0 von 8');
  const link = sim.net.connect(device.id, host.id); device.vlans.set('eth0', 20);
  device.macTable.set(`20|${host.interfaces[0].mac}`, device.interfaces[0]);
  const html = summary();
  for (const value of ['1 von 8', '1, 20', `Verbunden mit ${host.name}`, 'VLAN 20', 'Gelernte MACs', 'Port eth0 bearbeiten']) expect(html).toContain(value);
  expect(html).not.toContain('<input class="iface-ip"');
  sim.net.disconnect(link.id); expect(summary()).toContain('0 von 8');
});

it.each(['firewall', 'ap'] as const)('keeps the existing %s Inspector without new tabs', (kind) => {
  const device = createDevice(sim.net, kind); view.selected = device.id;
  const html = render();
  expect(html).not.toContain('role="tablist"'); expect(html).toContain('Delete device');
  if (device instanceof IpDevice) { expect(html).toContain('Open terminal'); expect(html).toContain('Firewall (nftables)'); }
  expect(html).toContain('Interfaces');
});
