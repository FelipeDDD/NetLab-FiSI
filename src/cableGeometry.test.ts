import { expect, it } from 'vitest';
import { cableGeometry, loadCableStyle } from './cableGeometry';
const a = { x: 0, y: 0, width: 96, height: 78 };
it('stays finite before node measurement and continuous when crossing a corner', () => {
  expect(cableGeometry({ ...a, width: 0 }, { ...a, x: 400, y: 180 }, 'hybrid').path).not.toMatch(/NaN|Infinity/);
  const before = cableGeometry(a, { ...a, x: 300, y: 243 - 0.001 }, 'hybrid');
  const after = cableGeometry(a, { ...a, x: 300, y: 243 + 0.001 }, 'hybrid');
  for (let i = 0; i <= 20; i++) {
    const p = before.pointAt(i / 20), q = after.pointAt(i / 20);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.01);
  }
});
it('preserves the approved Straight border intersections', () => {
  const g = cableGeometry(a, { ...a, x: 300 }, 'straight');
  expect(g.path).toBe('M 96,39L 300,39'); expect(g.curved).toBe(false);
  expect(g.pointAt(0.5)).toEqual({ x: 198, y: 39 });
  expect(loadCableStyle()).toBe('straight');
});
it.each([{ x: 300, y: 0 }, { x: 0, y: 300 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 98, y: 1 }])('handles alignment, overlap and short gaps %o', p => {
  const g = cableGeometry(a, { ...a, ...p }, 'hybrid');
  expect(g.curved).toBe(false); expect(g.path).not.toMatch(/NaN|Infinity/);
});
it.each([{ x: 450, y: 180, width: 96, height: 78 }, { x: -300, y: 400, width: 160, height: 60 }, { x: 180, y: -350, width: 70, height: 120 }])('uses a reversible, smooth path at approximately constant speed %o', b => {
  const g = cableGeometry(a, b, 'hybrid'), reversed = cableGeometry(b, a, 'hybrid');
  expect(g.curved).toBe(true); expect(g.path).toContain('C');
  const distances = [];
  for (let i = 0; i <= 100; i++) {
    const p = g.pointAt(i / 100), r = reversed.pointAt(1 - i / 100);
    expect(p.x).toBeCloseTo(r.x, 5); expect(p.y).toBeCloseTo(r.y, 5);
    if (i) { const prev = g.pointAt((i - 1) / 100); distances.push(Math.hypot(p.x - prev.x, p.y - prev.y)); }
  }
  expect(Math.max(...distances) / Math.min(...distances)).toBeLessThan(1.02);
});

it.each(['straight', 'hybrid'] as const)('%s keeps front approaches continuous, downward and reversible', style => {
  const port = { x: 300, y: 200, width: 2, height: 2, front: { x: -24, y: 26 } };
  const peer = { x: 0, y: 180, width: 96, height: 78 };
  const forward = cableGeometry(port, peer, style), reverse = cableGeometry(peer, port, style);
  expect(forward.frontStart).toBeDefined(); expect(reverse.frontEnd).toBeDefined();
  expect(forward.pointAt(0)).toEqual({ x: 301, y: 201 });
  const early = forward.pointAt(5 / forward.length);
  expect(early.x).toBeCloseTo(301); expect(early.y).toBeCloseTo(206);
  expect(forward.isFrontAt(0)).toBe(true); expect(forward.isFrontAt(1)).toBe(false);
  for (let i = 0; i <= 100; i++) {
    const p = forward.pointAt(i / 100), q = reverse.pointAt(1 - i / 100);
    expect(p.x).toBeCloseTo(q.x, 4); expect(p.y).toBeCloseTo(q.y, 4);
    if (i) { const before = forward.pointAt((i - 1) / 100); expect(Math.hypot(p.x - before.x, p.y - before.y)).toBeLessThan(forward.length / 100 + 0.1); }
  }
});

