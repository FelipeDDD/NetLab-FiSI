import { equalizeTerminalPanels, groupPanelSessions, openPanelSession, MAX_TERMINAL_PANELS, TERMINAL_PANEL_TYPES, type TerminalLayoutMode, type TerminalPanel } from './terminalPanels';

export const TAB_LAYOUT_KEY = 'netlab:terminal-tab-layout:v1';
export type TerminalTabLayouts = Partial<Record<TerminalLayoutMode, Pick<TerminalPanel, 'id' | 'tabs'>[]>>;
export interface TabLayoutDevice { id: string; kind: string }
const signature = (devices: readonly TabLayoutDevice[]) => JSON.stringify(devices.map(({ id, kind }) => [id, kind]).sort((a, b) => a[0].localeCompare(b[0])));

export function readTabLayouts(devices: readonly TabLayoutDevice[]): TerminalTabLayouts {
  try {
    const data = JSON.parse(localStorage.getItem(TAB_LAYOUT_KEY) ?? 'null');
    if (!data || data.signature !== signature(devices)) return {};
    const result: TerminalTabLayouts = {};
    for (const mode of ['free', 'by-type'] as const) {
      if (!Array.isArray(data.modes?.[mode])) continue;
      const seen = new Set<string>(), panels = new Set<string>();
      const groups: readonly string[] = TERMINAL_PANEL_TYPES;
      const saved: NonNullable<TerminalTabLayouts['free']> = [];
      for (const panel of data.modes[mode]) {
        if (!panel || typeof panel.id !== 'string' || panels.has(panel.id) || !Array.isArray(panel.tabs)) continue;
        const kind = groups.find((kind) => panel.id === `terminal-group-${kind}`);
        if (mode === 'free' ? !/^terminal-pane-[1-9]\d*$/.test(panel.id) : !kind) continue;
        const tabs = panel.tabs.filter((id: unknown): id is string => {
          if (typeof id !== 'string' || seen.has(id) || !devices.some((d) => d.id === id && groups.includes(d.kind) && (mode === 'free' || d.kind === kind))) return false;
          seen.add(id); return true;
        });
        if (tabs.length) { saved.push({ id: panel.id, tabs }); panels.add(panel.id); }
      }
      // Older layouts may have unlimited columns. Retain their first five slots
      // and fold every excess session into the final slot's ordinary tabs.
      if (mode === 'free' && saved.length > MAX_TERMINAL_PANELS) {
        const overflow = saved.splice(MAX_TERMINAL_PANELS);
        saved[MAX_TERMINAL_PANELS - 1].tabs.push(...overflow.flatMap(panel => panel.tabs));
      }
      if (saved.length) result[mode] = saved;
    }
    return result;
  } catch { return {}; }
}

export function writeTabLayouts(devices: readonly TabLayoutDevice[], modes: TerminalTabLayouts) {
  try { localStorage.setItem(TAB_LAYOUT_KEY, JSON.stringify({ signature: signature(devices), modes })); } catch { /* Optional local persistence. */ }
}

// Reopen only the requested session. Saved membership is not a session history.
export function insertSavedTab(panels: TerminalPanel[], id: string, focused: string | null, mode: TerminalLayoutMode,
  devices: readonly TabLayoutDevice[], saved?: TerminalTabLayouts['free']): TerminalPanel[] {
  if (mode === 'by-type') {
    const ids = [...new Set([...panels.flatMap((p) => p.tabs), id])];
    const ordered = saved?.map((p) => ({ ...p, tabs: [...p.tabs, ...(panels.find((old) => old.id === p.id)?.tabs.filter((id) => !p.tabs.includes(id)) ?? [])], active: panels.find((old) => old.id === p.id)?.active ?? p.tabs[0],
      weight: panels.find((old) => old.id === p.id)?.weight ?? 1, kind: p.id.slice('terminal-group-'.length) as TerminalPanel['kind'],
      lockedWidth: panels.find((old) => old.id === p.id)?.lockedWidth })) ?? panels;
    const result = groupPanelSessions(ids.map((id) => devices.find((d) => d.id === id)!), id, ordered);
    return saved ? result.sort((a, b) => {
      const ai = saved.findIndex((p) => p.id === a.id), bi = saved.findIndex((p) => p.id === b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    }) : result;
  }
  const slot = saved?.find((p) => p.tabs.includes(id));
  if (!slot || panels.some((p) => p.tabs.includes(id))) return openPanelSession(panels, id, focused, saved?.map((p) => p.id));
  const existing = panels.find((p) => p.id === slot.id);
  if (!existing && panels.length >= MAX_TERMINAL_PANELS) return openPanelSession(panels, id, focused);
  const target = existing ?? { id: slot.id, tabs: [], active: id, weight: 1 };
  const tabs = [...target.tabs, id].sort((a, b) => {
    const ai = slot.tabs.indexOf(a), bi = slot.tabs.indexOf(b);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
  });
  if (existing) return panels.map((p) => p.id === slot.id ? { ...p, tabs, active: id } : p);
  // Restore only this slot relative to later saved slots. Sorting the whole
  // list moved fresh, unsaved panels behind every old slot as sessions opened.
  const rank = saved!.indexOf(slot);
  const anchor = panels.findIndex(p => saved!.findIndex(s => s.id === p.id) > rank);
  const next = [...panels];
  next.splice(anchor < 0 ? next.length : anchor, 0, { ...target, tabs, active: id });
  return equalizeTerminalPanels(next);
}

function mergePending<T>(current: T[], previous: readonly T[], key: (value: T) => string, pending: (value: T) => boolean): T[] {
  const result = [...current];
  previous.forEach((value, index) => {
    if (!pending(value)) return;
    const anchor = previous.slice(index + 1).find((next) => result.some((item) => key(item) === key(next)));
    const at = anchor ? result.findIndex((item) => key(item) === key(anchor)) : result.length;
    result.splice(at, 0, value);
  });
  return result;
}

export function mergeTabLayouts(saved: TerminalTabLayouts['free'], panels: readonly TerminalPanel[], openIds: readonly string[]) {
  const open = new Set(openIds);
  const current = panels.map((panel) => ({ id: panel.id,
    tabs: mergePending([...panel.tabs], saved?.find((p) => p.id === panel.id)?.tabs ?? [], (id) => id, (id) => !open.has(id)) }));
  const previous = saved?.map((p) => ({ id: p.id, tabs: p.tabs.filter((id) => !open.has(id)) })) ?? [];
  return mergePending(current, previous, (p) => p.id, (p) => p.tabs.length > 0 && !panels.some((live) => live.id === p.id));
}

export function forgetSavedTabs(layouts: TerminalTabLayouts, ids: readonly string[]): TerminalTabLayouts {
  const next: TerminalTabLayouts = {};
  for (const mode of ['free', 'by-type'] as const) {
    const panels = layouts[mode]?.map((p) => ({ ...p, tabs: p.tabs.filter((id) => !ids.includes(id)) })).filter((p) => p.tabs.length);
    if (panels?.length) next[mode] = panels;
  }
  return next;
}
