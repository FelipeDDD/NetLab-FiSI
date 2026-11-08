import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset, reconcilePrintOptions } from './options';
import { studioLayout, studioDiagram } from './diagram';
import { reportTables, studioReport } from './report';
import { blockScaleLimits, newRoutingBlock, resizedRoutingBlock, scaledRoutingBlock } from './routingBlocks';

const fixture = () => {
  const s = geometryFixture(), o = printPreset('presentation', s);
  o.routingBlocks = ['A', 'B', 'D'].map(id => newRoutingBlock(s.devices.find(d => d.id === id)!, id));
  o.routingBlocks[2].columns.origin = true;
  o.routingBlocks[2].position = { x: 12, y: 220 };
  return { s, o };
};
it('scales all dimensions and strokes without changing composition, routes or neighbours', () => {
  const { s, o } = fixture(), before = studioLayout(s, o, 'de'), box = before.blocks[2];
  const scaled = scaledRoutingBlock(o, box, before.page.area, .8);
  expect(scaled.width).toBeCloseTo(box.width * .8, 8); expect(scaled.height).toBeCloseTo(box.height * .8, 8);
  expect(scaled.x).toBe(box.x); expect(scaled.y).toBe(box.y);
  for (const key of ['title', 'columns', 'rows', 'titleHeight', 'headerHeight', 'size', 'count', 'baseWidth', 'baseHeight'] as const) expect(scaled.content[key]).toEqual(box.content[key]);
  o.routingBlocks[2].scale = .8;
  o.routingBlocks[2].customWidth = box.content.baseWidth;
  const after = studioLayout(s, o, 'de'); expect(after.blocks[2].width).toBeCloseTo(scaled.width, 8);
  expect(after.blocks[2].content.rows).toEqual(box.content.rows); expect(after.blocks[2].content.columns).toEqual(box.content.columns);
  expect(after.blocks.slice(0, 2)).toEqual(before.blocks.slice(0, 2)); expect(after.documentCards).toEqual(before.documentCards); expect(after.cables).toEqual(before.cables);
  const svg = studioDiagram(s, o, 'de'); expect(svg).toContain('data-block-content="" transform="scale(0.8)"');
  expect(svg).not.toContain('data-block-scale='); expect(svg).not.toContain('data-block-resize=');
  expect(studioReport(s, o, 'de').html).toContain(svg);
});
it.each(['small', 'normal', 'large'] as const)('%s: bounds physical font size, enlargement and printable area', textSize => {
  const { s, o } = fixture(); o.textSize = textSize;
  const l = studioLayout(s, o, 'en'), box = l.blocks[2], min = blockScaleLimits(o).min;
  const small = scaledRoutingBlock(o, box, l.page.area, 0);
  expect(small.content.scale).toBe(min); expect((small.content.size - 1) * small.content.scale * .75).toBeGreaterThanOrEqual(7);
  const big = scaledRoutingBlock(o, box, l.page.area, 20);
  expect(big.content.scale).toBeLessThanOrEqual(1.5); expect(big.x).toBe(box.x); expect(big.y).toBe(box.y);
  expect(big.x + big.width).toBeLessThanOrEqual(l.page.area.x + l.page.area.width + .001);
  expect(big.y + big.height).toBeLessThanOrEqual(l.page.area.y + l.page.area.height + .001);
});
it('keeps width reflow independent of proportional scale and its physical font size', () => {
  const { s, o } = fixture(); o.routingBlocks[2].scale = .8;
  const l = studioLayout(s, o, 'en'), b = l.blocks[2], resized = resizedRoutingBlock(s, o, 'en', b, l.page.area, b.width + 160);
  expect(resized.content.scale).toBe(.8); expect(resized.content.size).toBe(b.content.size);
  expect(resized.width).toBeCloseTo(b.width + 160, 8);
  expect(resized.content.rows).toHaveLength(b.content.rows.length); expect(resized.content.columns).not.toEqual(b.content.columns);
  expect(resized.x).toBe(b.x); expect(resized.y).toBe(b.y);
});
it('retains scale, composition and filters on refresh; clamps smaller paper without shrinking below readable text', () => {
  const { s, o } = fixture(); o.paper = 'A3'; const b = o.routingBlocks[2]; b.scale = 1.3; b.customWidth = 650; b.filter = 'static';
  const original = structuredClone(s), technical = reportTables(s, o, 'en');
  expect(reconcilePrintOptions(o, s).routingBlocks[2]).toEqual(b);
  for (const paper of ['A4', 'A3'] as const) for (const orientation of ['portrait', 'landscape'] as const) {
    o.paper = paper; o.orientation = orientation; const l = studioLayout(s, o, 'en'), c = l.blocks[2];
    expect(c.content.scale).toBeGreaterThanOrEqual(blockScaleLimits(o).min);
    expect(c.content.baseWidth).toBe(650); expect(c.content.rows).toHaveLength(s.devices.find(d => d.id === 'D')!.routes.filter(r => r.origin === 'static').length);
    if (!c.oversized) { expect(c.x + c.width).toBeLessThanOrEqual(l.page.area.width + .001); expect(c.y + c.height).toBeLessThanOrEqual(l.page.area.y + l.page.area.height + .001); }
  }
  expect(b.scale).toBe(1.3); expect(b.customWidth).toBe(650); expect(s).toEqual(original); expect(reportTables(s, o, 'en')).toEqual(technical);
});
it('keeps every row and blocks export when even the minimum readable scale cannot fit', () => {
  const { s, o } = fixture(), d = s.devices.find(d => d.id === 'D')!;
  d.routes = Array.from({ length: 100 }, (_, i) => ({ destination: `192.168.${i}.0`, prefix: 24, via: '172.16.0.1', iface: 'eth0', origin: 'static' }));
  o.routingBlocks[2].scale = .8; const box = studioLayout(s, o, 'en').blocks[2];
  expect(box.oversized).toBe(true); expect(box.content.rows).toHaveLength(100); expect(box.content.scale).toBe(.8);
});

it('wraps long IPv4/CIDR only between octets, preserving the complete address', () => {
  const { s, o } = fixture(), d = s.devices.find(d => d.id === 'D')!;
  d.routes = [{ destination: '192.168.200.254', prefix: 32, via: '172.254.200.254', iface: 'eth0', origin: 'static' }];
  const row = studioLayout(s, o, 'en').blocks[2].content.rows[0];
  for (const [index, expected] of ['192.168.200.254/32', '172.254.200.254'].entries()) {
    expect(row.cells[index].join('')).toBe(expected);
    for (const line of row.cells[index].slice(0, -1)) expect(line.endsWith('.')).toBe(true);
  }
});