it.each(['straight', 'hybrid'] as const)('%s reveals a short rear-arrival tip without changing the cable or packet path', style => {
  const peer = { x: 100, y: 0, width: 96, height: 78 };
  const port = { x: 230, y: 300, width: 2, height: 2 };
  const original = cableGeometry(peer, port, style);
  const tip = cableGeometry(peer, { ...port, visibleTip: 3 }, style);
  const reversed = cableGeometry({ ...port, visibleTip: 3 }, peer, style);
  expect(tip.path).toBe(original.path); expect(tip.length).toBe(original.length);
  expect(tip.frontEnd).toBeDefined(); expect(tip.frontStart).toBeUndefined();
  expect(tip.isFrontAt(1 - 2 / tip.length)).toBe(true);
  expect(tip.isFrontAt(1 - 4 / tip.length)).toBe(false);
  expect(reversed.isFrontAt(2 / reversed.length)).toBe(true);
  for (const t of [0, 0.25, 0.9, 1]) {
    expect(tip.pointAt(t)).toEqual(original.pointAt(t));
    expect(reversed.pointAt(1 - t).x).toBeCloseTo(tip.pointAt(t).x, 5);
    expect(reversed.pointAt(1 - t).y).toBeCloseTo(tip.pointAt(t).y, 5);
  }
});

import { readExperimentalStem } from './cableGeometry';
it('limits the temporary query parameter to the three experiment values', () => {
  expect(readExperimentalStem('')).toBeUndefined();
  expect(readExperimentalStem('?cableStem=50')).toBeUndefined();
  for (const n of [20, 10, 0]) expect(readExperimentalStem(`?cableStem=${n}`)).toBe(n);
});
it.each([20, 10, 0])('keeps Straight unchanged and curved travel reversible with %ipx rigid cap', cap => {
  const b = { x: 450, y: 180, width: 96, height: 78 };
  expect(cableGeometry(a, b, 'straight', 50, cap).path).toBe(cableGeometry(a, b, 'straight').path);
  const g = cableGeometry(a, b, 'hybrid', 50, cap), r = cableGeometry(b, a, 'hybrid', 50, cap);
  expect(g.curved).toBe(true); expect(g.path).toContain('C');
  for (let i = 0; i <= 100; i++) {
    const p = g.pointAt(i / 100), q = r.pointAt(1 - i / 100);
    expect(p.x).toBeCloseTo(q.x, 5); expect(p.y).toBeCloseTo(q.y, 5);
    if (i) { const prev = g.pointAt((i - 1) / 100); expect(Math.hypot(p.x-prev.x,p.y-prev.y)).toBeLessThan(g.length / 100 + 0.05); }
  }
  if (cap === 0) {
    const points = g.path.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!.map(Number);
    expect(points.slice(0, 2)).toEqual(points.slice(2, 4));
  }
});

it('reduces axial detours without moving endpoints, changing Straight or breaking reverse travel', () => {
  const b = { x: 320, y: 210, width: 96, height: 78 };
  const baseline = cableGeometry(a, b, 'hybrid');
  const soft = cableGeometry(a, b, 'hybrid', 50, undefined, 0.25);
  const reverse = cableGeometry(b, a, 'hybrid', 50, undefined, 0.25);
  expect(soft.length).toBeLessThan(baseline.length);
  expect(soft.pointAt(0)).toEqual(baseline.pointAt(0)); expect(soft.pointAt(1)).toEqual(baseline.pointAt(1));
  expect(cableGeometry(a,b,'straight',50,undefined,0.25).path).toBe(cableGeometry(a,b,'straight').path);
  for (const t of [0,0.1,0.5,0.9,1]) {
    expect(soft.pointAt(t).x).toBeCloseTo(reverse.pointAt(1-t).x,5);
    expect(soft.pointAt(t).y).toBeCloseTo(reverse.pointAt(1-t).y,5);
  }
});
