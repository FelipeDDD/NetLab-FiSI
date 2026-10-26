import { create } from 'zustand';

export const ALIGNMENT_GUIDES_KEY = 'netlab:alignment-guides:v1';
export const normalizeAlignmentGuides = (value: unknown): boolean => typeof value === 'boolean' ? value : true;
export function readAlignmentGuides(): boolean {
  try { return normalizeAlignmentGuides(JSON.parse(localStorage.getItem(ALIGNMENT_GUIDES_KEY) ?? 'null')); }
  catch { return true; }
}
// Canvas UX preference, independent of background, grid, theme and topology data.
export const useAlignmentPreference = create<{ enabled: boolean; setEnabled(value: boolean): void }>(set => ({
  enabled: readAlignmentGuides(),
  setEnabled(value) {
    const enabled = normalizeAlignmentGuides(value);
    try { localStorage.setItem(ALIGNMENT_GUIDES_KEY, JSON.stringify(enabled)); } catch { /* Usable without browser storage. */ }
    set({ enabled });
  },
}));
