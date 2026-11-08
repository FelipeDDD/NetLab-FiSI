import { describe, expect, it } from 'vitest';
import { geometryFixture, geometryScenes } from './geometry.fixture';
import { printPreset, type PrintPreset } from './options';
import { makeCards, separateCards, center, overlaps, cablePath, crossesCard, cableLabels, measureText, wrapText, diagramBounds, type Rect } from './geometry';
import { studioDiagram } from './diagram';

describe.each(['clean', 'technical', 'presentation'] as PrintPreset[])('%s geometry', preset => {
  it.each(geometryScenes)('preserves original order, connections and content in %s', scene => {
    const snapshot = geometryFixture(scene), before = structuredClone(snapshot), options = printPreset(preset, snapshot);
    options.diagram.gateways = true;
    const cards = makeCards(snapshot, options, 'Gateway'), result = separateCards(cards, options.diagram.cableLabels ? 48 : 24);
    expect(result.unresolved).toBe(false);
    for (const [i, a] of cards.entries()) {
      expect(a.width).toBeLessThanOrEqual(304);
      for (const b of cards.slice(i + 1)) {
        expect(overlaps(a, b)).toBe(false);
        for (const axis of ['x', 'y'] as const) expect((a.anchor[axis] - b.anchor[axis]) * (center(a)[axis] - center(b)[axis])).toBeGreaterThanOrEqual(-.01);
      }
      for (const [lines, size, bold, mono] of [[a.name, { small: 16, normal: 20, large: 24 }[options.textSize], true, false], [a.info, { small: 16, normal: 20, large: 24 }[options.textSize] * .82, false, true]] as const) {
        for (const line of lines) expect(measureText(line, size, bold, mono)).toBeLessThanOrEqual(a.width - 23.99);
      }
    }
    const occupied: Rect[] = [];
    for (const link of snapshot.links) {
      const a = cards.find(c => c.device.id === link.a[0])!, b = cards.find(c => c.device.id === link.b[0])!, route = cablePath(a, b, cards);
      expect(route.obstructed).toBe(false);
      for (const [p, box] of [[route.points[0], a], [route.points.at(-1)!, b]] as const) {
        expect(Math.min(Math.abs(p.x - box.x), Math.abs(p.x - box.x - box.width), Math.abs(p.y - box.y), Math.abs(p.y - box.y - box.height))).toBeLessThan(.001);
      }
      expect(route.points.slice(1).some((p, i) => cards.some(c => crossesCard(route.points[i], p, c)))).toBe(false);
      if (options.diagram.cableLabels) {
        const labels = cableLabels(route.points, [link.a[1], link.b[1]], cards, occupied, 20);
        expect(labels.crowded).toBe(false);
        expect(labels.labels.map(l => l.lines.join(''))).toEqual([link.a[1], link.b[1]]);
        for (const label of labels.labels) expect(cards.some(c => overlaps(label, c))).toBe(false);
      }
    }
    expect(snapshot).toEqual(before);
    const reversed = makeCards({ ...snapshot, devices: [...snapshot.devices].reverse() }, options, 'Gateway'); separateCards(reversed, options.diagram.cableLabels ? 48 : 24);
    expect([...cards].sort((a, b) => a.device.id.localeCompare(b.device.id))).toEqual(reversed.sort((a, b) => a.device.id.localeCompare(b.device.id)));
  });
});

it('keeps A B C aligned above D, with PCs and switches above them', () => {
  const snap = geometryFixture(), cards = makeCards(snap, printPreset('technical', snap), 'Gateway'); separateCards(cards, 40);
  const c = (id: string) => center(cards.find(c => c.device.id === id)!);
  // Local repair may introduce a few units of drift when neighbouring cards
  // have different heights; it must not turn this row into a vertical cascade.
  expect(Math.max(...['A', 'B', 'C'].map(id => c(id).y)) - Math.min(...['A', 'B', 'C'].map(id => c(id).y))).toBeLessThan(4);
  for (const id of ['A', 'B', 'C']) { expect(c(id).y).toBeLessThan(c('D').y); expect(c(`PC-${id}`).y).toBeLessThan(c(`SW-${id}`).y); expect(c(`SW-${id}`).y).toBeLessThan(c(id).y); }
});

it('leaves a distant group unchanged while separating a crowded pair locally', () => {
  const snap = geometryFixture('line'); snap.devices[1].x = 5; snap.devices[2].x = 2000;
  const cards = makeCards(snap, printPreset('clean', snap), 'Gateway'), distant = { ...cards[2] }; separateCards(cards);
  expect(cards[2]).toEqual(distant); expect(overlaps(cards[0], cards[1])).toBe(false);
});

it('keeps the inclination of a tightly spaced diagonal instead of flattening it into a row', () => {
  const snap = geometryFixture('close'), cards = makeCards(snap, printPreset('technical', snap), 'Gateway'); separateCards(cards, 40);
  for (const a of cards) for (const b of cards) if (a !== b) expect((center(b).y - center(a).y) / (center(b).x - center(a).x)).toBeCloseTo(12 / 25, 5);
});

it('uses one proportional page transform and gives A3 more readable text', () => {
  const snap = geometryFixture(), o = printPreset('technical', snap);
  const a4 = studioDiagram(snap, o, 'en'), a3 = studioDiagram(snap, { ...o, paper: 'A3' }, 'en');
  const px = (svg: string) => Number(/data-label-px="([\d.]+)"/.exec(svg)![1]);
  expect(px(a3)).toBeGreaterThan(px(a4));
  expect(a4).toMatch(/scale\([\d.]+\)/); expect(a4).not.toMatch(/scale\([\d.]+[, ]/);
  expect(a4.match(/data-link=/g)).toHaveLength(snap.links.length);
});

it('wraps Unicode, explicit newlines and long unbroken names without losing content', () => {
  const text = 'WWWiii 路由器 😀 ABCDEFGHIJKLMNOPQRSTUVWXYZ\nsecond line';
  const lines = wrapText(text, 80, s => measureText(s, 20));
  expect(lines.join('')).toBe(text.replace('\n', '')); expect(lines.every(l => measureText(l, 20) <= 80)).toBe(true);
});

it('includes labels and cable bends in diagram bounds', () => {
  expect(diagramBounds([{ x: -200, y: -100, width: 20, height: 30 }, { x: 500, y: 400, width: 70, height: 10 }], 16)).toEqual({ x: -216, y: -116, width: 802, height: 542 });
});
