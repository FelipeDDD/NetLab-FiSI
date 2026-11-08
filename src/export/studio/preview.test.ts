import { expect, it } from 'vitest';
import { previewScale } from './preview';

it('fits a complete sheet in both axes, independently of paper size or viewport', () => {
  for (const width of [794, 1123, 1588]) for (const height of [794, 1123, 1588])
    for (const availableWidth of [400, 1000, 2200]) for (const availableHeight of [300, 700, 1200]) {
      const s = previewScale('page', width, height, availableWidth, availableHeight);
      expect(s * width).toBeLessThanOrEqual(availableWidth - 16 + .01);
      expect(s * height).toBeLessThanOrEqual(availableHeight - 16 + .01);
    }
});
it('retains manual zoom and fit-width behavior', () => {
  for (const zoom of [.25, .5, .75, 1, 1.25, 1.5]) expect(previewScale(zoom, 1100, 800, 400, 300)).toBe(zoom);
  expect(previewScale(0, 1100, 800, 2200, 300)).toBe(1);
  expect(previewScale(0, 1100, 800, 566, 300)).toBe(.5);
});
