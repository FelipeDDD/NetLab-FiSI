import { expect, it } from 'vitest';
import { alignDeviceCenter } from './alignmentGuides';
import { distanceCandidates, distanceLabel } from './distanceGuides';
import { center } from './geometry';

const area = { x: 0, y: 0, width: 1400, height: 1100 };
it('snaps distant triangle symmetry horizontally and aligns the upper cards without measuring diagonal cables', () => {
  const refs = [{ x: 150, y: 100, width: 100, height: 80 }, { x: 600, y: 750, width: 120, height: 100 }], before = structuredClone(refs);
  const r = alignDeviceCenter({ x: 1124, y: 143 }, { width: 160, height: 80 }, refs, area, 6);
  expect(r.position).toEqual({ x: 1120, y: 140 }); expect(r.distances).toHaveLength(1);
  expect(r.distances[0].kind).toBe('symmetry'); expect(r.distances[0].axis).toBe('x');
  expect(r.distances[0].pivot?.value).toBe(660); expect(distanceLabel(r.distances[0])).toBe('460 px ↔ 460 px');
  expect(r.guides.some(g => g.axis === 'y')).toBe(true); expect(refs).toEqual(before);
});
it('uses facing edges for equal gaps between unequal cards, including a fourth card in a row', () => {
  const refs = [{ x: 50, y: 200, width: 100, height: 80 }, { x: 230, y: 200, width: 160, height: 80 }, { x: 470, y: 200, width: 70, height: 80 }];
  const r = alignDeviceCenter({ x: 684, y: 240 }, { width: 120, height: 80 }, refs, area, 6);
  expect(r.position.x).toBe(680); expect(r.distances[0].kind).toBe('spacing'); expect(distanceLabel(r.distances[0])).toBe('80 px ↔ 80 px');
  const between = alignDeviceCenter({ x: 313, y: 540 }, { width: 80, height: 100 }, [{ x: 100, y: 490, width: 90, height: 100 }, { x: 430, y: 490, width: 150, height: 100 }], area, 6);
  expect(between.position.x).toBe(310); expect(distanceLabel(between.distances[0])).toBe('80 px ↔ 80 px');
});
it('keeps numeric measurements in document units at every preview scale and releases outside screen tolerance', () => {
  const refs = [{ x: 100, y: 100, width: 100, height: 80 }, { x: 450, y: 600, width: 100, height: 80 }];
  for (const zoom of [.25, .5, .65, 1, 1.25]) {
    const r = alignDeviceCenter({ x: 850 + 5 / zoom, y: 140 }, { width: 100, height: 80 }, refs, area, 6 / zoom);
    expect(r.position.x).toBe(850); expect(distanceLabel(r.distances[0])).toBe('350 px ↔ 350 px');
    const free = { x: 850 + 7 / zoom, y: 140 };
    expect(alignDeviceCenter(free, { width: 100, height: 80 }, refs, area, 6 / zoom).position.x).toBe(free.x);
  }
});
it('refuses distance snaps through cards or tables, outside the page, or without relevant row references', () => {
  const refs = [{ x: 100, y: 100, width: 100, height: 80 }, { x: 450, y: 600, width: 100, height: 80 }], size = { width: 100, height: 80 }, p = { x: 854, y: 140 };
  expect(alignDeviceCenter(p, size, refs, area, 6, [{ x: 820, y: 80, width: 160, height: 120 }]).distances).toEqual([]);
  expect(alignDeviceCenter(p, size, refs, { ...area, width: 880 }, 6).distances).toEqual([]);
  expect(distanceCandidates({ x: 800, y: 400, ...size }, refs, 'x', 6)).toEqual([]);
});
it('retains a previously chosen nearby reference until it leaves tolerance', () => {
  const refs = [{ x: 100, y: 100, width: 100, height: 80 }, { x: 450, y: 600, width: 100, height: 80 }, { x: 803, y: 900, width: 100, height: 80 }];
  const r = alignDeviceCenter({ x: 852, y: 140 }, { width: 100, height: 80 }, refs, area, 6, [], { x: 850 });
  expect(r.position.x).toBe(850); expect(center(refs[1]).x).toBe(500);
});
