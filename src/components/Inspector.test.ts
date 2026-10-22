import { beforeEach, expect, it, vi } from 'vitest';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector, HostOverview, RouterOverview, ServerOverview, OverviewServices, OverviewInterface, SwitchOverview, ApOverview, ApClients, FirewallSummary } from './Inspector';
import { ApDevice, SwitchDevice } from '../engine/switch';
import { Palette } from './Palette';
import { createDevice } from '../engine/factory';
import { FirewallDevice, Host, IpDevice, RouterDevice, ServerDevice } from '../engine/ipdevice';
import { Network } from '../engine/network';
import { sim } from '../sim';
import { parseStaticIpv4, emptyIpv4 } from '../engine/ipv4Config';
import { parseCidr, parseIp } from '../engine/ip';

const view = vi.hoisted(() => ({ selected: null as string | null, nodes: [], uiPulse: 0,
  toggleDhcpServer: vi.fn(), toggleDnsServer: vi.fn(), toggleHttpServer: vi.fn() }));
vi.mock('../store', () => ({ useStore: Object.assign((select: (s: typeof view) => unknown) => select(view), { getState: () => view }) }));
beforeEach(() => { sim.net = new Network(); view.selected = null; vi.clearAllMocks(); });
const render = () => renderToStaticMarkup(createElement(Inspector));

it('organizes the AP into three persistent pages with existing settings and no invented security controls', () => {
  const ap = createDevice(sim.net, 'ap') as ApDevice; view.selected = ap.id;
  ap.ssid = 'NetLab WLAN'; ap.vlans.set('eth0', 20);
  ap.interfaces[0].configureIpv4(parseStaticIpv4('192.0.2.1', '/24', '192.0.2.254', '192.0.2.53')!);
  const html = render();
  expect(html).toContain('aria-label="Wi-Fi AP Inspector"');
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  expect(tabs).toHaveLength(3);
  expect(tabs[0]).toContain('Allgemein'); expect(tabs[0]).toContain('aria-selected="true"');
  expect(tabs[1]).toContain('WLAN'); expect(tabs[2]).toContain('Clients');
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(2);
  expect(html.match(/aria-label="Access point SSID"/g)).toHaveLength(1);
  expect(html).toContain('NetLab WLAN'); expect(html).toContain('VLAN 20');
  expect(html).toContain('Nicht belegt'); expect(html).not.toContain('Kein Kabel');
  for (const iface of ap.interfaces) {
    expect(html).not.toContain(`aria-label="IP-Adresse ${iface.name}"`);
    expect(html).toContain(`aria-label="Access VLAN for ${iface.name}"`);
    expect(html).toContain(`aria-label="Admin ${iface.name}"`);
  }
  for (const value of ['Gespeicherte IPv4-Daten', '192.0.2.1/24', '192.0.2.254', '192.0.2.53']) expect(html).toContain(value);
  expect(html).not.toContain('automatisch beziehen');
  for (const label of ['SSID erklären', 'Bridging erklären', 'Port-Konfiguration erklären', 'Gelernte MAC-Adressen', 'Delete device']) expect(html).toContain(label);
  expect(html).toContain('Authentifizierung und Verschlüsselung werden nicht simuliert');
  for (const label of ['WPA', 'RSSI', 'Open terminal', 'IP forwarding:', 'RIP routing', 'role="switch"']) expect(html).not.toContain(label);
});

it('keeps AP cable summaries separate from wireless links and counts inactive clients without claiming authentication', () => {
  const ap = createDevice(sim.net, 'ap') as ApDevice;
  const sw = createDevice(sim.net, 'switch'), host = createDevice(sim.net, 'host'), server = createDevice(sim.net, 'server');
  const summary = () => renderToStaticMarkup(createElement(ApOverview, { device: ap, onWlan: vi.fn(), onClients: vi.fn() }));
  expect(summary()).toContain('Keine Kabelverbindung'); expect(summary()).toContain('0 verbunden');
  sim.net.connect(ap.id, sw.id); sim.net.connect(ap.id, host.id); sim.net.connect(ap.id, server.id);
  server.interfaces[0].up = false;
  const html = summary();
  expect(html).toContain('2 verbunden · 1 aktiv'); expect(html).toContain('2 von 8');
  expect(html).toContain(sw.name); expect(html).not.toContain(`Mit <strong style="color:var(--host`);
  expect(html).not.toContain('WLAN aktiv');
});

it('lists only valid direct wireless endpoints with their actual interface data, not learned MACs or wired hosts', () => {
  const ap = createDevice(sim.net, 'ap') as ApDevice;
  const sw = createDevice(sim.net, 'switch'), host = createDevice(sim.net, 'host'), server = createDevice(sim.net, 'server');
  const behind = createDevice(sim.net, 'host', { name: 'wired-only' });
  sim.net.connect(ap.id, sw.id); sim.net.connect(sw.id, behind.id);
  const hostLink = sim.net.connect(ap.id, host.id); sim.net.connect(ap.id, server.id);
  host.interfaces[0].ip = parseCidr('192.0.2.42/24'); server.interfaces[0].up = false;
  ap.macTable.set(`1|${behind.interfaces[0].mac}`, ap.interfaces[0]);
  const clients = () => renderToStaticMarkup(createElement(ApClients, { device: ap }));
  let html = clients();
  for (const value of [host.name, server.name, host.interfaces[0].mac, '192.0.2.42/24', 'WLAN aktiv', 'WLAN inaktiv', 'Admin: DOWN']) expect(html).toContain(value);
  for (const value of [behind.name, behind.interfaces[0].mac, sw.name, 'Kabel zu', '>Link aktiv<']) expect(html).not.toContain(value);
  sim.net.disconnect(hostLink.id); html = clients(); expect(html).not.toContain(host.interfaces[0].mac);
  server.interfaces[0].link = null; html = clients(); expect(html).toContain('Keine WLAN-Clients verbunden');
});

