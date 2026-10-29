import { expect, it } from 'vitest';
import { dataPreviewState } from './DataPreview';
import { JOURNEY_DURATION_MS } from './geometry';

it('absorbs the document during the initial hold, then charges before movement', () => {
  const at = (ms: number) => dataPreviewState(ms / JOURNEY_DURATION_MS);
  expect(at(0).source.opacity).toBe(0);
  expect(at(400).source.opacity).toBeGreaterThan(.9);
  expect(at(1600).source.scale).toBeLessThan(.2);
  expect(at(1700).source).toEqual({ x: 140, y: 170, scale: expect.closeTo(.1), opacity: 0 });
  expect(at(2200).charge).toBe(1); expect(at(2800).charge).toBe(0);
});
it('reveals only at the server hold and ends before the response', () => {
  const at = (ms: number) => dataPreviewState(ms / JOURNEY_DURATION_MS).destination.opacity;
  expect(at(10600)).toBe(0); expect(at(11200)).toBeGreaterThan(0); expect(at(12000)).toBe(1);
  expect(at(13500)).toBe(0); expect(at(JOURNEY_DURATION_MS)).toBe(0);
});
it('is deterministic during pause and suppressed for reduced motion or seek', () => {
  expect(dataPreviewState(.04)).toEqual(dataPreviewState(.04));
  for (const p of [0,.04,.1,.56,1]) {
    const state = dataPreviewState(p, false);
    expect([state.source.opacity,state.destination.opacity,state.charge]).toEqual([0,0,0]);
  }
});
