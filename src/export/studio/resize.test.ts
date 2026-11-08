import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset, reconcilePrintOptions } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { studioReport } from './report';
import { blockWidthLimits, newRoutingBlock, resizedRoutingBlock } from './routingBlocks';

it('reflows all routes at a fixed left/top, without moving cards, cables or other tables', () => {
  const s = geometryFixture(), o = printPreset('technical', s); o.sections.diagram.enabled = true;
  const d = s.devices.find(d => d.id === 'D')!;
  d.routes = Array.from({ length: 8 }, (_, i) => ({ destination: `192.168.${i}.0`, prefix: 24, via: '172.16.254.254', iface: 'ethernet-output-long-name', origin: 'static' }));
  o.routingBlocks = ['D', 'A', 'B'].map(id => newRoutingBlock(s.devices.find(d => d.id === id)!, id));
  o.routingBlocks[0].columns.origin = true;
  const before = studioLayout(s, o, 'de'), b = before.blocks[0];
  const wide = resizedRoutingBlock(s, o, 'de', b, before.page.area, 620);
  expect(wide.x).toBe(b.x); expect(wide.y).toBe(b.y); expect(wide.width).toBe(620);
  expect(wide.height).toBeLessThan(b.height); expect(wide.content.rows).toHaveLength(8);
  for (const [i, route] of d.routes.entries()) {
    expect(wide.content.rows[i].cells[0].join('')).toBe(`${route.destination}/${route.prefix}`);
    expect(wide.content.rows[i].cells[1].join('')).toBe(route.via);
    expect(wide.content.rows[i].cells[2].join('')).toBe(route.iface);
  }
  o.routingBlocks[0].customWidth = wide.width;
  const after = studioLayout(s, o, 'de');
  expect(after.boxes).toEqual(before.boxes); expect(after.cables).toEqual(before.cables);
  expect(after.blocks.slice(1)).toEqual(before.blocks.slice(1));
});

it('bounds width by columns, right edge and automatic height without discarding routes', () => {
  const s = geometryFixture(), o = printPreset('clean', s); o.routingBlocks = [newRoutingBlock(s.devices[0], 't')];
  const l = studioLayout(s, o, 'en'), b = l.blocks[0], area = l.page.area;
  const large = resizedRoutingBlock(s, o, 'en', b, area, 90000);
  expect(large.x + large.width).toBeLessThanOrEqual(area.x + area.width + .01);
  const small = resizedRoutingBlock(s, o, 'en', large, area, 1);
  expect(small.width).toBeGreaterThanOrEqual(blockWidthLimits(b.content.block, area.width).min);
  expect(small.content.rows.length).toBe(b.content.rows.length);
  expect(small.y + small.height).toBeLessThanOrEqual(area.y + area.height + .01);
});

it('retains requested widths through refresh/presets, clamps smaller paper and uses the same SVG in HTML', () => {
  const s = geometryFixture(), o = printPreset('clean', s); o.paper = 'A3';
  const b = newRoutingBlock(s.devices[0], 't'); b.customWidth = 1050; b.position = { x: 400, y: 250 }; o.routingBlocks = [b];
  const before = studioLayout(s, o, 'en').blocks[0];
  expect(before.x).toBe(400); expect(before.width).toBe(1050);
  const refreshed = reconcilePrintOptions(o, s); expect(refreshed.routingBlocks[0]).toEqual(b);
  o.paper = 'A4'; o.orientation = 'portrait';
  const small = studioLayout(s, o, 'en');
  expect(small.blocks[0].x + small.blocks[0].width).toBeLessThanOrEqual(small.page.area.x + small.page.area.width + .01);
  expect(b.customWidth).toBe(1050);
  o.paper = 'A3'; o.orientation = 'landscape'; expect(studioLayout(s, o, 'en').blocks[0].width).toBe(1050);
  const svg = studioDiagram(s, o, 'en'); expect(studioReport(s, o, 'en').html).toContain(svg);
  expect(svg).not.toContain('data-block-resize'); expect(svg).not.toContain('data-studio-block-ui');
  b.customWidth = undefined; expect(studioLayout(s, o, 'en').blocks[0].width).toBe(300);
});

it('stops narrowing before wrapped rows would cross the bottom edge', () => {
  const s = geometryFixture(), o = printPreset('clean', s), device = s.devices.find(d => d.id === 'D')!;
  device.routes = Array.from({ length: 8 }, (_, i) => ({ destination: `192.168.${i}.0`, prefix: 24, via: '172.16.254.254', iface: 'eth-interface-output', origin: 'static' }));
  const b = newRoutingBlock(device, 't'); b.customWidth = 640; b.columns.origin = true; o.routingBlocks = [b];
  const l = studioLayout(s, o, 'en'), box = l.blocks[0];
  box.y = l.page.area.y + l.page.area.height - box.height;
  const narrow = resizedRoutingBlock(s, o, 'en', box, l.page.area, 1);
  expect(narrow.width).toBeGreaterThan(blockWidthLimits(b, l.page.area.width).min);
  expect(narrow.x).toBe(box.x); expect(narrow.y).toBe(box.y);
  expect(narrow.y + narrow.height).toBeLessThanOrEqual(l.page.area.y + l.page.area.height + .001);
  expect(narrow.content.rows).toHaveLength(8);
});
