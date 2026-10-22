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
