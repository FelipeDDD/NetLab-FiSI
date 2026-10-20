import { describe, expect, it } from 'vitest';
import { activatePanelSession, openPanelSession, prunePanelSessions, resizePanelPair, groupPanelSessions, freePanelSessions, normalizeTerminalLayoutMode, resizablePanelPair, terminalPanelWidths, movePanelSession, moveTerminalPanel, type TerminalPanel } from './terminalPanels';

function four(): TerminalPanel[] {
  return ['a', 'b', 'c', 'd'].reduce<TerminalPanel[]>((panels, id) => openPanelSession(panels, id, null), []);
}

function addTab(panels: TerminalPanel[], id: string, target: string): TerminalPanel[] {
  return movePanelSession(openPanelSession(panels, id, null), id, { panelId: panels.find((p) => p.tabs.includes(target))!.id }, 'free');
}

it('reorders complete panels in both modes retaining identities, tabs, locks and widths', () => {
  for (const panels of [freePanelSessions(['a', 'b', 'c', 'd', 'e', 'f'], 'c'),
    groupPanelSessions([{ id: 'a', kind: 'host' }, { id: 'b', kind: 'server' }, { id: 'c', kind: 'router' }], 'a')]) {
    panels[0].lockedWidth = 450;
    panels[1].weight = 2;
    const moved = moveTerminalPanel(panels, panels[0].id, null);
    expect(moved).toEqual([...panels.slice(1), panels[0]]);
    expect(moved.at(-1)).toBe(panels[0]);
    expect(moveTerminalPanel(moved, panels[0].id, panels[1].id)).toEqual(panels);
    expect(moveTerminalPanel(panels, 'missing', null)).toBe(panels);
    expect(moveTerminalPanel(panels, panels[0].id, 'missing')).toBe(panels);
    expect(moveTerminalPanel(panels, panels[0].id, panels[1].id)).toBe(panels);
  }
});

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
  it('rebuilds independent free panels with every session exactly once', () => {
    const ids = sessions.map((s) => s.id);
    const panels = freePanelSessions(ids, 'host3');
    expect(panels).toHaveLength(6);
    expect(panels.flatMap((p) => p.tabs).sort()).toEqual([...ids].sort());
    expect(panels.find((p) => p.tabs.includes('host3'))?.active).toBe('host3');
    expect(panels.map((p) => p.weight)).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it.each([undefined, null, 'free', 'bogus', {}, 1])('uses free panels for missing or invalid layout mode %j', (value) => {
    expect(normalizeTerminalLayoutMode(value)).toBe('free');
  });
  it('accepts only the implemented grouped mode', () => {
    expect(normalizeTerminalLayoutMode('by-type')).toBe('by-type');
  });
});

