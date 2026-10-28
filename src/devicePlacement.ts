import type { DeviceKind } from './engine/device';
import { DEVICE_ARTWORK, hasDeviceArtwork, type VisualNode } from './deviceArtwork';
import type { Point } from './topologyHistory';

export interface PlacementBox extends Point { width: number; height: number }
export const DEVICE_GAP = 32;
export function deviceSize(kind: DeviceKind) {
  const a = hasDeviceArtwork(kind) ? DEVICE_ARTWORK[kind] : null;
  return { width: a ? Math.max(140, a.width + 20) : 140, height: a ? a.height + 65 : 125 };
}
export function placementBox(n: VisualNode): PlacementBox {
  const size = deviceSize(n.data.kind);
  return { ...n.position, width: Math.max(size.width, n.measured?.width ?? 0), height: Math.max(size.height, n.measured?.height ?? 0) };
}
export const boxesOverlap = (a: PlacementBox, b: PlacementBox, gap = DEVICE_GAP) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
export function groupBounds(boxes: PlacementBox[]): PlacementBox {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}
/** Translation only: never change distances inside a group or move existing nodes. */
export function freePosition(group: PlacementBox[], occupied: PlacementBox[], desired: Point, visible?: PlacementBox): Point {
  const bounds = groupBounds(group), stepX = bounds.width + DEVICE_GAP, stepY = bounds.height + DEVICE_GAP;
  const origin = { ...desired };
  if (visible && bounds.width <= visible.width && bounds.height <= visible.height) {
    origin.x = Math.max(visible.x, Math.min(origin.x, visible.x + visible.width - bounds.width));
    origin.y = Math.max(visible.y, Math.min(origin.y, visible.y + visible.height - bounds.height));
  }
  const candidates: Point[] = [];
  for (let r = 0; r <= 24; r++) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) === r) candidates.push({ x: origin.x + x * stepX, y: origin.y + y * stepY });
    }
  }
  const inside = (p: Point) => !!visible && p.x >= visible.x && p.y >= visible.y && p.x + bounds.width <= visible.x + visible.width && p.y + bounds.height <= visible.y + visible.height;
  candidates.sort((a, b) => Number(inside(b)) - Number(inside(a)) || (a.x-origin.x)**2+(a.y-origin.y)**2-((b.x-origin.x)**2+(b.y-origin.y)**2) || a.y-b.y || a.x-b.x);
  const available = (p: Point) => group.every(b => !occupied.some(o => boxesOverlap({ ...b, x: p.x + b.x - bounds.x, y: p.y + b.y - bounds.y }, o)));
  const found = candidates.find(available);
  // A dense canvas still gets a free location, beyond its occupied lower edge.
  return found ?? { x: desired.x, y: Math.max(desired.y, ...occupied.map(b => b.y + b.height + DEVICE_GAP)) };
}
export function insertionPosition(kind: DeviceKind, nodes: VisualNode[], referenceId: string | null, visible: PlacementBox): Point {
  const size = deviceSize(kind), reference = nodes.find(n => n.id === referenceId);
  const box = reference && placementBox(reference);
  const desired = box ? { x: box.x + box.width + DEVICE_GAP, y: box.y }
    : { x: visible.x + (visible.width-size.width)/2, y: visible.y + (visible.height-size.height)/2 };
  if (box && desired.x + size.width > visible.x + visible.width) { desired.x = visible.x; desired.y = box.y + box.height + DEVICE_GAP; }
  return freePosition([{ x: 0, y: 0, ...size }], nodes.map(placementBox), desired, visible);
}
export function canvasWorldBounds(rect: { left: number; top: number; right: number; bottom: number }, convert: (p: Point) => Point): PlacementBox {
  const a = convert({ x: rect.left + 16, y: rect.top + 16 }), b = convert({ x: rect.right - 16, y: rect.bottom - 16 });
  return { ...a, width: Math.max(1, b.x-a.x), height: Math.max(1, b.y-a.y) };
}
