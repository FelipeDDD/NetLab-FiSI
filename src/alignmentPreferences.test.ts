import { afterEach, expect, it, vi } from 'vitest';
import { ALIGNMENT_GUIDES_KEY, normalizeAlignmentGuides, readAlignmentGuides, useAlignmentPreference } from './alignmentPreferences';

afterEach(() => vi.unstubAllGlobals());
it('defaults to enabled and accepts only an explicit boolean preference', () => {
  for (const invalid of [undefined, null, 'false', 0, {}, []]) expect(normalizeAlignmentGuides(invalid)).toBe(true);
  expect(normalizeAlignmentGuides(false)).toBe(false); expect(normalizeAlignmentGuides(true)).toBe(true);
});
it('persists both states independently of background and topology data', () => {
  const saved = new Map([['netlab:canvas-background:v1', '{"choice":"bg1"}'], ['netsim:autosave:v1', 'topology']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  expect(readAlignmentGuides()).toBe(true);
  useAlignmentPreference.getState().setEnabled(false); expect(readAlignmentGuides()).toBe(false);
  expect(saved.get(ALIGNMENT_GUIDES_KEY)).toBe('false');
  expect(saved.get('netlab:canvas-background:v1')).toBe('{"choice":"bg1"}'); expect(saved.get('netsim:autosave:v1')).toBe('topology');
  useAlignmentPreference.getState().setEnabled(true); expect(readAlignmentGuides()).toBe(true);
});
it('tolerates unavailable or corrupt storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem: () => { throw Error('blocked'); } });
  expect(readAlignmentGuides()).toBe(true); expect(() => useAlignmentPreference.getState().setEnabled(false)).not.toThrow();
  expect(useAlignmentPreference.getState().enabled).toBe(false);
});