describe('automatic terminal panel distribution', () => {
  it('creates arbitrarily many equal columns with stable panel identities', () => {
    let panels: TerminalPanel[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      const previous = panels.map((panel) => panel.id);
      panels = openPanelSession(panels, id, null);
      expect(panels.map((panel) => panel.id).slice(0, previous.length)).toEqual(previous);
      expect(panels.map((panel) => panel.weight)).toEqual(panels.map(() => 1));
      expect(panels.at(-1)?.tabs).toEqual([id]);
    }
  });

  it('opens independent panels beyond four and overflows at the readable minimum', () => {
    const initial = four();
    initial[0].lockedWidth = 420;
    const panels = openPanelSession(openPanelSession(initial, 'e', 'b'), 'f', 'e');
    expect(panels.map((p) => p.tabs)).toEqual([['a'], ['b'], ['c'], ['d'], ['e'], ['f']]);
    expect(terminalPanelWidths(panels, 1000)).toEqual([420, 280, 280, 280, 280, 280]);
  });

  it('reopening a session activates it in its existing panel', () => {
    const initial = addTab(four(), 'e', 'b');
    const panels = openPanelSession(initial, 'b', 'd');
    expect(panels).toHaveLength(4);
    expect(panels[1].tabs).toEqual(['b', 'e']);
    expect(panels[1].active).toBe('b');
    expect(initial[1].active).toBe('e');
  });

  it('keeps panel-local selections independent', () => {
    const panels = activatePanelSession(addTab(four(), 'e', 'b'), 'a');
    expect(panels.map((panel) => panel.active)).toEqual(['a', 'e', 'c', 'd']);
  });

  it('selects a neighboring local tab after closing, keeping its panel identity', () => {
    const panels = addTab(addTab(four(), 'e', 'b'), 'f', 'e');
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
  it('reorders tabs in either direction without duplicates, preserving the panel lock and detecting no-ops', () => {
    const panels = addTab(addTab(four(), 'e', 'b'), 'f', 'b');
    panels[1].lockedWidth = 350;
    const moved = movePanelSession(panels, 'f', { panelId: panels[1].id, beforeId: 'b' }, 'free');
    expect(moved[1]).toMatchObject({ tabs: ['f', 'b', 'e'], active: 'f', lockedWidth: 350 });
    expect(panels[1].tabs).toEqual(['b', 'e', 'f']);
    const back = movePanelSession(moved, 'f', { panelId: panels[1].id }, 'free');
    expect(back[1].tabs).toEqual(['b', 'e', 'f']);
    expect(movePanelSession(back, 'f', { panelId: panels[1].id }, 'free')).toBe(back);
    expect(movePanelSession(back, 'f', { panelId: panels[1].id, beforeId: 'stale' }, 'free')).toBe(back);
  });

  it('transfers a last tab, removes its empty panel and splits another tab without transferring locks', () => {
    const panels = addTab(four(), 'e', 'b');
    panels[0].lockedWidth = 400;
    expect(movePanelSession(panels, 'e', { panelId: null }, 'free')).toHaveLength(5);
    const combined = movePanelSession(panels, 'c', { panelId: panels[1].id }, 'free');
    expect(combined.map((p) => p.tabs)).toEqual([['a'], ['b', 'e', 'c'], ['d']]);
    expect(combined[0].lockedWidth).toBe(400);
    const split = movePanelSession(combined, 'e', { panelId: null }, 'free');
    expect(split.map((p) => p.tabs)).toEqual([['a'], ['b', 'c'], ['d'], ['e']]);
    expect(split.at(-1)?.lockedWidth).toBeUndefined();
    expect(terminalPanelWidths(split, 1400)).toEqual([400, 1000 / 3, 1000 / 3, 1000 / 3]);
    expect(movePanelSession(combined, 'a', { panelId: null }, 'free')).toBe(combined);
  });

  it('keeps grouped order deterministic, retaining manual local order when sessions open and refusing cross-type moves', () => {
    const sessions = [{ id: 'a', kind: 'host' }, { id: 'b', kind: 'host' }, { id: 's', kind: 'server' }];
    const panels = groupPanelSessions(sessions, 'a');
    expect(movePanelSession(panels, 'a', { panelId: panels[1].id }, 'by-type')).toBe(panels);
    expect(movePanelSession(panels, 'a', { panelId: null }, 'by-type')).toBe(panels);
    const moved = movePanelSession(panels, 'b', { panelId: panels[0].id, beforeId: 'a' }, 'by-type');
    const opened = groupPanelSessions([...sessions, { id: 'c', kind: 'host' }], 'c', moved);
    expect(opened.map((p) => p.kind)).toEqual(['host', 'server']);
    expect(opened[0].tabs).toEqual(['b', 'a', 'c']);
  });

  it('preserves two independent locks and allocates only the remaining pixels, respecting free minima', () => {
    const panels = four();
    panels[0].lockedWidth = 400;
    panels[2].lockedWidth = 350;
    panels[3].weight = 2;
    expect(terminalPanelWidths(panels, 1800)).toEqual([400, 350, 350, 700]);
    expect(terminalPanelWidths(panels, 1400)).toEqual([400, 280, 350, 370]);
    expect(terminalPanelWidths(panels, 1000)).toEqual([400, 280, 350, 280]);
    expect(terminalPanelWidths(prunePanelSessions(panels, ['a', 'b', 'c'], 'b').terminalPanels, 1400))
      .toEqual([400, 650, 350]);
    panels.forEach((panel) => { panel.lockedWidth = 350; });
    expect(terminalPanelWidths(panels, 1800)).toEqual([350, 350, 350, 350]);
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    'manually resizes only adjacent panels with left/right locks %s/%s, retaining locks and other widths', (leftLocked, rightLocked) => {
      const panels = freePanelSessions(['a', 'b', 'c', 'd', 'e', 'f'], 'a');
      const widths = [400, 380, 420, 300, 500, 280];
      if (leftLocked) panels[0].lockedWidth = widths[0];
      if (rightLocked) panels[1].lockedWidth = widths[1];
      panels[3].lockedWidth = widths[3];
      panels[4].lockedWidth = widths[4];
      const total = widths[0] + widths[1];
      expect(resizablePanelPair(panels, panels[0].id, panels[1].id)).toEqual({ left: 0, right: 1 });
      const resized = resizePanelPair(panels, panels[0].id, panels[1].id, 430 / total, 280 / total, widths);
      terminalPanelWidths(resized, 2280).forEach((width, i) => expect(width).toBeCloseTo([430, 350, 420, 300, 500, 280][i]));
      if (leftLocked) expect(resized[0].lockedWidth).toBeCloseTo(430);
      else expect(resized[0].lockedWidth).toBeUndefined();
      if (rightLocked) expect(resized[1].lockedWidth).toBeCloseTo(350);
      else expect(resized[1].lockedWidth).toBeUndefined();
      expect(resized[3]).toBe(panels[3]);
      expect(resized[4]).toBe(panels[4]);
      for (const fraction of [-5, 5]) {
        const edge = resizePanelPair(panels, panels[0].id, panels[1].id, fraction, 280 / total, widths);
        const result = terminalPanelWidths(edge, 2280);
        expect(result[0]).toBeCloseTo(fraction < 0 ? 280 : 500);
        expect(result[1]).toBeCloseTo(fraction < 0 ? 500 : 280);
        expect(result.every((width) => width >= 280)).toBe(true);
      }
      expect(panels[0].lockedWidth).toBe(leftLocked ? 400 : undefined);
      expect(panels[1].lockedWidth).toBe(rightLocked ? 380 : undefined);
    });

  it('keeps other free columns steady when resizing a measured pair that previously hit its minimum', () => {
    const panels = four().slice(0, 3);
    panels[0].weight = 0.1;
    panels[1].weight = 1;
    panels[2].weight = 1;
    const widths = terminalPanelWidths(panels, 1400);
    expect(widths).toEqual([280, 560, 560]);
    const resized = resizePanelPair(panels, panels[0].id, panels[1].id, 0.5, 280 / 840, widths);
    expect(terminalPanelWidths(resized, 1400)).toEqual([420, 420, 560]);
  });

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
