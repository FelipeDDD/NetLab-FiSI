import { distanceLabel, type DistanceGuide } from './distanceGuides';
import type { Rect } from './geometry';
export type { DistanceGuide };

/** Preview-only overlay, appended by the drag hook and cleared on release,
 * cancellation and before print. Values stay in document pixels. */
export function drawDistanceGuides(layer: SVGGElement, guides: DistanceGuide[], area: Rect, k: number) {
  const doc = layer.ownerDocument;
  const element = (tag: 'line' | 'rect' | 'text', attributes: Record<string, string | number>) => {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    layer.appendChild(node); return node;
  };
  const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => element('line', { x1, y1, x2, y2, stroke: '#7c3aed', 'stroke-width': 1 / k, ...(dashed ? { 'stroke-dasharray': `${4 / k} ${3 / k}` } : {}) });
  for (const guide of guides) {
    const horizontal = guide.axis === 'x', at = Math.max(area[horizontal ? 'y' : 'x'] + 22 / k, guide.at);
    for (const [from, to] of guide.segments) {
      if (horizontal) { line(from, at, to, at); for (const x of [from, to]) line(x, at - 4 / k, x, at + 4 / k); }
      else { line(at, from, at, to); for (const y of [from, to]) line(at - 4 / k, y, at + 4 / k, y); }
    }
    if (guide.pivot) {
      const { value, from, to } = guide.pivot;
      if (horizontal) line(value, Math.max(area.y, from), value, Math.min(area.y + area.height, to), true);
      else line(Math.max(area.x, from), value, Math.min(area.x + area.width, to), value, true);
    }
    const label = distanceLabel(guide), width = (label.length * 6.2 + 12) / k, mid = (guide.segments[0][0] + guide.segments.at(-1)![1]) / 2;
    const x = Math.max(area.x + width / 2, Math.min(area.x + area.width - width / 2, horizontal ? mid : at + width / 2 + 6 / k));
    const y = Math.max(area.y + 14 / k, Math.min(area.y + area.height - 6 / k, horizontal ? at - 7 / k : mid));
    element('rect', { x: x - width / 2, y: y - 12 / k, width, height: 17 / k, rx: 3 / k, fill: '#fff', 'fill-opacity': .94 });
    const text = element('text', { x, y, 'text-anchor': 'middle', 'font-size': 12 / k, 'font-family': 'Arial, sans-serif', fill: '#6d28d9', 'data-distance-guide': guide.kind, 'data-distance-axis': guide.axis });
    text.textContent = label;
  }
}
