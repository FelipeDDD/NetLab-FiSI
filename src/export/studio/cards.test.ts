import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { makeCards, measureText } from './geometry';
import { printPreset } from './options';
import { studioDiagram } from './diagram';
import { reportTables } from './report';

it('keeps switch cards compact while retaining actual port labels and full technical interfaces', () => {
  const snap = geometryFixture(), sw = snap.devices.find(d => d.id === 'SW-A')!, o = printPreset('technical', snap);
  sw.interfaces.push(...['eth2', 'eth3', 'eth4', 'eth5'].map(name => ({ ...sw.interfaces[0], name })));
  const before = structuredClone(snap), card = makeCards(snap, o, 'Gateway').find(c => c.device.id === sw.id)!;
  expect(card.info).toEqual([]); expect(card.kindLines).toEqual(['switch']); expect(card.footer).toEqual([]);
  expect(card.height).toBeLessThan(130); expect(card.name).toEqual(['SW-A']);
  const svg = studioDiagram(snap, o, 'en'); expect(svg).toContain('data-cable-label="SW-A-A"');
  o.sections.interfaces.deviceIds = [sw.id];
  expect(reportTables(snap, o, 'en').find(t => t.heading.endsWith('SW-A'))!.rows.map(row => row[0])).toEqual(['eth0', 'eth1', 'eth2', 'eth3', 'eth4', 'eth5']);
  expect(snap).toEqual(before);
});

it.each([2, 3])('groups %i router interfaces with their own IPv4/CIDR, in capture order', count => {
  const snap = geometryFixture(), router = snap.devices.find(d => d.id === 'D')!, o = printPreset('technical', snap);
  router.interfaces = router.interfaces.slice(0, count);
  const card = () => makeCards(snap, o, 'Gateway').find(c => c.device.id === 'D')!;
  expect(card().kindLines).toEqual(['router']);
  expect(card().info).toEqual(router.interfaces.map(i => `${i.name} ${i.address}/${i.prefix}`));
  o.diagram.interfaces = false; expect(card().info).toEqual(router.interfaces.map(i => `${i.address}/${i.prefix}`));
  o.diagram.ipv4 = false; expect(card().info).toEqual([]);
  o.diagram.interfaces = true; expect(card().info).toEqual(router.interfaces.map(i => i.name));
});

it('separates real interface gateways and all configured static defaults, without manufacturing a single gateway', () => {
  const snap = geometryFixture(), router = snap.devices.find(d => d.id === 'D')!, o = printPreset('technical', snap);
  router.interfaces[0].gateway = '192.168.12.254'; router.interfaces[1].gateway = '192.168.15.254';
  router.routes.push({ destination: '0.0.0.0', prefix: 0, via: '10.0.0.1', iface: 'eth2', origin: 'static' },
    { destination: '0.0.0.0', prefix: 0, via: null, iface: 'eth1', origin: 'static' },
    { destination: '192.168.80.0', prefix: 24, via: '10.0.0.2', iface: 'eth2', origin: 'static' });
  const card = () => makeCards(snap, o, 'Gateway').find(c => c.device.id === 'D')!;
  expect(card().footer).toEqual([]); o.diagram.gateways = true;
  const footer = card().footer.join('');
  expect(footer).toContain('Gateway: 192.168.12.254 (eth0)'); expect(footer).toContain('Gateway: 192.168.15.254 (eth1)');
  expect(footer).toContain('Default route: 10.0.0.1 (eth2)'); expect(footer).toContain('Default route: Connected (eth1)');
  expect(footer).not.toContain('192.168.80.0'); expect(card().info.join('')).not.toContain('Gateway');
  expect(studioDiagram(snap, o, 'en')).toContain('data-card-footer');
});

it('shows only available host/interface data and respects all information toggles and long names', () => {
  const snap = geometryFixture(), host = snap.devices.find(d => d.id === 'PC-A')!, o = printPreset('technical', snap);
  host.interfaces[0].address = null; host.interfaces[0].prefix = null;
  o.names[host.id] = 'Very long presentation name ABCDEFGHIJKLMNOPQRSTUVWXYZ / Computer';
  const card = () => makeCards(snap, o, 'Gateway').find(c => c.device.id === host.id)!;
  expect(card().info).toEqual(['eth0']); expect(card().footer).toEqual([]); expect(card().name.length).toBeGreaterThan(1);
  for (const name of card().name) expect(measureText(name, 20, true)).toBeLessThanOrEqual(card().width - 24);
  o.diagram.interfaces = false; expect(card().info).toEqual([]);
  o.diagram.names = false; o.diagram.types = false; expect(card().name).toEqual([]); expect(card().kindLines).toEqual([]);
  host.interfaces[0].address = '192.168.10.10'; host.interfaces[0].prefix = 27;
  expect(card().info).toEqual(['192.168.10.10/27']); o.diagram.cidr = false; expect(card().info).toEqual(['192.168.10.10']);
  host.kind = 'smartphone'; o.diagram.ipv4 = false; o.diagram.types = true; o.textSize = 'large';
  expect(card().kindLines).toEqual(['smartphone']); expect(card().width).toBeGreaterThanOrEqual(measureText('smartphone', 24 * .76) + 24);
});
