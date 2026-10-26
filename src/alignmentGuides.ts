import type { Point } from './topologyHistory';
import type { DeviceKind } from './engine/device';
import { cableAttachmentBox, DEVICE_ARTWORK, hasDeviceArtwork } from './deviceArtwork';

export const ALIGNMENT_TOLERANCE_PX = 8;
export interface AlignmentNode {
  id: string; position: Point; measured?: { width?: number; height?: number };
  width?: number; height?: number; hidden?: boolean; parentId?: string;
  data?: { kind: DeviceKind };
}
export interface AlignmentPosition { id: string; position: Point }
export interface AlignmentPair { movingId: string; targetId: string }
export interface AlignmentLocks { x?: AlignmentPair; y?: AlignmentPair }
export interface AlignmentGuide extends AlignmentPair { axis: 'horizontal' | 'vertical'; from: Point; to: Point }
export interface AlignmentResult { offset: Point; guides: AlignmentGuide[]; locks: AlignmentLocks }

function center(node: AlignmentNode, position = node.position): Point | null {
  const width = node.measured?.width ?? node.width, height = node.measured?.height ?? node.height;
  // Do not guess dimensions before React Flow has measured the node.
  // The current canvas uses flat, top-left-origin nodes.
  if (node.hidden || node.parentId || width === undefined || height === undefined || width <= 0 || height <= 0
    || ![width, height, position.x, position.y].every(Number.isFinite)) return null;
  return { x: position.x + width / 2, y: position.y + height / 2 };
}

// The PC's lower chassis/monitor band and the server's lower front panel match
// their current side cable entries. Artwork-relative values avoid label height.
const OPTICAL_ARTWORK_Y = { host: 0.75, server: 0.665 } as const;

export function getVisualAlignmentPoint(node: AlignmentNode, position = node.position): Point | null {
  const point = center(node, position), kind = node.data?.kind;
  // Switch sockets depend on each link. Keep its existing center-based snapping.
  if (!point || !kind || kind === 'switch' || !hasDeviceArtwork(kind)) return point;
  if (kind === 'host' || kind === 'server') {
    return { x: point.x, y: position.y + 6 + DEVICE_ARTWORK[kind].height * OPTICAL_ARTWORK_Y[kind] };
  }
  // Reuse the established chassis anchors, without changing cable geometry.
  const box = cableAttachmentBox({ ...position, width: node.measured?.width ?? node.width!, height: node.measured?.height ?? node.height! }, kind);
  return { x: point.x, y: box.y + box.height / 2 };
}

// Optical horizontal alignment; vertical alignment still uses geometric centers.
// A shared offset keeps multi-selection geometry intact.
// All inputs are world coordinates; the acquisition/release radius is visual px.
export function alignNodeAnchors(nodes: readonly AlignmentNode[], positions: readonly AlignmentPosition[], zoom: number,
  previous: AlignmentLocks = {}, movingIds: ReadonlySet<string> = new Set(positions.map(p => p.id))): AlignmentResult {
  const result: AlignmentResult = { offset: { x: 0, y: 0 }, guides: [], locks: {} };
  if (!Number.isFinite(zoom) || zoom <= 0) return result;
  const proposed = new Map(positions.map(p => [p.id, p.position]));
  const moving: { id: string; point: Point; center: Point }[] = [], targets: typeof moving = [];
  for (const node of nodes) {
    if (movingIds.has(node.id)) {
      const position = proposed.get(node.id), point = position && getVisualAlignmentPoint(node, position);
      if (point) moving.push({ id: node.id, point, center: center(node, position)! });
    } else {
      const point = getVisualAlignmentPoint(node); if (point) targets.push({ id: node.id, point, center: center(node)! });
    }
  }
  const tolerance = ALIGNMENT_TOLERANCE_PX / zoom;
  type Match = { pair: AlignmentPair; moving: Point; target: Point; delta: number; gap: number };
  const match = (axis: 'x' | 'y'): Match | null => {
    let best: Match | null = null;
    for (const a of moving) for (const b of targets) {
      const from = axis === 'x' ? a.center : a.point, to = axis === 'x' ? b.center : b.point;
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) > tolerance) continue;
      const candidate = { pair: { movingId: a.id, targetId: b.id }, moving: from, target: to, delta,
        gap: Math.hypot(to.x - from.x, to.y - from.y) };
      // Keep the current target while it is within 8 px. No larger sticky zone.
      if (previous[axis]?.movingId === a.id && previous[axis]?.targetId === b.id) return candidate;
      const distance = Math.abs(delta), bestDistance = best ? Math.abs(best.delta) : Infinity;
      if (!best || distance < bestDistance || (distance === bestDistance && (candidate.gap < best.gap
        || (candidate.gap === best.gap && (b.id.localeCompare(best.pair.targetId, 'en', { numeric: true })
          || a.id.localeCompare(best.pair.movingId, 'en', { numeric: true })) < 0)))) best = candidate;
    }
    return best;
  };
  const x = match('x'), y = match('y');
  if (x) { result.offset.x = x.delta; result.locks.x = x.pair; }
  if (y) { result.offset.y = y.delta; result.locks.y = y.pair; }
  if (y) result.guides.push({ ...y.pair, axis: 'horizontal', from: { x: y.moving.x + result.offset.x, y: y.target.y }, to: { ...y.target } });
  if (x) result.guides.push({ ...x.pair, axis: 'vertical', from: { x: x.target.x, y: x.moving.y + result.offset.y }, to: { ...x.target } });
  return result;
}
