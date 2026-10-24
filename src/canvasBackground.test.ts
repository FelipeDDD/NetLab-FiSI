import { afterEach, expect, it, vi } from 'vitest';
import { BACKGROUND_KEY, DEFAULT_BACKGROUND, normalizeBackground, readBackground, useCanvasBackground } from './canvasBackground';

afterEach(() => vi.unstubAllGlobals());
it('normalizes invalid settings and clamps intensity', () => {
  expect(normalizeBackground(null)).toEqual(DEFAULT_BACKGROUND);
  expect(normalizeBackground({ choice: 'bad' as never, intensity: NaN, dots: 'yes' as never })).toEqual(DEFAULT_BACKGROUND);
  expect(normalizeBackground({ intensity: -10 }).intensity).toBe(0);
  expect(normalizeBackground({ intensity: 130 }).intensity).toBe(100);
});
it('persists settings and honors URL overrides without saving them', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  useCanvasBackground.getState().update({ choice: 'verde2', intensity: 50, dots: false, animation: 'off' });
  expect(readBackground()).toEqual({ choice: 'verde2', intensity: 50, dots: false, animation: 'off' });
  expect(readBackground('?background=verde1')).toEqual({ choice: 'verde1', intensity: 50, dots: false, animation: 'off' });
  expect(readBackground('?background=original').choice).toBe('original');
  expect(readBackground('?background=bad').choice).toBe('verde2');
  expect(JSON.parse(values.get(BACKGROUND_KEY)!).choice).toBe('verde2');
});
it('works with corrupt or unavailable browser storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem: () => { throw Error('blocked'); } });
  expect(readBackground()).toEqual(DEFAULT_BACKGROUND);
  expect(() => useCanvasBackground.getState().update({ intensity: 0 })).not.toThrow();
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); } });
  expect(readBackground('?background=verde1').choice).toBe('verde1');
});
