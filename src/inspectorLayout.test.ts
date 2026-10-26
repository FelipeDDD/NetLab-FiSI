import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InspectorLayoutSettings, InspectorSettingsContent } from './components/InspectorLayoutSettings';
import { UI_THEMES } from './uiTheme';
import { INSPECTOR_LAYOUT_KEY, INSPECTOR_LAYOUTS, clampInspectorWidth, inspectorKeyboardWidth, inspectorPreferredWidth, loadInspectorLayout, normalizeInspectorLayout, saveInspectorLayout } from './inspectorLayout';

// Settings presentation does not need the browser terminal renderer imported by
// the real store. Keep that integration in terminals.test.ts.
vi.mock('./store', () => ({ useStore: (select: (state: { cableStyle: string }) => unknown) => select({ cableStyle: 'straight' }) }));

afterEach(() => vi.unstubAllGlobals());
it('defaults to B and preserves old preset IDs', () => {
  expect(INSPECTOR_LAYOUTS.compact.width).toBe(290);
  for (const layout of ['compact', 'balanced', 'wide']) expect(normalizeInspectorLayout(layout)).toEqual({ layout, customWidth: 340 });
  for (const value of [null, undefined, '', 'unknown', {}, 340]) expect(normalizeInspectorLayout(value)).toEqual({ layout: 'balanced', customWidth: 340 });
});
it('validates custom widths without snapping intermediate values to presets', () => {
  for (const width of [290, 315, 340, 370, 420, 470]) {
    const prefs = normalizeInspectorLayout({ layout: 'custom', customWidth: width });
    expect(prefs.layout).toBe('custom'); expect(inspectorPreferredWidth(prefs)).toBe(width);
  }
  expect(normalizeInspectorLayout({ layout: 'custom', customWidth: 900 }).customWidth).toBe(470);
  expect(normalizeInspectorLayout({ layout: 'custom', customWidth: -10 }).customWidth).toBe(290);
  expect(normalizeInspectorLayout({ layout: 'custom', customWidth: NaN }).customWidth).toBe(340);
});
it('preserves the custom width when switching presets and resetting to B', () => {
  const custom = normalizeInspectorLayout({ layout: 'custom', customWidth: 420 });
  for (const layout of ['compact', 'balanced', 'wide'] as const) {
    const next = { ...custom, layout };
    expect(inspectorPreferredWidth(next)).toBe(INSPECTOR_LAYOUTS[layout].width);
    expect(inspectorPreferredWidth({ ...next, layout: 'custom' })).toBe(420);
  }
});
it('limits displayed width to the viewport without changing the saved preference', () => {
  const prefs = normalizeInspectorLayout({ layout: 'custom', customWidth: 420 });
  expect(clampInspectorWidth(inspectorPreferredWidth(prefs), 320)).toBe(304);
  expect(prefs.customWidth).toBe(420);
  expect(clampInspectorWidth(inspectorPreferredWidth(prefs), 900)).toBe(420);
  expect(clampInspectorWidth(100, 900)).toBe(290); expect(clampInspectorWidth(800, 1500)).toBe(470);
});
it('supports keyboard increments, limits and unhandled keys', () => {
  expect(inspectorKeyboardWidth('ArrowLeft', 340, false, 1280)).toBe(345);
  expect(inspectorKeyboardWidth('ArrowRight', 340, true, 1280)).toBe(320);
  expect(inspectorKeyboardWidth('ArrowRight', 290, false, 1280)).toBe(290);
  expect(inspectorKeyboardWidth('ArrowLeft', 470, true, 1280)).toBe(470);
  expect(inspectorKeyboardWidth('Home', 340, false, 1280)).toBe(290);
  expect(inspectorKeyboardWidth('End', 340, false, 320)).toBe(304);
  expect(inspectorKeyboardWidth('Tab', 340, false, 1280)).toBeNull();
});
it('loads legacy preferences, persists custom width and tolerates broken or unavailable storage', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  expect(loadInspectorLayout().layout).toBe('balanced');
  storage.set(INSPECTOR_LAYOUT_KEY, 'compact'); expect(loadInspectorLayout().layout).toBe('compact');
  const prefs = normalizeInspectorLayout({ layout: 'custom', customWidth: 370 }); saveInspectorLayout(prefs);
  expect(loadInspectorLayout()).toEqual(prefs); expect([...storage.keys()]).toEqual([INSPECTOR_LAYOUT_KEY]);
  storage.set(INSPECTOR_LAYOUT_KEY, '{broken'); expect(loadInspectorLayout().layout).toBe('balanced');
  vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  expect(loadInspectorLayout().layout).toBe('balanced'); expect(() => saveInspectorLayout(prefs)).not.toThrow();
});
it('offers an accessible Settings trigger without mounting an unused popup', () => {
  const html = renderToStaticMarkup(createElement(InspectorLayoutSettings, { value: normalizeInspectorLayout(null), onChange: vi.fn() }));
  expect(html).toContain('Settings'); expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-expanded="false"'); expect(html).not.toContain('<select');
});
it('offers themes separately from existing layout and background preferences', () => {
  const html = renderToStaticMarkup(createElement(InspectorSettingsContent, { value: normalizeInspectorLayout(null), onChange: vi.fn() }));
  expect(html).toContain('<legend>Darstellung</legend>');
  expect(html).toContain('for="ui-theme-choice"');
  for (const theme of Object.values(UI_THEMES)) expect(html).toContain(theme.label);
  for (const id of ['inspector-layout-choice', 'canvas-background-choice', 'wifi-coverage-mode', 'background-animation', 'alignment-guides-enabled']) expect(html).toContain(`id="${id}"`);
  expect(html).toContain('Ausrichtungshilfen');
});
