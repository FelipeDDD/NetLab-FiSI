import type { ITheme } from '@xterm/xterm';
import type { DeviceKind } from './engine/device';
import type { SaveFile } from './engine/serialize';
import type { TerminalLayoutMode } from './terminalPanels';

export type TerminalKind = 'host' | 'server' | 'router' | 'firewall';
export const DEFAULT_TERMINAL_COLORS: Readonly<Record<TerminalKind, string>> = {
  host: '#60a5fa', server: '#34d399', router: '#fbbf24', firewall: '#fb7185',
};
export const LEGACY_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 12;
export const MAX_TERMINAL_FONT_SIZE = 18;
export const TERMINAL_FONTS = {
  system: { label: 'System (default)', family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  consolas: { label: 'Consolas', family: 'Consolas, ui-monospace, monospace' },
  cascadia: { label: 'Cascadia Code', family: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  courier: { label: 'Courier New', family: '"Courier New", Courier, monospace' },
} as const;
export type TerminalFont = keyof typeof TERMINAL_FONTS;
export interface TerminalAppearance { style: 'diagonal' | 'dual-glow'; intensity: number; fontSize: number; fontFamily: TerminalFont }
export const DEFAULT_TERMINAL_APPEARANCE: Readonly<TerminalAppearance> = { style: 'diagonal', intensity: 80, fontSize: 14, fontFamily: 'system' };

export function terminalFontFamily(value: unknown): string {
  return TERMINAL_FONTS[normalizeTerminalAppearance({ fontFamily: value }).fontFamily].family;
}

export function normalizeTerminalAppearance(value: unknown, fallbackFontSize = DEFAULT_TERMINAL_APPEARANCE.fontSize): TerminalAppearance {
  const source = value && typeof value === 'object' ? value as Partial<TerminalAppearance> : {};
  return {
    style: source.style === 'dual-glow' ? 'dual-glow' : 'diagonal',
    intensity: typeof source.intensity === 'number' && Number.isFinite(source.intensity)
      ? Math.round(Math.max(0, Math.min(100, source.intensity))) : DEFAULT_TERMINAL_APPEARANCE.intensity,
    fontSize: typeof source.fontSize === 'number' && Number.isFinite(source.fontSize)
      ? Math.round(Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, source.fontSize))) : fallbackFontSize,
    fontFamily: typeof source.fontFamily === 'string' && Object.hasOwn(TERMINAL_FONTS, source.fontFamily)
      ? source.fontFamily : 'system',
  };
}

// UI metadata extends the existing v1 file; the engine never reads these fields.
export interface AppearanceSaveFile extends SaveFile {
  ui?: { terminalColors?: Record<string, string>; terminalAppearance?: Partial<TerminalAppearance>; terminalLayoutMode?: TerminalLayoutMode };
}

export function readTerminalAppearance(data: AppearanceSaveFile): TerminalAppearance {
  // Older topologies used 13px and have no font field. New saves explicitly
  // include fontSize, even at defaults, so a new 14px preference survives reload.
  return normalizeTerminalAppearance(data.ui?.terminalAppearance, LEGACY_TERMINAL_FONT_SIZE);
}

export function hasTerminalColor(kind: DeviceKind): kind is TerminalKind {
  return Object.hasOwn(DEFAULT_TERMINAL_COLORS, kind);
}

export function normalizeTerminalColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function terminalColor(kind: DeviceKind, custom?: string): string {
  return normalizeTerminalColor(custom) ?? (hasTerminalColor(kind) ? DEFAULT_TERMINAL_COLORS[kind] : '#94a3b8');
}

// Ignore malformed/unknown entries in imported files rather than accepting CSS.
export function readTerminalColors(data: AppearanceSaveFile): Record<string, string> {
  const source = data.ui?.terminalColors;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const colors: Record<string, string> = {};
  for (const device of data.devices) {
    if (!hasTerminalColor(device.kind) || !Object.hasOwn(source, device.id)) continue;
    const color = normalizeTerminalColor(source[device.id]);
    if (color && color !== DEFAULT_TERMINAL_COLORS[device.kind]) {
      Object.defineProperty(colors, device.id, { value: color, enumerable: true, configurable: true, writable: true });
    }
  }
  return colors;
}

export const TERMINAL_BASE = '#06080c';
const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const hex = (channels: number[]) => '#' + channels.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (from: number[], to: number[], fraction: number) => from.map((v, i) => v + (to[i] - v) * fraction);
const luminance = (channels: number[]) => channels.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

// Preserve hue while bounding luminance so even the weakest normal ANSI text
// color retains 4.5:1 contrast. Intensity then scales the whole safe range.
export function terminalTint(color: string, intensity: number): string {
  const safe = normalizeTerminalColor(color) ?? DEFAULT_TERMINAL_COLORS.host;
  const base = rgb(TERMINAL_BASE);
  const target = rgb(safe);
  let low = 0;
  let high = 0.9;
  for (let i = 0; i < 12; i++) {
    const candidate = (low + high) / 2;
    if (luminance(mix(base, target, candidate)) <= 0.032) low = candidate;
    else high = candidate;
  }
  const amount = normalizeTerminalAppearance({ intensity }).intensity / 100;
  return hex(mix(base, target, low * amount));
}

export function terminalBackground(color: string, preference: Pick<TerminalAppearance, 'style' | 'intensity'> = DEFAULT_TERMINAL_APPEARANCE): string {
  const { style, intensity } = normalizeTerminalAppearance(preference);
  const corner = terminalTint(color, intensity);
  if (style === 'dual-glow') {
    const top = terminalTint(color, intensity * 0.45);
    return `radial-gradient(ellipse 65% 110% at 100% 100%, ${corner} 0%, transparent 70%), radial-gradient(ellipse 45% 85% at 0% 0%, ${top} 0%, transparent 75%)`;
  }
  return `linear-gradient(135deg, ${TERMINAL_BASE} 0%, ${TERMINAL_BASE} 12%, ${corner} 100%)`;
}

// The transparent background retains its RGB base for xterm's contrast checks
// and inverse text. These fixed colors also contrast against the brightest tint.
export const TERMINAL_THEME: ITheme = {
  background: `${TERMINAL_BASE}00`, foreground: '#e2e8f0',
  cursor: '#e2e8f0', cursorAccent: TERMINAL_BASE,
  selectionBackground: '#365475', selectionInactiveBackground: '#30445e', selectionForeground: '#ffffff',
  black: '#94a3b8', red: '#f87171', green: '#4ade80', yellow: '#facc15',
  blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e2e8f0',
  brightBlack: '#a1aab8', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047',
  brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#ffffff',
};
