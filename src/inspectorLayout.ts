export const INSPECTOR_LAYOUTS = {
  compact: { label: 'A · Kompakt (290 px)', width: 290 },
  balanced: { label: 'B · Ausgewogen (340 px)', width: 340 },
  wide: { label: 'C · Breit (470 px)', width: 470 },
} as const;
export type InspectorLayout = keyof typeof INSPECTOR_LAYOUTS | 'custom';
export interface InspectorLayoutPreference { layout: InspectorLayout; customWidth: number }
export const MIN_INSPECTOR_WIDTH = 290;
export const MAX_INSPECTOR_WIDTH = 470;
export const INSPECTOR_LAYOUT_KEY = 'netlab-inspector-layout';
export function normalizeInspectorLayout(value: unknown): InspectorLayoutPreference {
  const source: { layout?: unknown; customWidth?: unknown } = value && typeof value === 'object' ? value : { layout: value };
  const layout = source.layout === 'compact' || source.layout === 'wide' || source.layout === 'custom' ? source.layout : 'balanced';
  const customWidth = typeof source.customWidth === 'number' && Number.isFinite(source.customWidth)
    ? Math.round(Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, source.customWidth))) : 340;
  return { layout, customWidth };
}
export function inspectorPreferredWidth(value: InspectorLayoutPreference): number {
  return value.layout === 'custom' ? value.customWidth : INSPECTOR_LAYOUTS[value.layout].width;
}
export function inspectorWidthBounds(viewportWidth: number) {
  const max = Math.max(0, Math.min(MAX_INSPECTOR_WIDTH, viewportWidth - 16));
  return { min: Math.min(MIN_INSPECTOR_WIDTH, max), max };
}
export function clampInspectorWidth(width: number, viewportWidth: number): number {
  const { min, max } = inspectorWidthBounds(viewportWidth);
  return Math.round(Math.max(min, Math.min(max, width)));
}
export function inspectorKeyboardWidth(key: string, width: number, shift: boolean, viewportWidth: number): number | null {
  const bounds = inspectorWidthBounds(viewportWidth), step = shift ? 20 : 5;
  if (key === 'ArrowLeft') return clampInspectorWidth(width + step, viewportWidth);
  if (key === 'ArrowRight') return clampInspectorWidth(width - step, viewportWidth);
  if (key === 'Home') return bounds.min;
  if (key === 'End') return bounds.max;
  return null;
}
export function loadInspectorLayout(): InspectorLayoutPreference {
  try {
    const raw = localStorage.getItem(INSPECTOR_LAYOUT_KEY);
    // Previous versions stored only the preset ID.
    return normalizeInspectorLayout(raw?.startsWith('{') ? JSON.parse(raw) : raw);
  } catch { return normalizeInspectorLayout(null); }
}
export function saveInspectorLayout(value: InspectorLayoutPreference): void {
  try { localStorage.setItem(INSPECTOR_LAYOUT_KEY, JSON.stringify(normalizeInspectorLayout(value))); }
  catch { /* The experiment remains usable when browser storage is unavailable. */ }
}
