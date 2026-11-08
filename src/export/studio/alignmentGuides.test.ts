import { expect, it } from 'vitest';
import { alignDeviceCenter } from './alignmentGuides';
import { overlaps } from './geometry';

const area = { x: 0, y: 0, width: 800, height: 900 };
for (const axis of ['x', 'y'] as const) for (const ratio of [0, .5, 1]) {
  it(`snaps ${axis} ${ratio} using real different card dimensions`, () => {
    const other = { x: 200, y: 200, width: 180, height: 120 }, size = { width: 100, height: 70 };
    const dimension = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x';
    const position = { x: 550, y: 550 }; position[axis] = other[axis] + other[dimension] * ratio + size[dimension] * (.5 - ratio) + 4;
    const result = alignDeviceCenter(position, size, [other], area, 6);
    expect(result.position[axis]).toBeCloseTo(position[axis] - 4);
    expect(result.position[cross]).toBe(position[cross]); expect(result.guides[0].edge).toBe(['start', 'center', 'end'][ratio * 2]);
    expect(result.guides[0].value).toBe(other[axis] + other[dimension] * ratio);
  });
}
it('uses a screen-pixel tolerance at Fit Page, Fit Width and manual zoom and releases outside the threshold', () => {
  for (const zoom of [.25, .48, .8, 1, 1.25, 1.5]) {
    const other = { x: 100, y: 400, width: 100, height: 100 }, size = { width: 100, height: 100 };
    expect(alignDeviceCenter({ x: 150 + 5 / zoom, y: 100 }, size, [other], area, 6 / zoom).position.x).toBe(150);
    const free = { x: 150 + 7 / zoom, y: 100 }; expect(alignDeviceCenter(free, size, [other], area, 6 / zoom).position).toEqual(free);
  }
});
it('supports diagonal two-axis snap while keeping references fixed and limits guides to the page', () => {
  const others = [{ x: 200, y: 500, width: 100, height: 100 }, { x: 500, y: 200, width: 100, height: 100 }], before = structuredClone(others);
  const result = alignDeviceCenter({ x: 254, y: 246 }, { width: 100, height: 100 }, others, area, 6);
  expect(result.position).toEqual({ x: 250, y: 250 }); expect(result.guides).toHaveLength(2); expect(others).toEqual(before);
  for (const guide of result.guides) { expect(guide.from).toBeGreaterThanOrEqual(0); expect(guide.to).toBeLessThanOrEqual(900); }
});
it('refuses overlap and snapping past the printable boundary without limiting free drag', () => {
  const size = { width: 100, height: 100 }, others = [{ x: 202, y: 202, ...size }], free = { x: 250, y: 250 };
  const result = alignDeviceCenter(free, size, others, area, 6); expect(result.position).toEqual(free); expect(result.guides).toEqual([]);
  const edge = alignDeviceCenter({ x: 52, y: 100 }, size, [{ x: -2, y: 400, ...size }], area, 6);
  expect(edge.position.x).toBe(52); expect(edge.guides).toEqual([]);
  const safe = alignDeviceCenter({ x: 254, y: 100 }, size, others, area, 6);
  expect(overlaps({ x: safe.position.x - 50, y: safe.position.y - 50, ...size }, others[0])).toBe(false);
});

it('never uses a Routing Table as an alignment reference and rejects snap into documentation', () => {
  const table = { x: 190, y: 40, width: 120, height: 120 }, size = { width: 100, height: 100 };
  const p = { x: 248, y: 100 }, reference = { x: 200, y: 500, ...size };
  const result = alignDeviceCenter(p, size, [reference], area, 6, [table]);
  expect(result.position).toEqual(p); expect(result.guides).toEqual([]);
  expect(alignDeviceCenter({ x: 203, y: 300 }, size, [], area, 6, [table]).guides).toEqual([]);
});
