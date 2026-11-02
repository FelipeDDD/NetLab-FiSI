import { create } from 'zustand';

// Register a theme here and add its token overrides in themes.css.
export const UI_THEMES = {
  original: { label: 'Midnight Blue', group: 'dark' },
  'graphite-dark': { label: 'Graphite Dark', group: 'dark' },
  'slate-gray': { label: 'Slate Gray', group: 'light' },
  'deep-teal': { label: 'Deep Teal', group: 'dark' },
  'classic-light': { label: 'Classic Light', group: 'light' },
} as const;
export type UiTheme = keyof typeof UI_THEMES;
export const UI_THEME_KEY = 'netlab:ui-theme:v1';
export const DEFAULT_UI_THEME: UiTheme = 'graphite-dark';

export function normalizeUiTheme(value: unknown): UiTheme {
  return typeof value === 'string' && Object.hasOwn(UI_THEMES, value) ? value as UiTheme : 'original';
}

export function readUiTheme(): UiTheme {
  try {
    const saved = localStorage.getItem(UI_THEME_KEY);
    // Absence uses the new default; existing/retired values retain their
    // historical normalization (including midnight-blue -> original).
    return saved == null ? DEFAULT_UI_THEME : normalizeUiTheme(saved);
  } catch { return DEFAULT_UI_THEME; }
}

export function applyUiTheme(theme: UiTheme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.uiTheme = theme;
}

// A presentation preference: deliberately independent of topology, background,
// layout and their stores/history. Applying it never remounts the editor.
export const useUiTheme = create<{ theme: UiTheme; setTheme: (value: UiTheme) => void }>(set => ({
  theme: readUiTheme(),
  setTheme: value => {
    const theme = normalizeUiTheme(value);
    try { localStorage.setItem(UI_THEME_KEY, theme); } catch { /* optional preference */ }
    applyUiTheme(theme);
    set({ theme });
  },
}));
