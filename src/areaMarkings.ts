import { DEVICE_ARTWORK, hasDeviceArtwork, type VisualNode } from './deviceArtwork';
import { deviceLabelLayout } from './canvasNetwork';
import { MIN_EXTENSION_SIZE, readExtensions, validAreaRect, type AreaRect, type MarkingExtension } from './markingGeometry';

export function readMarkingRect(value: unknown): AreaRect | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validAreaRect(value as AreaRect)) return undefined;
  const { x, y, width, height } = value as AreaRect;
  return { x, y, width, height };
}

/** Positive offsets expand outward; negative offsets inset that edge. World units. */
export interface MarkingBaseOffsets { left: number; top: number; right: number; bottom: number }
export function validBaseOffsets(value: unknown): value is MarkingBaseOffsets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as MarkingBaseOffsets;
  return [o.left, o.top, o.right, o.bottom].every(n => Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER);
}
export function readBaseOffsets(value: unknown): MarkingBaseOffsets | undefined {
  if (!validBaseOffsets(value)) return undefined;
  const { left, top, right, bottom } = value;
  return left || top || right || bottom ? { left, top, right, bottom } : undefined;
}
export function offsetsFromBounds(automatic: AreaRect, adjusted: AreaRect): MarkingBaseOffsets {
  return { left: automatic.x - adjusted.x, top: automatic.y - adjusted.y,
    right: adjusted.x + adjusted.width - automatic.x - automatic.width,
    bottom: adjusted.y + adjusted.height - automatic.y - automatic.height };
}

export const MARKING_COLORS = {
  blue: { label: 'Blau', value: '#598fb9' }, teal: { label: 'Petrol', value: '#4c9f94' },
  green: { label: 'Grün', value: '#6b9b70' }, amber: { label: 'Ocker', value: '#b19855' },
  violet: { label: 'Violett', value: '#9380b6' }, rose: { label: 'Rosé', value: '#b4788e' },
} as const;
export type MarkingColor = keyof typeof MARKING_COLORS;
export interface AreaMarking {
  id: string;
  name: string;
  color: MarkingColor;
  intensity: number;
  deviceIds: string[];
  extensions?: MarkingExtension[];
  baseOffsets?: MarkingBaseOffsets;
  /** Absent on legacy/member-derived areas. Free areas require their own bounds. */
  geometry?: 'free';
  bounds?: AreaRect;
}
export type MarkingStyle = Pick<AreaMarking, 'name' | 'color' | 'intensity'>;
export const DEFAULT_MARKING: MarkingStyle = { name: '', color: 'blue', intensity: 18 };
export const isMarkingColor = (v: unknown): v is MarkingColor => typeof v === 'string' && Object.hasOwn(MARKING_COLORS, v);
export function validMarkingStyle(v: MarkingStyle): boolean {
  return typeof v.name === 'string' && v.name.length <= 80 && isMarkingColor(v.color)
    && Number.isInteger(v.intensity) && v.intensity >= 5 && v.intensity <= 50;
}

/** Optional presentation data only. Never accept arbitrary CSS or unknown IDs. */
export function readAreaMarkings(value: unknown, deviceIds: Iterable<string>): AreaMarking[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(deviceIds), seen = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || seen.has(raw.id) ||
        !validMarkingStyle(raw) || !Array.isArray(raw.deviceIds)) return [];
    const members = [...new Set<string>(raw.deviceIds.filter((id: unknown): id is string => typeof id === 'string' && allowed.has(id)))];
    if (raw.geometry !== undefined && raw.geometry !== 'free') return [];
    const bounds = raw.geometry === 'free' ? readMarkingRect(raw.bounds) : undefined;
    if (raw.geometry === 'free' ? !bounds : !members.length) return [];
    seen.add(raw.id);
    const extensions = readExtensions(raw.extensions);
    const baseOffsets = raw.geometry === 'free' ? undefined : readBaseOffsets(raw.baseOffsets);
    return [{ id: raw.id, name: raw.name, color: raw.color, intensity: raw.intensity, deviceIds: members,
      ...(extensions.length ? { extensions } : {}), ...(baseOffsets ? { baseOffsets } : {}),
      ...(bounds ? { geometry: 'free' as const, bounds } : {}) }];
  });
}

export function pruneAreaMarkings(markings: readonly AreaMarking[], deviceIds: Iterable<string>): AreaMarking[] {
  return readAreaMarkings(markings, deviceIds);
}

/** Unadjusted world-space bounds use captions at nominal 1x, independently of
 * their visual zoom compensation. Saved offsets never become absolute bounds. */
export function automaticMarkingBounds(marking: AreaMarking, nodes: readonly VisualNode[]) {
  const members = new Set(marking.deviceIds), boxes = nodes.filter(n => members.has(n.id)).map(n => {
    const artwork = hasDeviceArtwork(n.data.kind) ? DEVICE_ARTWORK[n.data.kind] : null;
    const width = n.measured?.width ?? (artwork ? artwork.width + 20 : 96);
    const height = n.measured?.height ?? (artwork ? artwork.height + 49 : 78);
    const label = deviceLabelLayout(n, nodes, 1);
    const half = Math.max(width, label.maxWidth * label.scale) / 2;
    const ips = 'ips' in n.data && Array.isArray(n.data.ips) ? n.data.ips.length : 1;
    const lines = n.data.kind === 'ap' || n.data.kind === 'switch' ? 1 : 1 + Math.max(1, ips);
    const extra = Math.max(0, lines * 16 * label.scale - 37);
    return { left: n.position.x + width / 2 - half, right: n.position.x + width / 2 + half,
      top: n.position.y, bottom: n.position.y + height + extra };
  });
  if (!boxes.length) return null;
  const padding = 28, title = marking.name ? 24 : 0;
  const x = Math.min(...boxes.map(b => b.left)) - padding;
  const y = Math.min(...boxes.map(b => b.top)) - padding - title;
  return { x, y, width: Math.max(...boxes.map(b => b.right)) + padding - x,
    height: Math.max(...boxes.map(b => b.bottom)) + padding - y };
}

/** Retain the optional zoom argument for callers; it never changes geometry. */
export function markingBounds(marking: AreaMarking, nodes: readonly VisualNode[], _zoom = 1) {
  if (marking.geometry === 'free') return readMarkingRect(marking.bounds) ?? null;
  const base = automaticMarkingBounds(marking, nodes), offsets = readBaseOffsets(marking.baseOffsets);
  if (!base || !offsets) return base;
  // A changed member layout can make old insets cross; clamp the derived size,
  // preserving both the stored offsets and extension coordinates.
  return { x: base.x - offsets.left, y: base.y - offsets.top,
    width: Math.max(MIN_EXTENSION_SIZE, base.width + offsets.left + offsets.right),
    height: Math.max(MIN_EXTENSION_SIZE, base.height + offsets.top + offsets.bottom) };
}
