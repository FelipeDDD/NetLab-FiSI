import { expect, it } from 'vitest';
import { capturePrintSnapshot } from './model';
import { studioFixture } from './studio.fixture';
import { geometryFixture } from './geometry.fixture';
import { printPreset, reconcilePrintOptions } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { studioReport, reportTables } from './report';
import { newRoutingBlock, routingBlockContent, initialBlockPosition, selectBlockRoutes, routingDevices, clampBlockPosition } from './routingBlocks';
import { blocksFixture } from './blocks.fixture';
import { normalizeProjectDocument } from '../../projects/projectDocument';

it.each(['simple', 'four', 'dense'] as const)('uses a valid isolated %s project for the browser review', scene => {
  expect(() => normalizeProjectDocument(blocksFixture(scene))).not.toThrow();
});

it('uses exact snapshot routes with independent type and output-interface filters', () => {
  const { net, visual, r1 } = studioFixture(), snap = capturePrintSnapshot(net, visual), device = snap.devices.find(d => d.id === r1.id)!;
  const block = newRoutingBlock(device, 'block'), original = structuredClone(snap);
  expect(routingDevices(snap).some(d => d.kind === 'switch')).toBe(false);
  expect(selectBlockRoutes(device, block)).toEqual(device.routes);
  block.filter = 'static'; expect(selectBlockRoutes(device, block).map(r => r.origin)).toEqual(['static']);
  block.filter = 'default'; expect(selectBlockRoutes(device, block)).toEqual(device.routes.filter(r => r.prefix === 0));
  block.filter = 'connected'; block.interfaceNames = ['eth1']; expect(selectBlockRoutes(device, block)).toEqual(device.routes.filter(r => r.origin === 'connected' && r.iface === 'eth1'));
  block.interfaceNames = []; expect(selectBlockRoutes(device, block)).toEqual([]); expect(snap).toEqual(original);
});

it('keeps topology geometry and page transform fixed when adding, moving or removing three blocks', () => {
  const snap = geometryFixture(), o = printPreset('clean', snap), before = studioLayout(snap, o, 'en');
  o.diagramScale = .8; const baseline = studioLayout(snap, o, 'en');
  for (const id of ['A', 'B', 'D']) {
    const block = newRoutingBlock(snap.devices.find(d => d.id === id)!, id), content = routingBlockContent(snap, block, o, 'en');
    const current = studioLayout(snap, o, 'en');
    block.position = initialBlockPosition(content, current.page.area, [...current.documentCards, ...current.documentLabels, ...current.blocks], current.documentCables);
    o.routingBlocks.push(block);
  }
  const after = studioLayout(snap, o, 'en');
  expect(after.boxes).toEqual(before.boxes); expect(after.blocks.every(b => !b.overlap && !b.oversized)).toBe(true);
  for (const key of ['tx', 'ty', 'scale'] as const) expect(after[key]).toBe(baseline[key]);
  o.routingBlocks[0].position = { x: 400, y: 300 };
  const moved = studioLayout(snap, o, 'en'); expect(moved.blocks[0].overlap).toBe(true);
  for (const key of ['tx', 'ty', 'scale'] as const) expect(moved[key]).toBe(baseline[key]);
  expect(moved.blocks.slice(1).map(b => [b.x, b.y])).toEqual(after.blocks.slice(1).map(b => [b.x, b.y]));
});

it('embeds the exact same printable SVG in HTML without creating report tables or extra pages', () => {
  const { net, visual, r1 } = studioFixture(), snap = capturePrintSnapshot(net, visual), o = printPreset('clean', snap);
  o.routingBlocks.push(newRoutingBlock(snap.devices.find(d => d.id === r1.id)!, 'first'));
  const svg = studioDiagram(snap, o, 'en'), report = studioReport(snap, o, 'en');
  expect(report.html).toContain(svg); expect(report.pages).toBe(1); expect(reportTables(snap, o, 'en')).toEqual([]);
  o.sections.routes.enabled = true; o.sections.routes.deviceIds = [r1.id];
  expect(reportTables(snap, o, 'en')).toHaveLength(1); expect(studioReport(snap, o, 'en').pages).toBeGreaterThan(1);
});

it('preserves block IDs, positions and valid filters on refresh, and identifies removed devices without stale rows', () => {
  const { net, visual, r1 } = studioFixture(), snap = capturePrintSnapshot(net, visual), o = printPreset('clean', snap), device = snap.devices.find(d => d.id === r1.id)!;
  const block = newRoutingBlock(device, 'stable'); block.position = { x: 35, y: 120 }; block.filter = 'static'; block.interfaceNames = ['eth1', 'removed']; o.routingBlocks.push(block);
  device.routes[0].destination = '172.16.0.0';
  const refreshed = reconcilePrintOptions(o, snap);
  expect(refreshed.routingBlocks[0]).toMatchObject({ id: 'stable', position: { x: 35, y: 120 }, filter: 'static', interfaceNames: ['eth1'] });
  const next = { ...snap, devices: snap.devices.filter(d => d.id !== r1.id) }, missing = reconcilePrintOptions(refreshed, next);
  expect(missing.routingBlocks).toHaveLength(1);
  const content = routingBlockContent(next, missing.routingBlocks[0], missing, 'en');
  expect(content.missing).toBe(true); expect(content.rows).toEqual([]); expect(content.title.join('')).toContain(r1.name); expect(content.notice.join('')).toContain('removed');
  expect(studioDiagram(next, missing, 'en')).toContain('data-missing="true"');
});

it('wraps complete table content, reports oversize and clamps document coordinates for either paper size', () => {
  const { net, visual, r1 } = studioFixture(), snap = capturePrintSnapshot(net, visual), device = snap.devices.find(d => d.id === r1.id)!, o = printPreset('clean', snap);
  device.name = '<Router with a very long name & ABCDEFGHIJKLMNOPQRSTUVWXYZ>';
  device.routes = Array.from({ length: 60 }, (_, i) => ({ destination: `192.168.${i}.0`, prefix: 24, via: '172.16.254.254', iface: 'ethernet-interface-with-a-long-name', origin: 'static' }));
  const block = newRoutingBlock(device, 'large'); block.columns.origin = true; block.position = { x: -500, y: 9000 }; o.routingBlocks.push(block);
  const layout = studioLayout(snap, o, 'pt-BR'), table = layout.blocks[0];
  expect(table.oversized).toBe(true); expect(table.content.rows).toHaveLength(60); expect(table.content.title.length).toBeGreaterThan(1);
  expect(table.x).toBe(0); expect(table.y).toBe(layout.page.area.y);
  expect(studioDiagram(snap, o, 'en')).toContain('&lt;Router');
  const box = { width: 300, height: 150 };
  for (const paper of ['A4', 'A3'] as const) { o.paper = paper; const area = studioLayout(snap, o, 'en').page.area, p = clampBlockPosition({ x: 9000, y: 9000 }, box, area); expect(p.x + box.width).toBeLessThanOrEqual(area.x + area.width + .01); expect(p.y + box.height).toBeLessThanOrEqual(area.y + area.height + .01); }
});
