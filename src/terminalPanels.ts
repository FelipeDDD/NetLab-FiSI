export const MAX_TERMINAL_PANELS = 4;
export const MIN_TERMINAL_PANEL_WIDTH = 280;
export type TerminalLayoutMode = 'free' | 'by-type';
export const TERMINAL_PANEL_TYPES = ['host', 'server', 'router', 'firewall'] as const;
export type TerminalPanelType = typeof TERMINAL_PANEL_TYPES[number];
export const TERMINAL_GROUP_LABELS: Record<TerminalPanelType, string> = {
  host: 'Hosts', server: 'Servers', router: 'Routers', firewall: 'Firewalls',
};
export function normalizeTerminalLayoutMode(value: unknown): TerminalLayoutMode {
  return value === 'by-type' ? 'by-type' : 'free';
}

// Presentation owns tab membership/selection/width, never an xterm instance.
// Stable panel IDs allow future tab movement without tying a panel to a device.
export interface TerminalPanel {
  id: string;
  tabs: string[];
  active: string;
  weight: number;
  kind?: TerminalPanelType;
}

export function groupPanelSessions(sessions: readonly { id: string; kind: string }[], focused: string | null, previous: readonly TerminalPanel[] = []): TerminalPanel[] {
  const groups = TERMINAL_PANEL_TYPES.flatMap((kind) => {
    const tabs = sessions.filter((session) => session.kind === kind).map((session) => session.id);
    if (!tabs.length) return [];
    const old = previous.find((panel) => panel.kind === kind);
    const visible = previous.find((panel) => tabs.includes(panel.active))?.active;
    const active = focused && tabs.includes(focused) ? focused
      : old && tabs.includes(old.active) ? old.active : visible ?? tabs[0];
    return [{ id: `terminal-group-${kind}`, kind, tabs, active, weight: old?.weight ?? 1 }];
  });
  // As with free panels, adding a column starts an equal distribution.
  return groups.length > previous.length ? groups.map((panel) => ({ ...panel, weight: 1 })) : groups;
}

export function freePanelSessions(ids: readonly string[], focused: string | null): TerminalPanel[] {
  const panels = ids.reduce<TerminalPanel[]>((current, id) => openPanelSession(current, id, focused), []);
  return focused ? activatePanelSession(panels, focused) : panels;
}

export function activatePanelSession(panels: readonly TerminalPanel[], id: string): TerminalPanel[] {
  return panels.map((panel) => panel.tabs.includes(id) && panel.active !== id ? { ...panel, active: id } : panel);
}

export function openPanelSession(panels: readonly TerminalPanel[], id: string, focused: string | null): TerminalPanel[] {
  if (panels.some((panel) => panel.tabs.includes(id))) return activatePanelSession(panels, id);
  if (panels.length < MAX_TERMINAL_PANELS) {
    let suffix = 1;
    while (panels.some((panel) => panel.id === `terminal-pane-${suffix}`)) suffix++;
    // A newly split layout starts with equal columns; subsequent resizes only
    // change weights. Existing tabs/sessions stay in their original panels.
    return [...panels.map((panel) => ({ ...panel, weight: 1 })), {
      id: `terminal-pane-${suffix}`, tabs: [id], active: id, weight: 1,
    }];
  }
  const target = panels.find((panel) => panel.tabs.includes(focused ?? '')) ?? panels[panels.length - 1];
  return panels.map((panel) => panel === target ? { ...panel, tabs: [...panel.tabs, id], active: id } : panel);
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
  return { terminalPanels, activeTerminal: focused && allowed.has(focused) ? focused : fallback?.active ?? null };
}

// Pair resizing leaves every other panel untouched. The caller converts pointer
// movement to a fraction of the pair's measured width, not of the whole dock.
export function resizePanelPair(panels: readonly TerminalPanel[], leftId: string, rightId: string, fraction: number, minimumFraction: number): TerminalPanel[] {
  const left = panels.findIndex((panel) => panel.id === leftId);
  const right = panels.findIndex((panel) => panel.id === rightId);
  if (left < 0 || right !== left + 1 || !Number.isFinite(fraction) || !Number.isFinite(minimumFraction)) return [...panels];
  const min = Math.max(0.05, Math.min(0.5, minimumFraction));
  const share = Math.max(min, Math.min(1 - min, fraction));
  const total = panels[left].weight + panels[right].weight;
  return panels.map((panel, index) => index === left ? { ...panel, weight: total * share }
    : index === right ? { ...panel, weight: total * (1 - share) } : panel);
}
