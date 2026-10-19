import { describe, expect, it } from 'vitest';
import { activatePanelSession, openPanelSession, prunePanelSessions, resizePanelPair, groupPanelSessions, freePanelSessions, normalizeTerminalLayoutMode, type TerminalPanel } from './terminalPanels';

function four(): TerminalPanel[] {
  return ['a', 'b', 'c', 'd'].reduce<TerminalPanel[]>((panels, id) => openPanelSession(panels, id, null), []);
}

describe('terminal groups by device type', () => {
  const sessions = [
    { id: 'fw1', kind: 'firewall' }, { id: 'host1', kind: 'host' }, { id: 'host2', kind: 'host' },
    { id: 'router1', kind: 'router' }, { id: 'server1', kind: 'server' }, { id: 'host3', kind: 'host' },
  ];
  it('uses only occupied groups in type order, retaining tab order and the focused session', () => {
    const panels = groupPanelSessions(sessions, 'host2');
    expect(panels.map((panel) => panel.kind)).toEqual(['host', 'server', 'router', 'firewall']);
    expect(panels[0].tabs).toEqual(['host1', 'host2', 'host3']);
    expect(panels[0].active).toBe('host2');
    expect(panels.flatMap((panel) => panel.tabs).sort()).toEqual(sessions.map((s) => s.id).sort());
    expect(groupPanelSessions(sessions.filter((s) => s.kind === 'host'), 'host2')).toHaveLength(1);
    expect(groupPanelSessions([], null)).toEqual([]);
  });
  it('retains each other group selection and widths when adding a tab', () => {
    const previous = groupPanelSessions(sessions, 'host2').map((panel, i) => ({ ...panel, weight: i + 1 }));
    const result = groupPanelSessions([...sessions, { id: 'server2', kind: 'server' }], 'server2', previous);
    expect(result[0]).toEqual(previous[0]);
    expect(result[1]).toMatchObject({ tabs: ['server1', 'server2'], active: 'server2', weight: 2 });
    expect(previous[1].tabs).toEqual(['server1']);
  });
  it('adds a new type as an equal column without mixing devices', () => {
    const previous = groupPanelSessions(sessions.filter((s) => s.kind === 'host'), 'host2');
    const result = groupPanelSessions(sessions.filter((s) => ['host', 'server'].includes(s.kind)), 'server1', previous);
    expect(result.map((panel) => panel.weight)).toEqual([1, 1]);
    expect(result[0].active).toBe('host2');
  });
  it('closes local tabs and empty groups using the existing pruning rules', () => {
    const previous = groupPanelSessions(sessions, 'host2');
    const next = prunePanelSessions(previous, ['host1', 'host3', 'fw1'], 'host2');
    expect(next.terminalPanels.map((p) => p.kind)).toEqual(['host', 'firewall']);
    expect(next.activeTerminal).toBe('host3');
    expect(next.terminalPanels[0].id).toBe(previous[0].id);
  });
  it('rebuilds free panels with every session exactly once and keeps the active excess tab', () => {
    const ids = sessions.map((s) => s.id);
    const panels = freePanelSessions(ids, 'host3');
    expect(panels).toHaveLength(4);
    expect(panels.flatMap((p) => p.tabs).sort()).toEqual([...ids].sort());
    expect(panels.find((p) => p.tabs.includes('host3'))?.active).toBe('host3');
    expect(panels.map((p) => p.weight)).toEqual([1, 1, 1, 1]);
  });
  it.each([undefined, null, 'free', 'bogus', {}, 1])('uses free panels for missing or invalid layout mode %j', (value) => {
    expect(normalizeTerminalLayoutMode(value)).toBe('free');
  });
  it('accepts only the implemented grouped mode', () => {
    expect(normalizeTerminalLayoutMode('by-type')).toBe('by-type');
  });
});

