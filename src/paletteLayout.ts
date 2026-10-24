export const PALETTE_CATEGORY_IDS = ['basic', 'clients', 'wlan', 'security'] as const;
export type PaletteCategory = typeof PALETTE_CATEGORY_IDS[number];
export interface PalettePreference {
  collapsed: boolean;
  tab: 'devices' | 'tools';
  collapsedCategories: PaletteCategory[];
}
export const PALETTE_LAYOUT_KEY = 'netlab:palette:v1';

export function normalizePalettePreference(value: unknown): PalettePreference {
  const source = value && typeof value === 'object' ? value as Partial<PalettePreference> : {};
  return {
    collapsed: source.collapsed === true,
    tab: source.tab === 'tools' ? 'tools' : 'devices',
    collapsedCategories: PALETTE_CATEGORY_IDS.filter(id =>
      Array.isArray(source.collapsedCategories) && source.collapsedCategories.includes(id)),
  };
}

export function loadPalettePreference(): PalettePreference {
  try { return normalizePalettePreference(JSON.parse(localStorage.getItem(PALETTE_LAYOUT_KEY) ?? 'null')); }
  catch { return normalizePalettePreference(null); }
}

export function savePalettePreference(value: PalettePreference): void {
  try { localStorage.setItem(PALETTE_LAYOUT_KEY, JSON.stringify(normalizePalettePreference(value))); }
  catch { /* Layout remains usable when local storage is unavailable. */ }
}