it('classifies AP links from current neighbors and returns disconnected ports to an undetermined medium', () => {
  const ap = createDevice(sim.net, 'ap') as ApDevice; view.selected = ap.id;
  const sw = createDevice(sim.net, 'switch'), host = createDevice(sim.net, 'host');
  const cable = sim.net.connect(ap.id, sw.id), wireless = sim.net.connect(ap.id, host.id);
  let html = render();
  expect(html).toContain('>Link aktiv<'); expect(html).toContain('>WLAN aktiv<');
  sw.interfaces[0].up = false; host.interfaces[0].up = false; html = render();
  expect(html).toContain('>Link inaktiv<'); expect(html).toContain('>WLAN inaktiv<');
  expect(html).not.toContain('Kein Kabel');
  sim.net.disconnect(cable.id); sim.net.disconnect(wireless.id); html = render();
  expect(html).toContain('>Nicht belegt<');
  const overview = renderToStaticMarkup(createElement(ApOverview, { device: ap, onWlan: vi.fn(), onClients: vi.fn() }));
  expect(overview).toContain('>Nicht belegt<'); expect(overview).not.toContain('Kein Kabel');
  expect(html).toContain('0 verbunden'); expect(html).not.toContain('WLAN inaktiv');
  expect(html).not.toContain('Kein Kabel');
});

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

it.each(['server', 'router', 'firewall'] as const)('dispatches each %s quick switch to the existing service action', (kind) => {
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

it('organizes the dedicated Firewall into five persistent pages without duplicating IPv4 editors', () => {
  const device = createDevice(sim.net, 'firewall') as FirewallDevice; view.selected = device.id;
  device.interfaces[0].ip = parseCidr('192.168.1.1/24'); device.interfaces[1].ip = parseCidr('10.0.0.1/24');
  device.dnsServer = { enabled: true, records: new Map([['lab.local', parseIp('10.0.0.10')!]]) };
  const html = render();
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(match => match[1]);
  expect(tabs).toEqual(['Allgemein', 'Interfaces', 'Firewall', 'Routing', 'Dienste']);
  expect(html).toContain('aria-label="Firewall Inspector"');
  expect(html.match(/role="tabpanel"[^>]* hidden=""/g)).toHaveLength(4);
  const general = html.slice(html.indexOf('role="tabpanel"'), html.indexOf('-panel-interfaces" aria-labelledby'));
  expect(general).not.toContain('IP-Adresse eth0');
  for (const iface of device.interfaces) expect(html.match(new RegExp(`aria-label="IP-Adresse ${iface.name}"`, 'g'))).toHaveLength(1);
  expect(html.match(/<details class="router-interface-editor"/g)).toHaveLength(4);
  expect(html).not.toMatch(/<details class="router-interface-editor" open/);
  expect(html.match(/role="switch" aria-label="DNS Server" aria-checked="true"/g)).toHaveLength(2);
  for (const value of ['Firewall (nftables)', 'Copy config', 'Conntrack erklären', 'Firewall-Begriffe erklären', 'Firewall logs', 'Routing-Tabelle', 'ARP-Tabelle', 'RIP aktivieren',
    'sysctl -w net.ipv4.ip_forward=1', 'DHCP server', 'DNS server', 'Web server', 'lab.local', 'Delete device']) expect(html).toContain(value);
  expect(html).not.toContain('Open terminal');
});

it('reports actual per-hook Firewall policies and declared filter/NAT rules, including flushed and mixed configurations', () => {
  const device = createDevice(sim.net, 'firewall') as FirewallDevice;
  const summary = () => renderToStaticMarkup(createElement(FirewallSummary, { device }));
  expect(summary().match(/<code>ACCEPT<\/code>/g)).toHaveLength(3);
  device.fw.filter.forward.policy = 'drop';
  device.fw.addFilterRule('forward', { proto: 'icmp' }, 'accept');
  device.fw.declareNat('postrouting', 'postrouting'); device.fw.addNatRule('postrouting', {}, { type: 'masquerade' });
  let html = summary(); expect(html.match(/<code>ACCEPT<\/code>/g)).toHaveLength(2);
  expect(html).toContain('<code>DROP</code>'); expect(html).toContain('1 Filterregeln · 1 NAT-Regeln');
  device.fw.filter.input.declared = false; html = summary();
  expect(html).toContain('Keine Basiskette'); expect(html.match(/<code>ACCEPT<\/code>/g)).toHaveLength(1);
});

it('uses shared interface states and live Firewall information in Allgemein', () => {
  const device = createDevice(sim.net, 'firewall') as FirewallDevice;
  const host = createDevice(sim.net, 'host'), server = createDevice(sim.net, 'server');
  sim.net.connect(device.id, host.id); sim.net.connect(device.id, server.id); server.interfaces[0].up = false;
  const summary = () => renderToStaticMarkup(createElement(RouterOverview, { device, onEdit: vi.fn() }));
  let html = summary();
  for (const value of ['Link aktiv', 'Link inaktiv', 'Kein Kabel', host.name, server.name, 'Admin: UP', 'Standardpolitik', 'IP-Forwarding: <strong>Aktiv', 'RIP: <strong>Inaktiv']) expect(html).toContain(value);
  expect(html).not.toContain('IP-Adresse eth0');
  device.interfaces[1].up = false; device.forwarding = false; device.enableRip(true);
  html = summary();
  for (const value of ['Admin: DOWN', 'IP-Forwarding: <strong>Inaktiv', 'RIP: <strong>Aktiv']) expect(html).toContain(value);
});
