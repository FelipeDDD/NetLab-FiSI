import { expect, it } from 'vitest';
import { capturePrintSnapshot } from './model';
import { studioFixture } from './studio.fixture';
import { printPreset } from './options';
import { studioDiagram } from './diagram';
import { reportTables, studioReport } from './report';
import { studioMessages } from './messages';
import { parseIp } from '../../engine/ip';

it('renders vector icons, escaped names and exact filtered connections without mutating anything', () => {
  const { net, visual } = studioFixture(), snap = capturePrintSnapshot(net, visual), options = printPreset('technical', snap);
  const before = JSON.stringify(snap); options.names['studio-2'] = '<script>alert("x")</script>';
  const svg = studioDiagram(snap, options, 'en');
  expect(svg).toContain('&lt;script&gt;'); expect(svg).not.toContain('<script>'); expect(svg).toContain('192.168.10.1/24'); expect(svg).toContain('eth1');
  options.diagram.deviceIds = ['studio-0', 'studio-2'];
  const filtered = studioDiagram(snap, options, 'en'); expect(filtered).not.toContain('<line '); expect(filtered).not.toContain('data-device="studio-1"');
  expect(JSON.stringify(snap)).toBe(before);
});
it('section selection is independent, preserves true names, correct origins, empty interfaces and route filters', () => {
  const { net, visual } = studioFixture(), snap = capturePrintSnapshot(net, visual), options = printPreset('technical', snap);
  options.sections.routes.deviceIds = ['studio-2']; options.names['studio-2'] = 'Document alias'; options.diagram.deviceIds = [];
  const tables = reportTables(snap, options, 'en'), routes = tables.filter(t => t.heading.startsWith('Routing Tables'));
  expect(routes).toHaveLength(1); expect(routes[0].heading).toContain('Zentralrouter');
  expect(routes[0].rows).toContainEqual(['192.168.20.0/24', '10.0.12.2', 'eth1', 'Static']);
  options.routeFilter = 'connected'; expect(reportTables(snap, options, 'en').filter(t => t.heading.startsWith('Routing Tables'))[0].rows.every(r => r[1] === 'Connected')).toBe(true);
  options.sections.routes.enabled = false;
  const { html, pages } = studioReport(snap, options, 'en'); expect(html).not.toContain('<h2>Routing Tables'); expect(pages).toBeGreaterThan(1); expect(html).toContain('size: A4 landscape');
  expect(html).not.toContain('<script'); expect(html).not.toContain('Document alias');
});
it('escapes all free text, ignores invalid colours and paginates a large multi-interface report at normal text size', () => {
  const { net, visual } = studioFixture(40), snap = capturePrintSnapshot(net, visual), options = printPreset('technical', snap);
  options.title = '"><img src=x onerror=alert(1)>'; options.subtitle = '<svg onload="bad">'; options.annotation = '<script>bad</script>'; options.accent = 'red; } @import url(evil)';
  options.paper = 'A3'; options.orientation = 'portrait';
  const { html, pages } = studioReport(snap, options, 'pt-BR'); expect(pages).toBeGreaterThan(2); expect(html).not.toContain('<img'); expect(html).not.toContain('@import'); expect(html).toContain('size: A3 portrait');
  for (const language of ['de', 'pt-BR'] as const) expect(Object.keys(studioMessages[language]).sort()).toEqual(Object.keys(studioMessages.en).sort());
});
it('captures services without leases, caches or executable HTTP bodies and renders optional sections safely', () => {
  const { net, visual, r1 } = studioFixture();
  r1.dnsServer = { enabled: true, records: new Map([['<script>alert(1)</script>', parseIp('192.168.1.2')!]]) };
  r1.httpServer = { enabled: true, port: 8080, body: '<script>private-page</script>' };
  r1.dhcpPools.set('eth0', { enabled: false, rangeStart: parseIp('192.168.10.100')!, rangeEnd: parseIp('192.168.10.150')!, router: parseIp('192.168.10.1'), dns: null, leases: new Map() });
  const snap = capturePrintSnapshot(net, visual), o = printPreset('clean', snap);
  o.sections.services.enabled = true; o.sections.services.deviceIds = [r1.id];
  o.sections.firewall.enabled = true; o.sections.firewall.deviceIds = [r1.id];
  o.diagram.areas = true;
  snap.areas.push({ id: 'area', name: '<Area & Unicode>', color: '#598fb9', intensity: 18, rects: [{ x: 0, y: 0, width: 400, height: 300 }, { x: 400, y: 200, width: 300, height: 100 }], title: { x: 12, y: 18 }, textSize: 18 });
  const html = studioReport(snap, o, 'en').html;
  expect(html).toContain('192.168.10.100–192.168.10.150'); expect(html).toContain('&lt;script&gt;alert'); expect(html).toContain('8080');
  expect(html).not.toContain('private-page'); expect(html).not.toContain('leases:'); expect(html).not.toContain('data-studio-area');
  expect(snap.areas).toHaveLength(1);
});
it('supports prototype-like stable IDs and keeps presentation names out of technical tables', () => {
  const { net, visual } = studioFixture(), snap = capturePrintSnapshot(net, visual);
  snap.devices[0].id = '__proto__'; const options = printPreset('clean', snap);
  expect(() => studioDiagram(snap, options, 'en')).not.toThrow();
  options.names = Object.fromEntries([['__proto__', 'Friendly name']]);
  expect(studioDiagram(snap, options, 'en')).toContain('Friendly name');
});
