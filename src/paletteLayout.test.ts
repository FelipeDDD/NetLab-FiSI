import { afterEach, expect, it, vi } from 'vitest';
import { loadPalettePreference, normalizePalettePreference, PALETTE_LAYOUT_KEY, savePalettePreference } from './paletteLayout';

afterEach(() => vi.unstubAllGlobals());

it('opens the device catalog and all categories when no valid preference exists', () => {
  for (const value of [null, undefined, '', 42, [], { tab: 'unknown', collapsed: 'false', collapsedCategories: 'basic' }]) {
    expect(normalizePalettePreference(value)).toEqual({ collapsed: false, tab: 'devices', collapsedCategories: [] });
  }
});

it('keeps independent category choices, drops unknown IDs and duplicates', () => {
  expect(normalizePalettePreference({ collapsed: true, tab: 'tools', collapsedCategories: ['security', 'basic', 'obsolete', 'basic'] }))
    .toEqual({ collapsed: true, tab: 'tools', collapsedCategories: ['basic', 'security'] });
});

it('round-trips the sidebar preference without touching topology or existing preferences', () => {
  const storage = new Map([['netsim:autosave:v1', 'existing topology'], ['netsim:host-creation:v1', 'windows']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  const preference = normalizePalettePreference({ collapsed: true, tab: 'tools', collapsedCategories: ['clients', 'wlan'] });
  savePalettePreference(preference);
  expect(loadPalettePreference()).toEqual(preference);
  expect(storage.get('netsim:autosave:v1')).toBe('existing topology');
  expect(storage.get('netsim:host-creation:v1')).toBe('windows');
  expect([...storage.keys()]).toEqual(['netsim:autosave:v1', 'netsim:host-creation:v1', PALETTE_LAYOUT_KEY]);
});

it('recovers from malformed JSON and continues working with blocked storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  expect(loadPalettePreference()).toEqual(normalizePalettePreference(null));
  vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  expect(loadPalettePreference()).toEqual(normalizePalettePreference(null));
  expect(() => savePalettePreference(normalizePalettePreference(null))).not.toThrow();
});
