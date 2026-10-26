import type { NetInterface } from './engine/device';
import type { Network } from './engine/network';
import { DEVICE_COLORS } from './deviceColors';

// Presentation metadata only: colors never influence medium, VLAN or forwarding.
export const CABLE_COLORS = {
  gray: { label: 'Grau (Standard)', value: '#4a5f85' },
  red: { label: 'Rot', value: '#e76670' },
  yellow: { label: 'Gelb', value: '#d7ae3d' },
  green: { label: 'Grün', value: '#4cb880' },
  blue: { label: 'Blau', value: '#5b9ee8' },
  purple: { label: 'Violett', value: '#a383dd' },
} as const;
export type CableColor = keyof typeof CABLE_COLORS;
export type CableAppearance = { mode: 'auto' | 'manual'; color: string };
export type CableAppearances = Record<string, CableAppearance>;
export function isCableColor(value: unknown): value is CableColor {
  return typeof value === 'string' && Object.hasOwn(CABLE_COLORS, value);
}
export const sameCableAppearance = (a: CableAppearance | null | undefined, b: CableAppearance | null | undefined) =>
  a?.mode === b?.mode && a?.color === b?.color;
export function readCableColors(value: unknown, ids: Iterable<string>): CableAppearances {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: CableAppearances = {};
  for (const id of ids) {
    if (!Object.hasOwn(value, id)) continue;
    const entry = (value as Record<string, unknown>)[id];
    let appearance: CableAppearance | null = null;
    // Earlier topology versions stored palette keys. All were user choices.
    if (isCableColor(entry)) appearance = { mode: 'manual', color: CABLE_COLORS[entry].value };
    else if (entry && typeof entry === 'object' && 'mode' in entry && 'color' in entry
      && (entry.mode === 'auto' || entry.mode === 'manual') && typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)) {
      appearance = { mode: entry.mode, color: entry.color.toLowerCase() };
    }
    if (appearance) Object.defineProperty(result, id, { value: appearance, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

export function interfaceCableColor(iface: NetInterface | null | undefined, colors: CableAppearances | undefined): string | undefined {
  const link = iface?.link;
  if (!link || iface.device.network.links.get(link.id) !== link || link.other(iface).link !== link) return undefined;
  return colors?.[link.id]?.color ?? CABLE_COLORS.gray.value;
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
function luminance(hex: string): number {
  return rgb(hex).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
function hsl(hue: number, light: number): string {
  const a = .64 * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return '#' + channel(0) + channel(8) + channel(4);
}
function generatedColor(seed: string, used: Set<string>): string {
  let hash = 2166136261;
  for (const letter of seed) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  let best = '', score = -1;
  const samples = [...used].map(rgb);
  for (let i = 0; i < 256; i++) {
    const hue = (hash % 360 + i * 137.508) % 360;
    let light = [.4, .48, .56][i % 3], color = hsl(hue, light);
    // Moderate luminance for contrast against dark canvas and light surfaces.
    for (let j = 0; j < 35; j++) {
      const l = luminance(color);
      if (l >= .18 && l <= .27) break;
      light += l < .18 ? .01 : -.01; color = hsl(hue, light);
    }
    const channels = rgb(color);
    const separation = Math.min(...samples.map(other => channels.reduce((sum, c, j) => sum + (c - other[j]) ** 2, 0)));
    if (!used.has(color) && separation > score) { best = color; score = separation; }
  }
  return best;
}

export function automaticCableAppearance(net: Network, id: string, colors: CableAppearances): CableAppearance {
  const link = net.links.get(id);
  if (!link) return { mode: 'auto', color: CABLE_COLORS.gray.value };
  const devices = [link.a.device, link.b.device];
  const backbone = (kind: string) => ['router', 'switch', 'firewall'].includes(kind);
  const priority = { ap: 8, server: 7, firewall: 6, notebook: 5, smartphone: 5, host: 4, switch: 3, router: 2 };
  const preferred = [...devices].sort((a, b) => Number(backbone(a.kind)) - Number(backbone(b.kind))
    || priority[b.kind] - priority[a.kind] || a.id.localeCompare(b.id, 'en'))[0];
  const routers = new Set(devices.filter(d => d.kind === 'router' || d.kind === 'firewall').map(d => d.id));
  const used = new Set([...net.links.values()].filter(l => l.id !== id && (routers.has(l.a.device.id) || routers.has(l.b.device.id)))
    .map(l => colors[l.id]?.color ?? CABLE_COLORS.gray.value));
  const candidates = [DEVICE_COLORS[preferred.kind], ...Object.values(CABLE_COLORS).map(c => c.value)];
  return { mode: 'auto', color: candidates.find(c => !used.has(c)) ?? generatedColor(id, used) };
}

export function initialCableColors(net: Network): CableAppearances {
  const colors: CableAppearances = {};
  for (const id of net.links.keys()) colors[id] = automaticCableAppearance(net, id, colors);
  return colors;
}
