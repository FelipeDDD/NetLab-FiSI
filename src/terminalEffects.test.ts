import { expect, it } from 'vitest';
import { TERMINAL_EFFECT_GROUPS, isTerminalEffect, terminalEffectBackground } from './terminalEffects';
import { DEFAULT_TERMINAL_APPEARANCE, DEFAULT_TERMINAL_COLORS, TERMINAL_THEME, normalizeTerminalAppearance, terminalBackground, type TerminalKind } from './terminalAppearance';

const presets = TERMINAL_EFFECT_GROUPS.flatMap((group) => [...group.presets]);
const decode = (background: string) => decodeURIComponent(background.slice('url("data:image/svg+xml,'.length, -2));
function luminance(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

it('accepts the twelve stable preset IDs while retaining legacy styles and safe unknown fallbacks', () => {
  expect(new Set(presets.map((preset) => preset.id)).size).toBe(12);
  for (const { id } of presets) expect(normalizeTerminalAppearance({ style: id }).style).toBe(id);
  for (const style of ['diagonal', 'dual-glow', 'aurora-lines', 'aurora-flow']) {
    expect(normalizeTerminalAppearance({ style }).style).toBe(style);
    expect(isTerminalEffect(style)).toBe(false);
  }
  for (const style of ['fx-unknown', '__proto__', null, 1]) {
    expect(isTerminalEffect(style)).toBe(false);
    expect(normalizeTerminalAppearance({ style })).toEqual(DEFAULT_TERMINAL_APPEARANCE);
  }
});

it.each(presets)('$label stays self-contained, bounded and legible at every intensity and device palette', ({ id }) => {
  const text = ['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
  for (const kind of Object.keys(DEFAULT_TERMINAL_COLORS) as TerminalKind[]) {
    for (const color of [DEFAULT_TERMINAL_COLORS[kind], '#ffffff', '#000000']) {
      for (const intensity of [0, 40, 80, 100]) {
        const svg = decode(terminalBackground(color, { style: id, intensity }, kind));
        expect(svg.length).toBeLessThan(15000);
        expect(svg).not.toMatch(/<(script|foreignObject|image|animate|set)\b|\bon\w+=|https?:\/\/(?!www.w3.org)/i);
        const colors = [...new Set(svg.match(/#[0-9a-f]{6}/g))];
        if (intensity === 0) expect(colors).toEqual(['#06080c']);
        for (const stop of colors) for (const name of text) {
          const ratio = (luminance(TERMINAL_THEME[name]!) + 0.05) / (luminance(stop) + 0.05);
          expect(ratio, `${id} ${kind} ${color} ${intensity}% ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
});

it('rejects SVG injection in palettes, including direct callers', () => {
  const svg = decode(terminalEffectBackground('fx-lines-flow', ['"/><script>bad</script>', 'url(https://bad)', '#abcd']));
  expect(svg).not.toContain('<script>');
  expect(svg).not.toContain('https://bad');
  expect([...new Set(svg.match(/#[0-9a-f]{6}/g))]).toEqual(['#06080c']);
});
