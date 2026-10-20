import { afterEach, expect, it, vi } from 'vitest';
import { forgetSavedTabs, insertSavedTab, mergeTabLayouts, readTabLayouts, TAB_LAYOUT_KEY, writeTabLayouts } from './terminalTabPreferences';
import { movePanelSession, moveTerminalPanel, type TerminalPanel } from './terminalPanels';

afterEach(() => vi.unstubAllGlobals());

it('round-trips more than four reordered panels and reserves pending slots for explicit reopening', () => {
  storage();
  const all = Array.from({ length: 10 }, (_, i) => ({ id: 'd' + i, kind: i % 2 ? 'server' : 'host' }));
  let panels = all.slice(0, 8).reduce<TerminalPanel[]>((p, d) => insertSavedTab(p, d.id, null, 'free', all), []);
  panels = moveTerminalPanel(panels, panels[7].id, panels[1].id);
  panels = movePanelSession(panels, 'd2', { panelId: panels[0].id }, 'free');
  const free = mergeTabLayouts(undefined, panels, all.slice(0, 8).map((d) => d.id));
  writeTabLayouts(all, { free, 'by-type': [{ id: 'terminal-group-server', tabs: ['d3', 'd1'] }, { id: 'terminal-group-host', tabs: ['d2', 'd0'] }] });
  const saved = readTabLayouts(all);
  expect(saved.free).toEqual(free);
  // A new session must not claim a saved slot whose owner is not open yet.
  let reopened = insertSavedTab([], 'd9', null, 'free', all, saved.free);
  const fresh = reopened[0].id;
  expect(saved.free?.some((p) => p.id === fresh)).toBe(false);
  for (const d of all.slice(0, 8).reverse()) reopened = insertSavedTab(reopened, d.id, null, 'free', all, saved.free);
  expect(reopened.filter((p) => p.id !== fresh).map(({ id, tabs }) => ({ id, tabs }))).toEqual(free);
  expect(reopened.find((p) => p.id === fresh)?.tabs).toEqual(['d9']);
  const groups = ['d0', 'd1', 'd2', 'd3'].reduce<TerminalPanel[]>((p, id) => insertSavedTab(p, id, null, 'by-type', all, saved['by-type']), []);
  expect(groups.map(({ id, tabs }) => ({ id, tabs }))).toEqual(saved['by-type']);
});
const devices = [{ id: 'a', kind: 'host' }, { id: 'b', kind: 'host' }, { id: 's', kind: 'server' }];
function storage() {
  let saved = '';
  vi.stubGlobal('localStorage', { getItem: () => saved || null, setItem: (key: string, data: string) => { expect(key).toBe(TAB_LAYOUT_KEY); saved = data; } });
  return { get: () => JSON.parse(saved), set: (data: unknown) => { saved = JSON.stringify(data); } };
}

it('restores manual membership and visual order as individual sessions reopen, separately by mode', () => {
  storage();
  writeTabLayouts(devices, { free: [{ id: 'terminal-pane-3', tabs: ['b', 'a'] }, { id: 'terminal-pane-1', tabs: ['s'] }],
    'by-type': [{ id: 'terminal-group-host', tabs: ['b', 'a'] }, { id: 'terminal-group-server', tabs: ['s'] }] });
  const saved = readTabLayouts(devices);
  let panels: TerminalPanel[] = [];
  for (const id of ['s', 'a', 'b']) panels = insertSavedTab(panels, id, null, 'free', devices, saved.free);
  expect(panels.map(({ id, tabs }) => ({ id, tabs }))).toEqual(saved.free);
  let grouped: TerminalPanel[] = [];
  for (const id of ['s', 'a', 'b']) grouped = insertSavedTab(grouped, id, null, 'by-type', devices, saved['by-type']);
  expect(grouped.map((p) => p.tabs)).toEqual([['b', 'a'], ['s']]);
  const partial = insertSavedTab([], 'a', null, 'free', devices, saved.free);
  expect(partial.flatMap((p) => p.tabs)).toEqual(['a']);
  expect(mergeTabLayouts(saved.free, partial, ['a']).flatMap((p) => p.tabs).sort()).toEqual(['a', 'b', 's']);
  expect(mergeTabLayouts(saved.free, partial, ['a'])[0].tabs).toEqual(['b', 'a']);
  const serverOnly = insertSavedTab([], 's', null, 'free', devices, saved.free);
  expect(mergeTabLayouts(saved.free, serverOnly, ['s'])).toEqual(saved.free);
});

it('ignores foreign/malformed storage, duplicate tabs and cross-type entries', () => {
  const data = storage();
  expect(readTabLayouts(devices)).toEqual({});
  writeTabLayouts(devices, { free: [{ id: 'terminal-pane-1', tabs: ['a', 'a', 'missing'] }],
    'by-type': [{ id: 'terminal-group-server', tabs: ['b', 's'] }] });
  expect(readTabLayouts(devices)).toEqual({ free: [{ id: 'terminal-pane-1', tabs: ['a'] }],
    'by-type': [{ id: 'terminal-group-server', tabs: ['s'] }] });
  expect(readTabLayouts([...devices, { id: 'new', kind: 'host' }])).toEqual({});
  data.set(null); expect(readTabLayouts(devices)).toEqual({});
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } });
  expect(readTabLayouts(devices)).toEqual({});
  expect(() => writeTabLayouts(devices, {})).not.toThrow();
});

it('forgets a definitively closed tab in both modes so its next opening is a new insertion', () => {
  const saved = { free: [{ id: 'terminal-pane-2', tabs: ['b', 'a'] }], 'by-type': [{ id: 'terminal-group-host', tabs: ['b', 'a'] }] };
  const remaining = forgetSavedTabs(saved, ['b']);
  expect(remaining.free?.[0].tabs).toEqual(['a']);
  expect(remaining['by-type']?.[0].tabs).toEqual(['a']);
  const panels = insertSavedTab([], 'a', null, 'free', devices, remaining.free);
  const opened = insertSavedTab(panels, 'b', 'a', 'free', devices, remaining.free);
  expect(opened.map((p) => p.tabs)).toEqual([['a'], ['b']]);
  expect(saved.free[0].tabs).toEqual(['b', 'a']);
});