describe('automatic terminal panel distribution', () => {
  it('creates one to four equal columns with stable panel identities', () => {
    let panels: TerminalPanel[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const previous = panels.map((panel) => panel.id);
      panels = openPanelSession(panels, id, null);
      expect(panels.map((panel) => panel.id).slice(0, previous.length)).toEqual(previous);
      expect(panels.map((panel) => panel.weight)).toEqual(panels.map(() => 1));
      expect(panels.at(-1)?.tabs).toEqual([id]);
    }
  });

  it('adds excess devices as tabs in the focused panel without moving others', () => {
    const initial = four();
    const panels = openPanelSession(openPanelSession(initial, 'e', 'b'), 'f', 'e');
    expect(panels).toHaveLength(4);
    expect(panels[1].tabs).toEqual(['b', 'e', 'f']);
    expect(panels[1].active).toBe('f');
    expect(initial[1].tabs).toEqual(['b']);
    expect(panels[0]).toBe(initial[0]);
  });

  it('reopening a session activates it in its existing panel', () => {
    const initial = openPanelSession(four(), 'e', 'b');
    const panels = openPanelSession(initial, 'b', 'd');
    expect(panels).toHaveLength(4);
    expect(panels[1].tabs).toEqual(['b', 'e']);
    expect(panels[1].active).toBe('b');
    expect(initial[1].active).toBe('e');
  });

  it('keeps panel-local selections independent', () => {
    const panels = activatePanelSession(openPanelSession(four(), 'e', 'b'), 'a');
    expect(panels.map((panel) => panel.active)).toEqual(['a', 'e', 'c', 'd']);
  });

  it('selects a neighboring local tab after closing, keeping its panel identity', () => {
    const panels = openPanelSession(openPanelSession(four(), 'e', 'b'), 'f', 'e');
    const result = prunePanelSessions(panels, ['a', 'b', 'c', 'd', 'e'], 'f');
    expect(result.terminalPanels).toHaveLength(4);
    expect(result.terminalPanels[1]).toMatchObject({ id: panels[1].id, tabs: ['b', 'e'], active: 'e' });
    expect(result.activeTerminal).toBe('e');
  });

  it('removes empty panels and retains remaining width proportions', () => {
    const panels = resizePanelPair(four(), 'terminal-pane-1', 'terminal-pane-2', 0.4, 0.2);
    const result = prunePanelSessions(panels, ['a', 'b', 'd'], 'c');
    expect(result.terminalPanels.map((panel) => panel.active)).toEqual(['a', 'b', 'd']);
    expect(result.terminalPanels.map((panel) => panel.weight)).toEqual([0.8, 1.2, 1]);
    expect(result.activeTerminal).toBe('d');
  });

  it('does not change the focused session when closing another panel', () => {
    expect(prunePanelSessions(four(), ['b', 'c', 'd'], 'c').activeTerminal).toBe('c');
    expect(prunePanelSessions(four(), [], 'a')).toEqual({ terminalPanels: [], activeTerminal: null });
  });

  it('reuses a free ID without duplicating a surviving panel ID', () => {
    const panels = prunePanelSessions(four(), ['a', 'c', 'd'], 'd').terminalPanels;
    const next = openPanelSession(panels, 'b', 'd');
    expect(new Set(next.map((panel) => panel.id)).size).toBe(4);
  });
});

describe('proportional panel resizing', () => {
  it('changes only the adjacent pair, conserving its total share', () => {
    const before = four();
    const panels = resizePanelPair(before, before[0].id, before[1].id, 0.65, 0.3);
    expect(panels.map((panel) => panel.weight)).toEqual([1.3, 0.7, 1, 1]);
    expect(before.map((panel) => panel.weight)).toEqual([1, 1, 1, 1]);
    expect(panels[2]).toBe(before[2]);
  });

  it.each([-20, 20])('clamps large pointer movements: %s', (fraction) => {
    const panels = four();
    const result = resizePanelPair(panels, panels[0].id, panels[1].id, fraction, 0.35);
    expect(result[0].weight).toBeCloseTo(fraction < 0 ? 0.7 : 1.3);
    expect(result[1].weight).toBeCloseTo(fraction < 0 ? 1.3 : 0.7);
  });

  it('does not squeeze panes below their minimum on a narrow screen', () => {
    const panels = four();
    expect(resizePanelPair(panels, panels[0].id, panels[1].id, 0.9, 0.6)).toEqual(panels);
  });

  it('ignores stale/nonadjacent panel IDs or invalid movement', () => {
    const panels = four();
    expect(resizePanelPair(panels, 'gone', panels[1].id, 0.8, 0.2)).toEqual(panels);
    expect(resizePanelPair(panels, panels[0].id, panels[2].id, 0.8, 0.2)).toEqual(panels);
    expect(resizePanelPair(panels, panels[0].id, panels[1].id, NaN, 0.2)).toEqual(panels);
  });
});
