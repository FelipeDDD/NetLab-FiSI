import type { ITheme } from '@xterm/xterm';
import type { DeviceKind } from './engine/device';
import type { SaveFile } from './engine/serialize';
import type { TerminalLayoutMode } from './terminalPanels';
import { isTerminalEffect, terminalEffectBackground, type TerminalEffectId } from './terminalEffects';

export type TerminalKind = 'host' | 'server' | 'router' | 'firewall';
export const DEFAULT_TERMINAL_COLORS: Readonly<Record<TerminalKind, string>> = {
  host: '#60a5fa', server: '#34d399', router: '#fbbf24', firewall: '#fb7185',
};
export const LEGACY_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 12;
export const MAX_TERMINAL_FONT_SIZE = 18;
export const TERMINAL_FONTS = {
  system: { label: 'System (default)', family: 'Consolas, "Cascadia Mono", "Liberation Mono", monospace' },
  consolas: { label: 'Consolas', family: 'Consolas, ui-monospace, monospace' },
  cascadia: { label: 'Cascadia Code', family: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  courier: { label: 'Courier New', family: '"Courier New", Courier, monospace' },
} as const;
export type TerminalFont = keyof typeof TERMINAL_FONTS;
export interface TerminalAppearance { style: 'diagonal' | 'dual-glow' | 'aurora-lines' | 'aurora-flow' | TerminalEffectId; intensity: number; fontSize: number; fontFamily: TerminalFont }
export const DEFAULT_TERMINAL_APPEARANCE: Readonly<TerminalAppearance> = { style: 'diagonal', intensity: 80, fontSize: 14, fontFamily: 'system' };

export function terminalFontFamily(value: unknown): string {
  return TERMINAL_FONTS[normalizeTerminalAppearance({ fontFamily: value }).fontFamily].family;
}

export function normalizeTerminalAppearance(value: unknown, fallbackFontSize = DEFAULT_TERMINAL_APPEARANCE.fontSize): TerminalAppearance {
  const source = value && typeof value === 'object' ? value as Partial<TerminalAppearance> : {};
  return {
    style: source.style === 'dual-glow' || source.style === 'aurora-lines' || source.style === 'aurora-flow' || isTerminalEffect(source.style) ? source.style : 'diagonal',
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
  ui?: { areaMarkings?: import('./areaMarkings').AreaMarking[]; cableColors?: Record<string, import('./cableAppearance').CableAppearance | import('./cableAppearance').CableColor>; terminalColors?: Record<string, string>; terminalAppearance?: Partial<TerminalAppearance>; terminalLayoutMode?: TerminalLayoutMode };
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

// Tabs contain UI text, not the ANSI palette. Mixing with their own neutral
// surface keeps selection visible without the much darker xterm tint limit.
export function terminalTabPalette(color: string): { active: string; hover: string; activeHover: string } {
  const base = rgb('#0b1220');
  const target = rgb(normalizeTerminalColor(color) ?? DEFAULT_TERMINAL_COLORS.host);
  return { active: hex(mix(base, target, 0.24)), hover: hex(mix(base, target, 0.06)),
    activeHover: hex(mix(base, target, 0.30)) };
}

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

// Shared by the Aurora background and its fine panel accent. Keep palette
// generation separate from rendering, with no CSS or engine state as input.
export function terminalAuroraColors(color: string): { primary: string; secondary: string } {
  const primary = normalizeTerminalColor(color) ?? DEFAULT_TERMINAL_COLORS.host;
  return { primary, secondary: hex(mix(rgb(primary), rgb('#818cf8'), 0.75)) };
}

// Companion hues stay distinct even for neutral custom colors. Device color
// remains the primary light; companions inherit a little of it for cohesion.
export function terminalFlowColors(color: string, kind: DeviceKind = 'host'): { primary: string; secondary: string; tertiary: string } {
  const primary = normalizeTerminalColor(color) ?? terminalColor(kind);
  const companions: Record<TerminalKind, [string, string]> = {
    host: ['#22d3ee', '#8b5cf6'], server: ['#14b8a6', '#3b82f6'],
    router: ['#f97316', '#a78bfa'], firewall: ['#db2777', '#8b5cf6'],
  };
  const [second, third] = companions[hasTerminalColor(kind) ? kind : 'host'];
  return { primary, secondary: hex(mix(rgb(primary), rgb(second), 0.85)), tertiary: hex(mix(rgb(primary), rgb(third), 0.9)) };
}

export function terminalBackground(color: string, preference: Pick<TerminalAppearance, 'style' | 'intensity'> = DEFAULT_TERMINAL_APPEARANCE, kind: DeviceKind = 'host'): string {
  const { style, intensity } = normalizeTerminalAppearance(preference);
  if (isTerminalEffect(style)) {
    const palette = terminalFlowColors(color, kind);
    return terminalEffectBackground(style, Object.values(palette).map((tone) => terminalTint(tone, intensity)));
  }
  const corner = terminalTint(color, intensity);
  if (style === 'aurora-flow') {
    const palette = terminalFlowColors(color, kind);
    const light = terminalTint(palette.primary, intensity);
    const second = terminalTint(palette.secondary, intensity * 0.9);
    const third = terminalTint(palette.tertiary, intensity * 0.9);
    // Two thin elliptical wave crests over broad, overlapping ambient lights.
    // Luminance-capped stops use normal alpha compositing, never additive blending.
    return [
      `radial-gradient(ellipse 95% 75% at 20% 115%, transparent calc(72% - 2px), ${second} 72%, transparent calc(72% + 2px))`,
      `radial-gradient(ellipse 110% 90% at 110% -10%, transparent calc(80% - 1px), ${third} 80%, transparent calc(80% + 2px))`,
      `radial-gradient(ellipse 85% 80% at 90% 75%, ${light} 0%, transparent 85%)`,
      `radial-gradient(ellipse 90% 75% at 8% 52%, ${second} 0%, transparent 85%)`,
      `radial-gradient(ellipse 85% 90% at 72% 8%, ${third} 0%, transparent 85%)`,
      `linear-gradient(145deg, ${TERMINAL_BASE} 8%, ${terminalTint(palette.primary, intensity * 0.25)} 55%, ${TERMINAL_BASE} 100%)`,
    ].join(', ');
  }
  if (style === 'aurora-lines') {
    const { secondary } = terminalAuroraColors(color);
    const ribbon = terminalTint(secondary, intensity * 0.85);
    const wash = terminalTint(color, intensity * 0.4);
    const top = terminalTint(secondary, intensity * 0.18);
    // Soft elliptical bands suggest an aurora without images, filters or motion.
    // Every color stop uses the same luminance cap as the existing backgrounds.
    return `radial-gradient(ellipse 110% 100% at 110% 130%, transparent 28%, ${corner} 52%, transparent 85%), radial-gradient(ellipse 120% 90% at -5% 125%, transparent 24%, ${ribbon} 56%, transparent 90%), radial-gradient(ellipse 90% 100% at 100% 110%, ${wash} 0%, transparent 75%), radial-gradient(ellipse 75% 70% at -10% -35%, ${top} 0%, transparent 85%)`;
  }
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
