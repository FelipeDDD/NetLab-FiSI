import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { cablePath, crossesCard, makeCards, type Card, type Rect } from './geometry';
import { studioLayout } from './diagram';

const card = (id: string, rect: Rect): Card => {
  const s = geometryFixture(), c = makeCards(s, printPreset('clean', s), 'Gateway')[0];
  return { ...c, ...rect, device: { ...c.device, id } };
};
it.each(['horizontal', 'vertical', 'diagonal'])('uses one segment with real border endpoints for %s cards of different sizes', direction => {
  const a = card('a', { x: 0, y: 0, width: 140, height: 90 });
  const b = card('b', { x: direction === 'vertical' ? -20 : 350, y: direction === 'horizontal' ? -32 : 300, width: 180, height: 154 });
  const route = cablePath(a, b, [a, b]); expect(route.points).toHaveLength(2); expect(route.obstructed).toBe(false);
  for (const [p, c] of [[route.points[0], a], [route.points[1], b]] as const) {
    expect(p.x).toBeGreaterThanOrEqual(c.x); expect(p.x).toBeLessThanOrEqual(c.x + c.width);
    expect(p.y).toBeGreaterThanOrEqual(c.y); expect(p.y).toBeLessThanOrEqual(c.y + c.height);
    expect(Math.min(Math.abs(p.x - c.x), Math.abs(p.x - c.x - c.width), Math.abs(p.y - c.y), Math.abs(p.y - c.y - c.height))).toBeLessThan(.001);
  }
});
it('keeps almost aligned links straight and retains genuine diagonals', () => {
  const a = card('a', { x: 0, y: 0, width: 140, height: 100 }), b = card('b', { x: 350, y: 4, width: 140, height: 100 });
  let route = cablePath(a, b, [a, b]); expect(route.points[0].y).toBe(route.points[1].y);
  b.x = 4; b.y = 300; route = cablePath(a, b, [a, b]); expect(route.points[0].x).toBe(route.points[1].x);
  b.x = 200; route = cablePath(a, b, [a, b]); expect(route.points[0].x).not.toBe(route.points[1].x); expect(route.points[0].y).not.toBe(route.points[1].y);
});
it('uses a simple detour only for a real obstacle, with no duplicate or tiny stub segments', () => {
  const a = card('a', { x: 0, y: 0, width: 140, height: 100 }), b = card('b', { x: 500, y: 3, width: 140, height: 100 });
  const obstacle = card('obstacle', { x: 260, y: -10, width: 140, height: 120 }), route = cablePath(a, b, [a, b, obstacle]);
  expect(route.obstructed).toBe(false); expect(route.points.length).toBeGreaterThan(2);
  for (const [i, p] of route.points.slice(1).entries()) {
    expect(Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y)).toBeGreaterThanOrEqual(8);
    expect([a, b, obstacle].some(c => crossesCard(route.points[i], p, c))).toBe(false);
  }
});
it('retains real interface associations after moving and resizing a router in the four-router topology', () => {
  const s = geometryFixture(), original = structuredClone(s), o = printPreset('technical', s); o.diagram.areas = true;
  for (const interfaces of [false, true]) for (const textSize of ['small', 'normal', 'large'] as const) {
    o.diagram.interfaces = interfaces; o.textSize = textSize; o.devicePositions.D = { x: 500, y: 460 };
    const l = studioLayout(s, o, 'en');
    expect(l.cables.map(c => c.link)).toEqual(s.links);
    for (const c of l.cables) expect(c.labels.map(label => label.lines.join(''))).toEqual([c.link.a[1], c.link.b[1]]);
  }
  expect(s).toEqual(original);
});

it('keeps a straight path when the actual card strokes clear it inside the former two-unit halo', () => {
  const a = card('a', { x: 0, y: 0, width: 140, height: 100 }), b = card('b', { x: 500, y: 0, width: 140, height: 100 });
  const c = card('c', { x: 260, y: 51.75, width: 140, height: 100 });
  expect(crossesCard({ x: 140, y: 50 }, { x: 500, y: 50 }, c)).toBe(false);
  const route = cablePath(a, b, [a, b, c]);
  expect(route.obstructed).toBe(false);
  expect(route.points).toEqual([{ x: 140, y: 50 }, { x: 500, y: 50 }]);
  c.y = 51;
  const tight = cablePath(a, b, [a, b, c]);
  expect(tight.points.length).toBeGreaterThan(2);
});
