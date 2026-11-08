import type { PrintDocumentOptions } from './options';
import type { studioLayout } from './diagram';
import { center, measureText, type Point, type Rect } from './geometry';
import { documentRect } from './devicePositions';

/** One constrained vector for the existing card centres. No second device
 * transform, no individual clamps, snap, separation or block movement. */
export function moveStudioDiagram(layout: ReturnType<typeof studioLayout>, options: PrintDocumentOptions, desired: Point) {
  const rects: Rect[] = [...layout.documentCards, ...layout.areas.flatMap(a => [...a.rects, ...(options.diagram.areaTitles ? [{ x: a.title.x, y: a.title.y - a.textSize, width: measureText(a.name, a.textSize), height: a.textSize * 1.3 }] : [])].map(r => documentRect(r, layout)))];
  if (!rects.length) return { positions: options.devicePositions, areaOffset: options.areaOffset, delta: { x: 0, y: 0 } };
  const area = layout.page.area, delta = { x: 0, y: 0 };
  for (const [axis, dimension] of [['x', 'width'], ['y', 'height']] as const) {
    const min = Math.min(...rects.map(r => r[axis])), max = Math.max(...rects.map(r => r[axis] + r[dimension]));
    // Refuse a clipped/oversized group instead of silently repairing its layout.
    if (min < area[axis] - .01 || max > area[axis] + area[dimension] + .01) continue;
    delta[axis] = Math.max(area[axis] - min, Math.min(area[axis] + area[dimension] - max, desired[axis]));
  }
  const positions = { ...options.devicePositions, ...Object.fromEntries(layout.documentCards.map((r, i) => [layout.boxes[i].device.id, { x: center(r).x + delta.x, y: center(r).y + delta.y }])) };
  const previous = options.areaOffset ?? { x: 0, y: 0 };
  const areaOffset = layout.areas.length ? { x: previous.x + delta.x, y: previous.y + delta.y } : options.areaOffset;
  return { positions, areaOffset, delta };
}
