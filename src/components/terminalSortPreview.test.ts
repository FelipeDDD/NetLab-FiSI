import { expect, it } from 'vitest';
import { edgeScrollSpeed, insertionAnchor, sortPreviewOffsets } from './terminalSortPreview';

it('previews variable-width neighbors at fixed midpoints without mutating the real order', () => {
  const items = [{ id: 'a', left: 5, width: 100 }, { id: 'b', left: 109, width: 150 }, { id: 'c', left: 263, width: 80 }];
  expect(insertionAnchor(items, 183, 'a')).toBe('b');
  expect(insertionAnchor(items, 185, 'a')).toBe('c');
  expect(sortPreviewOffsets(items, 'a', 'c', 0, 4)).toEqual({ b: -104, a: 154, c: 0 });
  expect(sortPreviewOffsets(items, 'c', 'a', 0, 4)).toEqual({ c: -258, a: 84, b: 84 });
  expect(sortPreviewOffsets(items, 'external', 'b', 120, 4)).toEqual({ a: 0, b: 124, c: 124 });
  expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  expect(sortPreviewOffsets(items, 'a', 'missing')).toEqual({});
});

it('scrolls smoothly at horizontal edges, stopping outside the viewport or in its center', () => {
  expect(edgeScrollSpeed(10, 10, 600)).toBe(-14);
  expect(edgeScrollSpeed(600, 10, 600)).toBe(14);
  expect(edgeScrollSpeed(580, 10, 600)).toBeGreaterThan(0);
  expect(edgeScrollSpeed(300, 10, 600)).toBe(0);
  expect(edgeScrollSpeed(605, 10, 600)).toBe(0);
});
