import { afterEach, expect, it, vi } from 'vitest';
import { applyPanelPreferences, PANEL_LAYOUT_KEY, readPanelPreferences, rememberPanelPreferences, writePanelPreferences } from './terminalPanelPreferences';
import { freePanelSessions, groupPanelSessions } from './terminalPanels';

afterEach(() => vi.unstubAllGlobals());

it('round-trips independent mode preferences by panel slot, without recording device IDs or tab membership', () => {
  let saved = '';
  vi.stubGlobal('localStorage', { getItem: () => saved || null, setItem: (key: string, value: string) => { expect(key).toBe(PANEL_LAYOUT_KEY); saved = value; } });
  const free = freePanelSessions(['device-a', 'device-b', 'device-c', 'device-d', 'device-e', 'device-f'], 'device-a');
  free[0].lockedWidth = 450;
  free[5].lockedWidth = 390;
  free[1].weight = 2;
  let preferences = rememberPanelPreferences(readPanelPreferences(), 'free', free);
  const grouped = groupPanelSessions([{ id: 'device-a', kind: 'host' }], 'device-a');
  grouped[0].lockedWidth = 600;
  preferences = rememberPanelPreferences(preferences, 'by-type', grouped);
  writePanelPreferences(preferences);
  expect(saved).not.toContain('device-');
  expect(saved).not.toContain('tabs');
  const loaded = readPanelPreferences();
  expect(loaded.free['terminal-pane-6'].lockedWidth).toBe(390);
  expect(applyPanelPreferences(freePanelSessions(['different-device', 'other-device'], null), loaded, 'free')[0].lockedWidth).toBe(450);
  expect(applyPanelPreferences(grouped, loaded, 'by-type')[0].lockedWidth).toBe(600);
  expect(rememberPanelPreferences(loaded, 'free', [], ['terminal-pane-1']).free['terminal-pane-1']).toBeUndefined();
  expect(loaded.free['terminal-pane-1'].lockedWidth).toBe(450);
});

it('ignores legacy/malformed data and remains usable when storage is denied', () => {
  const empty = { free: {}, 'by-type': {} };
  for (const saved of [null, '{', 'null', '{"free":{"unknown":{"weight":1}}}']) {
    vi.stubGlobal('localStorage', { getItem: () => saved });
    expect(readPanelPreferences()).toEqual(empty);
  }
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ free: {
    'terminal-pane-1': { weight: 2, lockedWidth: -10 }, 'terminal-pane-2': { weight: 0, lockedWidth: 400 },
  } }) });
  expect(readPanelPreferences().free).toEqual({ 'terminal-pane-1': { weight: 2 } });
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } });
  expect(readPanelPreferences()).toEqual(empty);
  expect(() => writePanelPreferences(empty)).not.toThrow();
});
