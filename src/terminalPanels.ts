export const MIN_TERMINAL_PANEL_WIDTH = 220;
export const MAX_TERMINAL_PANELS = 5;
export const TERMINAL_PANEL_SEPARATOR_WIDTH = 6;
export type TerminalLayoutMode = 'free' | 'by-type';
export const TERMINAL_PANEL_TYPES = ['host', 'notebook', 'server', 'router', 'firewall'] as const;
export type TerminalPanelType = typeof TERMINAL_PANEL_TYPES[number];
export const TERMINAL_GROUP_LABELS: Record<TerminalPanelType, string> = {
  host: 'Hosts', notebook: 'Notebooks', server: 'Servers', router: 'Routers', firewall: 'Firewalls',
};
export function normalizeTerminalLayoutMode(value: unknown): TerminalLayoutMode {
  return value === 'by-type' ? 'by-type' : 'free';
}

// Presentation owns tab membership/selection/width, never an xterm instance.
// Stable panel IDs keep widths/locks independent of the devices in their tabs.
export interface TerminalPanel {
  id: string;
  tabs: string[];
  active: string;
  weight: number;
  kind?: TerminalPanelType;
  lockedWidth?: number;
}

// Locks own fixed pixels; only free columns share the remaining width equally.
// Call on structural changes or an explicit action, never while typing/resizing.
export function equalizeTerminalPanels(panels: TerminalPanel[]): TerminalPanel[] {
  const next = panels.map(panel => panel.lockedWidth === undefined && panel.weight !== 1 ? { ...panel, weight: 1 } : panel);
  return next.some((panel, i) => panel !== panels[i]) ? next : panels;
}

export function groupPanelSessions(sessions: readonly { id: string; kind: string }[], focused: string | null, previous: readonly TerminalPanel[] = []): TerminalPanel[] {
  const groups = TERMINAL_PANEL_TYPES.flatMap((kind) => {
    const available = sessions.filter((session) => session.kind === kind).map((session) => session.id);
    const old = previous.find((panel) => panel.kind === kind);
    const tabs = [...(old?.tabs.filter((id) => available.includes(id)) ?? []), ...available.filter((id) => !old?.tabs.includes(id))];
    if (!tabs.length) return [];
    const visible = previous.find((panel) => tabs.includes(panel.active))?.active;
    const active = focused && tabs.includes(focused) ? focused
      : old && tabs.includes(old.active) ? old.active : visible ?? tabs[0];
    return [{ id: `terminal-group-${kind}`, kind, tabs, active, weight: old?.weight ?? 1,
      ...(old?.lockedWidth !== undefined ? { lockedWidth: old.lockedWidth } : {}) }];
  });
  // As with free panels, adding a column starts an equal distribution.
  return groups.length !== previous.length ? equalizeTerminalPanels(groups) : groups;
}

export interface TerminalTabDestination { panelId: string | null; beforeId?: string | null }

export function canMovePanelSession(panels: readonly TerminalPanel[], id: string, destination: TerminalTabDestination, mode: TerminalLayoutMode): boolean {
  const source = panels.find((panel) => panel.tabs.includes(id));
  if (!source) return false;
  if (destination.panelId === null) return mode === 'free' && source.tabs.length > 1 && panels.length < MAX_TERMINAL_PANELS;
  const target = panels.find((panel) => panel.id === destination.panelId);
  return !!target && (mode === 'free' || target.id === source.id)
    && (!destination.beforeId || target.tabs.includes(destination.beforeId));
}

// Move membership only. The session registry and opening order are untouched.
export function movePanelSession(panels: TerminalPanel[], id: string, destination: TerminalTabDestination, mode: TerminalLayoutMode, reserved: readonly string[] = []): TerminalPanel[] {
  if (!canMovePanelSession(panels, id, destination, mode)) return panels;
  const source = panels.find((panel) => panel.tabs.includes(id))!;
  if (destination.beforeId === id) return panels;
  const remaining = prunePanelSessions(panels, panels.flatMap((panel) => panel.tabs).filter((tab) => tab !== id), id).terminalPanels;
  if (destination.panelId === null) {
    let suffix = 1;
    while (panels.some((panel) => panel.id === `terminal-pane-${suffix}`) || reserved.includes(`terminal-pane-${suffix}`)) suffix++;
    return [...remaining.map((panel) => panel.lockedWidth === undefined ? { ...panel, weight: 1 } : panel),
      { id: `terminal-pane-${suffix}`, tabs: [id], active: id, weight: 1 }];
  }
  // A single-tab source can be the target of a no-op reorder.
  const target = remaining.find((panel) => panel.id === destination.panelId);
  if (!target) return panels;
  const tabs = [...target.tabs];
  const index = destination.beforeId ? tabs.indexOf(destination.beforeId) : tabs.length;
  tabs.splice(index, 0, id);
  if (source.id === target.id && source.tabs.every((tab, i) => tab === tabs[i])) return panels;
  return remaining.map((panel) => panel.id === target.id ? { ...panel, tabs, active: id } : panel);
}

export function freePanelSessions(ids: readonly string[], focused: string | null): TerminalPanel[] {
  const panels = ids.reduce<TerminalPanel[]>((current, id) => openPanelSession(current, id, focused), []);
  return focused ? activatePanelSession(panels, focused) : panels;
}

export function activatePanelSession(panels: readonly TerminalPanel[], id: string): TerminalPanel[] {
  return panels.map((panel) => panel.tabs.includes(id) && panel.active !== id ? { ...panel, active: id } : panel);
}

