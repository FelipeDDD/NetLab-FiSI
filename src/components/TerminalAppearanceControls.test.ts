import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalSettingsControls } from './TerminalAppearanceControls';
import { DEFAULT_TERMINAL_APPEARANCE, type TerminalAppearance } from '../terminalAppearance';
import { TERMINAL_EFFECT_GROUPS } from '../terminalEffects';
import { terminalStyleFamilies, terminalStyleForFamily } from '../terminalStyleOptions';

const view = vi.hoisted(() => ({ nodes: [], uiPulse: 0, activeTerminal: null, terminalColors: {},
  terminalAppearance: null as unknown as TerminalAppearance, terminalLayoutMode: 'free', setTerminalColor: vi.fn(), setTerminalAppearance: vi.fn(),
}));
vi.mock('../store', () => ({ useStore: Object.assign((selector: (state: typeof view) => unknown) => selector(view), { getState: () => view }) }));
vi.mock('../sim', () => ({ sim: { net: { devices: new Map() } } }));

it.each(['diagonal', 'dual-glow', 'aurora-lines', 'aurora-flow'] as const)('preserves original %s without an unnecessary variation selector', (style) => {
  view.terminalAppearance = { ...DEFAULT_TERMINAL_APPEARANCE, style, intensity: 67 };
  const html = renderToStaticMarkup(createElement(TerminalSettingsControls));
  expect(html).toContain(`<option value="${style}" selected="">`);
  expect(html).not.toContain('aria-label="Variation"');
  expect(html).toContain('<output>67%</output>');
});

it('shows the chosen family and its concise variations while experiments start hidden', () => {
  view.terminalAppearance = { ...DEFAULT_TERMINAL_APPEARANCE, style: 'fx-lines-flow' };
  const html = renderToStaticMarkup(createElement(TerminalSettingsControls));
  expect(html).toContain('<option value="Aurora Lines" selected="">Aurora Lines</option>');
  expect(html).toContain('<option value="fx-lines-flow" selected="">Flow</option>');
  expect(html).toContain('>Subtle</option>');
  expect(html).toContain('>Spectrum</option>');
  expect(html).toContain('<optgroup label="Original styles">');
  expect(html).toContain('<option value="aurora-lines">Aurora Lines</option>');
  expect(html).not.toMatch(/Vivid|Minimal|Pulse|Prism|Ambient|Deep Glow/);
  expect(html).toContain('<input type="checkbox"/>');
});

it('shows only Soft/Balanced for Aurora and no variation selector for Matrix', () => {
  view.terminalAppearance = { ...DEFAULT_TERMINAL_APPEARANCE, style: 'fx-aurora-balanced' };
  let html = renderToStaticMarkup(createElement(TerminalSettingsControls));
  expect(html).toContain('>Soft</option>');
  expect(html).toContain('<option value="fx-aurora-balanced" selected="">Balanced</option>');
  view.terminalAppearance = { ...view.terminalAppearance, style: 'fx-signal-matrix' };
  html = renderToStaticMarkup(createElement(TerminalSettingsControls));
  expect(html).toContain('<option value="Signal / Wireframe" selected="">Signal / Wireframe</option>');
  expect(html).not.toContain('aria-label="Variation"');
  expect(html).toContain('>Matrix</span>');
});

it.each(TERMINAL_EFFECT_GROUPS.flatMap((group) => group.presets.map((preset) => preset.id)))('represents saved %s even when experimental styles are hidden', (id) => {
  view.terminalAppearance = { ...DEFAULT_TERMINAL_APPEARANCE, style: id };
  const visible = terminalStyleFamilies(id, false);
  const family = visible.find((item) => item.variations.some((variation) => variation.id === id))!;
  expect(terminalStyleForFamily(family, id)).toBe(id);
  const html = renderToStaticMarkup(createElement(TerminalSettingsControls));
  expect(html).toContain(`<option value="${family.id}" selected="">`);
  if (family.variations.length > 1) expect(html).toContain(`<option value="${id}" selected="">`);
  if (family.variations.find((item) => item.id === id)!.experimental) expect(html).toContain('Experimental style selected.');
});

it('reveals all styles on request and keeps a selected experiment when hiding them again', () => {
  const all = terminalStyleFamilies('diagonal', true).flatMap((item) => item.variations);
  expect(new Set(all.map((item) => item.id)).size).toBe(16);
  const hidden = terminalStyleFamilies('fx-mesh-prism', false).flatMap((item) => item.variations);
  expect(hidden.filter((item) => item.experimental).map((item) => item.id)).toEqual(['fx-mesh-prism']);
  const signal = terminalStyleFamilies('diagonal', true).find((item) => item.id === 'Signal / Wireframe')!;
  expect(terminalStyleForFamily(signal, 'diagonal')).toBe('fx-signal-matrix');
  expect(terminalStyleForFamily(signal, 'fx-signal-pulse')).toBe('fx-signal-pulse');
});
