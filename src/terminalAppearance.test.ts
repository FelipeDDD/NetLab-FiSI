import { describe, expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { serializeNetwork } from './engine/serialize';
import { DEFAULT_TERMINAL_APPEARANCE, DEFAULT_TERMINAL_COLORS, hasTerminalColor, normalizeTerminalAppearance, normalizeTerminalColor, readTerminalAppearance, readTerminalColors, terminalAuroraColors, terminalFlowColors, terminalBackground, terminalColor, terminalTint, terminalFontFamily, TERMINAL_FONTS, TERMINAL_THEME, type AppearanceSaveFile, type TerminalKind } from './terminalAppearance';

function luminance(hex: string): number {
  const values = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const [min, max] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (max + 0.05) / (min + 0.05);
}

describe('terminal appearance', () => {
  it('has distinct defaults for the four shell device types', () => {
    expect(new Set(Object.values(DEFAULT_TERMINAL_COLORS)).size).toBe(4);
    for (const [kind, color] of Object.entries(DEFAULT_TERMINAL_COLORS)) {
      expect(normalizeTerminalColor(color)).toBe(color);
      expect(hasTerminalColor(kind as 'host')).toBe(true);
    }
    expect(hasTerminalColor('switch')).toBe(false);
    expect(hasTerminalColor('ap')).toBe(false);
    expect(terminalColor('host', '#ABCDEF')).toBe('#abcdef');
    expect(terminalColor('server', 'invalid')).toBe(DEFAULT_TERMINAL_COLORS.server);
  });

  it.each(['red', '#fff', '#12345678', 'url(https://invalid.example)', 'var(--color)', ' #ffffff', '', null, 42])(
    'rejects invalid or non-opaque custom colors: %j', (value) => {
      expect(normalizeTerminalColor(value)).toBeNull();
    },
  );

  it('reads only valid custom colors belonging to shell devices in this topology', () => {
    const net = new Network();
    const host = createDevice(net, 'host');
    const server = createDevice(net, 'server');
    const router = createDevice(net, 'router');
    const sw = createDevice(net, 'switch');
    const data: AppearanceSaveFile = serializeNetwork(net, {});
    data.ui = { terminalColors: {
      [host.id]: '#ABCDEF', [server.id]: 'url(bad)', [router.id]: DEFAULT_TERMINAL_COLORS.router,
      [sw.id]: '#123456', missing: '#123456',
    } };
    expect(readTerminalColors(data)).toEqual({ [host.id]: '#abcdef' });
    expect(readTerminalColors(serializeNetwork(net, {}))).toEqual({});
    for (const source of [null, [], 15, 'bad']) {
      expect(readTerminalColors({ ...data, ui: { terminalColors: source } } as unknown as AppearanceSaveFile)).toEqual({});
    }
  });

  it('does not accept inherited color entries from an imported object', () => {
    const net = new Network();
    const host = createDevice(net, 'host');
    const colors = Object.create({ [host.id]: '#123456' });
    expect(readTerminalColors({ ...serializeNetwork(net, {}), ui: { terminalColors: colors } })).toEqual({});
  });

  it('keeps foreground, cursor and all 16 ANSI text colors legible against the brightest possible tint', () => {
    const corner = terminalTint('#ffffff', 100);
    const textColors = ['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
    for (const name of textColors) {
      expect(contrast(TERMINAL_THEME[name]!, corner), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(TERMINAL_THEME.selectionForeground!, TERMINAL_THEME.selectionBackground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(TERMINAL_THEME.selectionForeground!, TERMINAL_THEME.selectionInactiveBackground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(TERMINAL_THEME.cursor!, TERMINAL_THEME.cursorAccent!)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses a static mostly-black gradient and sanitizes even direct callers', () => {
    expect(terminalBackground('#ffffff')).toContain('linear-gradient(135deg, #06080c 0%, #06080c 12%');
    expect(terminalBackground('url(bad)')).toBe(terminalBackground(DEFAULT_TERMINAL_COLORS.host));
    expect(terminalBackground('#000000')).not.toContain('url(');
  });

  it.each([null, {}, 'bad', { style: 'url(bad)', intensity: NaN }])('uses the new defaults for missing/invalid preferences: %j', (value) => {
    expect(normalizeTerminalAppearance(value)).toEqual(DEFAULT_TERMINAL_APPEARANCE);
  });

  it('normalizes style/intensity without accepting CSS or out-of-range input', () => {
    expect(normalizeTerminalAppearance({ style: 'dual-glow', intensity: 55.7 })).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style: 'dual-glow', intensity: 56 });
    expect(normalizeTerminalAppearance({ intensity: -12 }).intensity).toBe(0);
    expect(normalizeTerminalAppearance({ intensity: 500 }).intensity).toBe(100);
    expect(normalizeTerminalAppearance({ intensity: '90' }).intensity).toBe(80);
  });

  it('uses two static light sources with a darker center for Dual Glow', () => {
    const gradient = terminalBackground('#60a5fa', { style: 'dual-glow', intensity: 80 });
    expect(gradient.match(/radial-gradient/g)).toHaveLength(2);
    expect(gradient).toContain('at 100% 100%');
    expect(gradient).toContain('at 0% 0%');
    expect(gradient).toContain('transparent');
    expect(gradient).not.toContain('url(');
  });

  it.each(['aurora-lines', 'aurora-flow'] as const)('accepts %s with the existing preferences and preserves legacy defaults', (style) => {
    const file = serializeNetwork(new Network(), {});
    const preference = { ...DEFAULT_TERMINAL_APPEARANCE, style, intensity: 67 };
    expect(normalizeTerminalAppearance(preference)).toEqual(preference);
    expect(readTerminalAppearance({ ...file, ui: { terminalAppearance: preference } })).toEqual(preference);
    expect(readTerminalAppearance(file)).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, fontSize: 13 });
    expect(terminalAuroraColors('url(bad)')).toEqual(terminalAuroraColors(DEFAULT_TERMINAL_COLORS.host));
    expect(terminalBackground('url(bad)', preference)).toBe(terminalBackground(DEFAULT_TERMINAL_COLORS.host, preference));
  });

  it('gives Aurora Flow distinct companion hues for each type while retaining the custom primary color', () => {
    for (const kind of Object.keys(DEFAULT_TERMINAL_COLORS) as TerminalKind[]) {
      const palette = terminalFlowColors('#ABCDEF', kind);
      expect(palette.primary).toBe('#abcdef');
      expect(new Set(Object.values(palette)).size).toBe(3);
      expect(terminalFlowColors('url(bad)', kind)).toEqual(terminalFlowColors(DEFAULT_TERMINAL_COLORS[kind], kind));
    }
    expect(terminalFlowColors('#abcdef', 'router')).not.toEqual(terminalFlowColors('#abcdef', 'host'));
  });

  it('keeps Aurora Flow ambient lights and wave crests within the existing ANSI contrast budget', () => {
    const textColors = ['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
    for (const kind of Object.keys(DEFAULT_TERMINAL_COLORS) as TerminalKind[]) {
      for (const color of [DEFAULT_TERMINAL_COLORS[kind], '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff']) {
        for (const intensity of [0, 50, 80, 100]) {
          const gradient = terminalBackground(color, { style: 'aurora-flow', intensity }, kind);
          const stops = gradient.match(/#[0-9a-f]{6}/g)!;
          expect(gradient).not.toMatch(/url\(|blur\(|filter/);
          for (const stop of stops) for (const name of textColors) {
            expect(contrast(TERMINAL_THEME[name]!, stop), `${kind} ${color} ${intensity} ${name}`).toBeGreaterThanOrEqual(4.5);
          }
          if (intensity === 0) expect(new Set(stops)).toEqual(new Set(['#06080c']));
          else expect(new Set(stops).size).toBeGreaterThan(2);
        }
      }
    }
  });

  it('keeps Aurora color stops legible at every intensity, with static curves and a black zero-intensity base', () => {
    const names = ['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
    for (const color of [...Object.values(DEFAULT_TERMINAL_COLORS), '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff']) {
      for (const intensity of [0, 25, 50, 80, 100]) {
        const background = terminalBackground(color, { style: 'aurora-lines', intensity });
        const stops = background.match(/#[0-9a-f]{6}/g)!;
        expect(background.match(/radial-gradient/g)).toHaveLength(4);
        expect(background).not.toMatch(/url\(|blur\(|filter/);
        for (const stop of stops) for (const name of names) {
          expect(contrast(TERMINAL_THEME[name]!, stop), `${color} ${intensity}% ${name}`).toBeGreaterThanOrEqual(4.5);
        }
        if (intensity === 0) expect(new Set(stops)).toEqual(new Set(['#06080c']));
      }
    }
    const colors = terminalAuroraColors('#ABCDEF');
    expect(colors.primary).toBe('#abcdef'); expect(normalizeTerminalColor(colors.secondary)).toBe(colors.secondary);
    expect(terminalBackground('#fb7185', { style: 'aurora-lines', intensity: 80 }))
      .not.toBe(terminalBackground('#34d399', { style: 'aurora-lines', intensity: 80 }));
  });

  it('keeps 13px for old topology files while using 14px for new preferences', () => {
    const file = serializeNetwork(new Network(), {});
    expect(normalizeTerminalAppearance(undefined).fontSize).toBe(14);
    expect(readTerminalAppearance(file).fontSize).toBe(13);
    expect(readTerminalAppearance({ ...file, ui: { terminalAppearance: { style: 'dual-glow', intensity: 72 } } }))
      .toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style: 'dual-glow', intensity: 72, fontSize: 13 });
    expect(readTerminalAppearance({ ...file, ui: { terminalAppearance: { fontSize: 14 } } }).fontSize).toBe(14);
  });

  it.each(Object.keys(TERMINAL_FONTS))('accepts the local font preset %s with a monospace fallback', (fontFamily) => {
    const normalized = normalizeTerminalAppearance({ fontFamily });
    expect(normalized.fontFamily).toBe(fontFamily);
    expect(terminalFontFamily(fontFamily)).toBe(TERMINAL_FONTS[normalized.fontFamily].family);
    expect(terminalFontFamily(fontFamily)).toMatch(/monospace$/);
  });

  it.each([undefined, null, '', 'Arial', 'url(https://bad.example)', 'inherit', '__proto__', 'constructor', 18])(
    'uses the original font stack for a missing/invalid family %j', (fontFamily) => {
      expect(normalizeTerminalAppearance({ fontFamily }).fontFamily).toBe('system');
      expect(terminalFontFamily(fontFamily)).toBe(TERMINAL_FONTS.system.family);
    },
  );

  it('preserves previous font size/style preferences when importing files predating font families', () => {
    const file = serializeNetwork(new Network(), {});
    expect(readTerminalAppearance(file).fontFamily).toBe('system');
    const appearance = { style: 'dual-glow' as const, intensity: 62, fontSize: 18 };
    expect(readTerminalAppearance({ ...file, ui: { terminalAppearance: appearance } }))
      .toEqual({ ...appearance, fontFamily: 'system' });
  });

  it.each([
    [12, 12], [13, 13], [14, 14], [18, 18], [10, 12], [100, 18], [15.7, 16],
    ['18', 14], [null, 14], [NaN, 14], [Infinity, 14],
  ])('normalizes terminal-only font size %j to %s', (value, expected) => {
    expect(normalizeTerminalAppearance({ fontSize: value }).fontSize).toBe(expected);
  });

  it.each(Object.values(DEFAULT_TERMINAL_COLORS).concat(['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff']))(
    'keeps the full intensity range legible with %s', (color) => {
      const names = ['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
      let previous = luminance('#06080c');
      for (const intensity of [0, 25, 50, 80, 100]) {
        const tint = terminalTint(color, intensity);
        for (const name of names) expect(contrast(TERMINAL_THEME[name]!, tint), `${name} at ${intensity}`).toBeGreaterThanOrEqual(4.5);
        if (color !== '#000000') expect(luminance(tint)).toBeGreaterThanOrEqual(previous);
        previous = luminance(tint);
      }
      expect(terminalTint(color, 0)).toBe('#06080c');
    },
  );
});
