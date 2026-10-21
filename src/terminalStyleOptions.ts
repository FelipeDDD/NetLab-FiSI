import type { TerminalAppearance } from './terminalAppearance';
import { TERMINAL_EFFECT_GROUPS } from './terminalEffects';

type Style = TerminalAppearance['style'];
export interface TerminalStyleVariation { id: Style; label: string; experimental: boolean }
export interface TerminalStyleFamily { id: string; label: string; original?: boolean; variations: TerminalStyleVariation[] }

const experimental = new Set<Style>([
  'fx-aurora-vivid', 'fx-signal-minimal', 'fx-signal-pulse',
  'fx-mesh-ambient', 'fx-mesh-prism', 'fx-mesh-deep-glow',
]);

// Presentation only: saved styles remain the existing renderer IDs. The original
// Aurora Lines is distinct from the newer family with Subtle/Flow/Spectrum.
const families: TerminalStyleFamily[] = [
  ...TERMINAL_EFFECT_GROUPS.map((group) => ({
    id: group.label, label: group.label,
    variations: group.presets.map((preset) => ({
      id: preset.id, label: preset.label.replace(/^(Aurora|Lines|Signal|Mesh) /, ''),
      experimental: experimental.has(preset.id),
    })),
  })),
  ...([
    ['diagonal', 'Diagonal'], ['dual-glow', 'Dual Glow'],
    ['aurora-lines', 'Aurora Lines'], ['aurora-flow', 'Aurora Flow'],
  ] as const).map(([id, label]) => ({ id, label, original: true, variations: [{ id, label, experimental: false }] })),
];

export function terminalStyleFamilies(current: Style, showExperimental: boolean): TerminalStyleFamily[] {
  return families.map((family) => ({ ...family, variations: family.variations.filter((variation) =>
    showExperimental || !variation.experimental || variation.id === current,
  ) })).filter((family) => family.variations.length > 0);
}

export function terminalStyleForFamily(family: TerminalStyleFamily, current: Style): Style {
  return family.variations.some((variation) => variation.id === current) ? current
    : (family.variations.find((variation) => !variation.experimental) ?? family.variations[0]).id;
}
