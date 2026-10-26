import { MIN_TERMINAL_PANEL_WIDTH, TERMINAL_PANEL_TYPES, type TerminalLayoutMode, type TerminalPanel } from './terminalPanels';

export const PANEL_LAYOUT_KEY = 'netlab:terminal-panel-layout:v1';
type PanelPreference = Pick<TerminalPanel, 'weight' | 'lockedWidth'>;
export type PanelPreferences = Record<TerminalLayoutMode, Record<string, PanelPreference>>;
const groups = TERMINAL_PANEL_TYPES.map(kind => `terminal-group-${kind}`);

export function readPanelPreferences(): PanelPreferences {
  const result: PanelPreferences = { free: {}, 'by-type': {} };
  try {
    const data = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) ?? '{}');
    for (const mode of ['free', 'by-type'] as const) for (const id of Object.keys(data?.[mode] ?? {})) {
      if (mode === 'free' ? !/^terminal-pane-[1-9]\d*$/.test(id) : !groups.includes(id)) continue;
      const value = data?.[mode]?.[id];
      if (!value || typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0 || value.weight > 1e6) continue;
      result[mode][id] = { weight: value.weight };
      if (typeof value.lockedWidth === 'number' && Number.isFinite(value.lockedWidth) && value.lockedWidth >= MIN_TERMINAL_PANEL_WIDTH && value.lockedWidth <= 32768) {
        result[mode][id].lockedWidth = value.lockedWidth;
      }
    }
  } catch { /* Layout remains usable with blocked/unavailable storage or old data. */ }
  return result;
}

export function writePanelPreferences(preferences: PanelPreferences) {
  try { localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(preferences)); } catch { /* Runtime locks still work. */ }
}

export function applyPanelPreferences(panels: TerminalPanel[], preferences: PanelPreferences, mode: TerminalLayoutMode): TerminalPanel[] {
  return panels.map((panel) => preferences[mode][panel.id] ? { ...panel, ...preferences[mode][panel.id] } : panel);
}

export function rememberPanelPreferences(preferences: PanelPreferences, mode: TerminalLayoutMode, panels: readonly TerminalPanel[], removed: readonly string[] = []): PanelPreferences {
  const next = { ...preferences[mode] };
  removed.forEach((id) => { delete next[id]; });
  panels.forEach(({ id, weight, lockedWidth }) => {
    next[id] = { weight, ...(lockedWidth === undefined ? {} : { lockedWidth }) };
  });
  return { ...preferences, [mode]: next };
}
