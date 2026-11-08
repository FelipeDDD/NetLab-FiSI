import { expect, it } from 'vitest';
import { unambiguousDropTarget } from './canvasDropTarget';

it('accepts all parts of one existing selection rectangle, including caption/border', () => {
  const regions = [{ id: 'router', x: 100, y: 80, width: 240, height: 220 }];
  for (const point of [{ x: 100, y: 80 }, { x: 340, y: 300 }, { x: 220, y: 160 }, { x: 105, y: 200 }, { x: 200, y: 285 }]) expect(unambiguousDropTarget(point, regions)).toBe('router');
  for (const point of [{ x: 99, y: 100 }, { x: 200, y: 301 }, { x: 400, y: 150 }]) expect(unambiguousDropTarget(point, regions)).toBeNull();
});
it('rejects overlapping devices even if one is nearer or first in DOM order', () => {
  const regions = [{ id: 'a', x: 100, y: 100, width: 200, height: 200 }, { id: 'b', x: 250, y: 100, width: 200, height: 200 }];
  expect(unambiguousDropTarget({ x: 280, y: 180 }, regions)).toBeNull(); expect(unambiguousDropTarget({ x: 280, y: 180 }, [...regions].reverse())).toBeNull();
  expect(unambiguousDropTarget({ x: 110, y: 110 }, regions)).toBe('a'); expect(unambiguousDropTarget({ x: 420, y: 110 }, regions)).toBe('b');
});
it('uses client-space bounds consistently at every supported zoom without broadening hitboxes', () => {
  for (const zoom of [.25, .5, .65, 1, 1.25]) {
    const region = { id: 'r', x: 120 + 100 * zoom, y: 80 + 200 * zoom, width: 240 * zoom, height: 220 * zoom };
    expect(unambiguousDropTarget({ x: region.x + region.width - .01, y: region.y + region.height - .01 }, [region])).toBe('r');
    expect(unambiguousDropTarget({ x: region.x + region.width + .01, y: region.y }, [region])).toBeNull();
  }
});