export function openPanelSession(panels: readonly TerminalPanel[], id: string, _focused: string | null, reserved: readonly string[] = []): TerminalPanel[] {
  if (panels.some((panel) => panel.tabs.includes(id))) return activatePanelSession(panels, id);
  // Additional sessions reuse the last column's existing tab strip. No session
  // is closed, and changing the active tab must not redistribute manual widths.
  if (panels.length >= MAX_TERMINAL_PANELS) return panels.map((panel, index) => index === panels.length - 1
    ? { ...panel, tabs: [...panel.tabs, id], active: id } : panel);
  let suffix = 1;
  while (panels.some((panel) => panel.id === `terminal-pane-${suffix}`) || reserved.includes(`terminal-pane-${suffix}`)) suffix++;
  // A newly split layout starts with equal columns; subsequent resizes only
  // change weights. Existing tabs/sessions stay in their original panels.
  return equalizeTerminalPanels([...panels, {
    id: `terminal-pane-${suffix}`, tabs: [id], active: id, weight: 1,
  }]);
}

// Panel identity owns its width/lock; reordering changes no panel objects.
export function moveTerminalPanel(panels: TerminalPanel[], id: string, beforeId: string | null): TerminalPanel[] {
  const panel = panels.find((p) => p.id === id);
  if (!panel || id === beforeId || (beforeId && !panels.some((p) => p.id === beforeId))) return panels;
  const next = panels.filter((p) => p !== panel);
  next.splice(beforeId ? next.findIndex((p) => p.id === beforeId) : next.length, 0, panel);
  return next.every((p, i) => p === panels[i]) ? panels : next;
}

export function prunePanelSessions(panels: readonly TerminalPanel[], valid: readonly string[], focused: string | null) {
  const allowed = new Set(valid);
  const focusedIndex = panels.findIndex((panel) => panel.tabs.includes(focused ?? ''));
  const terminalPanels = panels.flatMap((panel) => {
    const tabs = panel.tabs.filter((id) => allowed.has(id));
    if (!tabs.length) return [];
    const index = panel.tabs.indexOf(panel.active);
    const active = tabs.includes(panel.active) ? panel.active : tabs[Math.min(Math.max(0, index), tabs.length - 1)];
    return [{ ...panel, tabs, active }];
  });
  const survivingPanel = terminalPanels.find((panel) => panel.id === panels[focusedIndex]?.id);
  const fallback = survivingPanel ?? terminalPanels[Math.min(Math.max(0, focusedIndex), terminalPanels.length - 1)];
  return { terminalPanels: terminalPanels.length !== panels.length ? equalizeTerminalPanels(terminalPanels) : terminalPanels,
    activeTerminal: focused && allowed.has(focused) ? focused : fallback?.active ?? null };
}

// A manual boundary always adjusts its immediate neighbors. Locks protect
// against automatic redistribution, not an explicit user resize.
export function resizablePanelPair(panels: readonly TerminalPanel[], leftId: string, rightId: string) {
  const left = panels.findIndex((panel) => panel.id === leftId);
  const right = panels.findIndex((panel) => panel.id === rightId);
  if (left < 0 || right !== left + 1) return null;
  return { left, right };
}

export function resizePanelPair(panels: readonly TerminalPanel[], leftId: string, rightId: string, fraction: number, minimumFraction: number, widths?: readonly number[]): TerminalPanel[] {
  const pair = resizablePanelPair(panels, leftId, rightId);
  if (!pair || !Number.isFinite(fraction) || !Number.isFinite(minimumFraction)) return [...panels];
  const { left, right } = pair;
  const min = Math.max(0.05, Math.min(0.5, minimumFraction));
  const share = Math.max(min, Math.min(1 - min, fraction));
  // Pixel weights reflect the rendered minimum-width clamps. Normalizing from
  // the current measurement keeps other free panels still during this drag.
  const measured = panels.map((panel, index) => widths && panel.lockedWidth === undefined && Number.isFinite(widths[index])
    ? { ...panel, weight: Math.max(MIN_TERMINAL_PANEL_WIDTH, widths[index]) } : panel);
  const total = (measured[left].lockedWidth ?? measured[left].weight) + (measured[right].lockedWidth ?? measured[right].weight);
  return measured.map((panel, index) => {
    if (index !== left && index !== right) return panel;
    const weight = total * (index === left ? share : 1 - share);
    return { ...panel, weight, ...(panel.lockedWidth === undefined ? {} : { lockedWidth: Math.max(MIN_TERMINAL_PANEL_WIDTH, weight) }) };
  });
}

// Water-fill the available pixels: fixed locks first, weighted free columns
// next, pinning any small share at the readable minimum. Overflow is intentional.
export function terminalPanelWidths(panels: readonly TerminalPanel[], available: number): number[] {
  const widths = panels.map((panel) => panel.lockedWidth ?? 0);
  let pending = panels.flatMap((panel, index) => panel.lockedWidth === undefined ? [index] : []);
  let remaining = Math.max(pending.length * MIN_TERMINAL_PANEL_WIDTH, available - widths.reduce((a, b) => a + b, 0));
  while (pending.length) {
    const total = pending.reduce((sum, index) => sum + panels[index].weight, 0);
    const small = pending.filter((index) => remaining * panels[index].weight / total < MIN_TERMINAL_PANEL_WIDTH);
    if (!small.length) {
      pending.forEach((index) => { widths[index] = remaining * panels[index].weight / total; });
      break;
    }
    small.forEach((index) => { widths[index] = MIN_TERMINAL_PANEL_WIDTH; remaining -= MIN_TERMINAL_PANEL_WIDTH; });
    pending = pending.filter((index) => !small.includes(index));
  }
  return widths;
}
