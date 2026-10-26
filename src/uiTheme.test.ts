import { DEVICE_COLORS } from './deviceColors';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { UI_THEMES, UI_THEME_KEY, applyUiTheme, normalizeUiTheme, readUiTheme, useUiTheme } from './uiTheme';

afterEach(() => { vi.unstubAllGlobals(); useUiTheme.setState({ theme: 'original' }); });

it('defaults old installations and unknown preferences to Original', () => {
  for (const value of [null, undefined, '', 'dark', 'midnight-blue', 'toString', '__proto__', {}, 1]) expect(normalizeUiTheme(value)).toBe('original');
  for (const theme of Object.keys(UI_THEMES)) expect(normalizeUiTheme(theme)).toBe(theme);
  vi.stubGlobal('localStorage', { getItem: () => null });
  expect(readUiTheme()).toBe('original');
  vi.stubGlobal('localStorage', { getItem: () => 'classic-light' });
  expect(readUiTheme()).toBe('classic-light');
  vi.stubGlobal('localStorage', { getItem: () => 'midnight-blue' });
  expect(readUiTheme()).toBe('original');
  expect(Object.hasOwn(UI_THEMES, 'midnight-blue')).toBe(false);
});

it('updates the document immediately and persists only its own preference', () => {
  const values = new Map([['netlab:canvas-background:v1', '{"choice":"verde2"}'], ['netsim:autosave:v1', 'existing topology']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal('document', { documentElement: root });
  for (const theme of Object.keys(UI_THEMES)) {
    useUiTheme.getState().setTheme(normalizeUiTheme(theme));
    expect(root.dataset.uiTheme).toBe(theme);
    expect(useUiTheme.getState().theme).toBe(theme);
    expect(readUiTheme()).toBe(theme);
    expect(values.get(UI_THEME_KEY)).toBe(theme);
  }
  expect(values.get('netlab:canvas-background:v1')).toBe('{"choice":"verde2"}');
  expect(values.get('netsim:autosave:v1')).toBe('existing topology');
  expect(values.size).toBe(3);
});

it('works without storage or a browser document', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
  expect(readUiTheme()).toBe('original');
  expect(() => useUiTheme.getState().setTheme('deep-teal')).not.toThrow();
  expect(useUiTheme.getState().theme).toBe('deep-teal');
  expect(() => applyUiTheme('original')).not.toThrow();
});

// Check the actual CSS palette, including inherited Original tokens. This
// catches unreadable additions without coupling tests to component markup.
it('keeps primary, secondary, status and category text readable on UI surfaces', () => {
  const css = readFileSync(new URL('./themes.css', import.meta.url), 'utf8');
  const tokens = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(m => [m[1], m[2]]));
  const base = { ...tokens(css.match(/:root\s*\{([^}]+)\}/)![1]), ...Object.fromEntries(Object.entries(DEVICE_COLORS).map(([kind, color]) => ['--ui-category-' + kind, color])) };
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const theme of Object.keys(UI_THEMES)) {
    const body = css.match(new RegExp(`:root\\[data-ui-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
    const palette = { ...base, ...tokens(body) };
    for (const surface of ['--ui-surface-panel', '--ui-surface-raised', '--ui-surface-card']) {
      for (const text of ['--ui-text', '--ui-text-muted', '--ui-text-secondary', '--ui-accent', '--ui-danger', '--ui-link-active', '--ui-link-inactive', '--ui-link-empty', '--ui-category-host', '--ui-category-switch', '--ui-category-router', '--ui-category-firewall', '--ui-category-server', '--ui-category-ap']) {
        const a = luminance(palette[text]), b = luminance(palette[surface]);
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${theme}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    if (theme === 'graphite-dark' || theme === 'slate-gray') {
      for (const surface of ['--ui-surface-selected', '--ui-surface-hover']) {
        for (const text of ['--ui-text', '--ui-text-muted', '--ui-text-secondary', '--ui-accent']) {
          const a = luminance(palette[text]), b = luminance(palette[surface]);
          expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${theme}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
});
