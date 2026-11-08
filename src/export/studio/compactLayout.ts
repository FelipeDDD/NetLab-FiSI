import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import type { PrintDocumentOptions } from './options';
import { positionStudioDevices, type studioLayout } from './diagram';
import { documentRect, manualDevicePosition } from './devicePositions';
import { cablePath, center, crossesCard, overlaps, pathLength, type Point, type Rect } from './geometry';

type Layout = ReturnType<typeof studioLayout>;
const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x - .01 && inner.y >= outer.y - .01 && inner.x + inner.width <= outer.x + outer.width + .01 && inner.y + inner.height <= outer.y + outer.height + .01;
const cableHits = (points: Point[], rect: Rect) => points.slice(1).some((p, i) => crossesCard(points[i], p, rect));

/** One bounded pass of connected-neighbour attraction, in physical document
 * coordinates. No re-fit, ranks, force simulation, or writes to source nodes.
 * Every trial is checked against the complete rendered cable/label geometry. */
export function compactStudioLayout(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, original: Layout) {
  let scene = original, positions = { ...options.compactOffsets };
  const ids = original.boxes.map(b => b.device.id), index = new Map(ids.map((id, i) => [id, i]));
  const gap = Math.max(12, original.font * original.scale * 1.1), moved: string[] = [];
  const memberships = original.documentCards.map(rect => original.areas.map(area => area.rects.map(r => documentRect(r, original))).filter(rects => rects.some(r => contains(r, rect))));
  const cableLength = (s: Layout) => s.documentCables.reduce((sum, points) => sum + pathLength(points), 0);
  const connectedDistance = (s: Layout) => snapshot.links.reduce((sum, link) => {
    const a = index.get(link.a[0]), b = index.get(link.b[0]); if (a === undefined || b === undefined) return sum;
    const ac = center(s.documentCards[a]), bc = center(s.documentCards[b]); return sum + Math.hypot(ac.x - bc.x, ac.y - bc.y);
  }, 0);
  const hiddenObstructions = (s: Layout) => new Set(snapshot.links.filter(link => {
    const a = index.get(link.a[0]), b = index.get(link.b[0]);
    return a !== undefined && b !== undefined && cablePath(s.boxes[a], s.boxes[b], s.boxes).obstructed;
  }).map(link => link.id));
  const safe = (trial: Layout, i: number) => {
    const rect = trial.documentCards[i], before = scene.documentCards[i];
    if (!contains(trial.page.area, rect) || memberships[i].some(rects => !rects.some(r => contains(r, rect)))) return false;
    for (let j = 0; j < ids.length; j++) {
      if (j === i) continue;
      const other = trial.documentCards[j];
      const clearance = (a: Rect, b: Rect) => Math.max(b.x - a.x - a.width, a.x - b.x - b.width, b.y - a.y - a.height, a.y - b.y - b.height);
      if (clearance(rect, other) < Math.min(gap, clearance(before, scene.documentCards[j])) - .01) return false;
      if (overlaps(rect, other, gap) && !overlaps(before, scene.documentCards[j], gap)) return false;
      if (overlaps(rect, other) && !overlaps(before, scene.documentCards[j])) return false;
      for (const axis of ['x', 'y'] as const) {
        const delta = center(original.documentCards[i])[axis] - center(original.documentCards[j])[axis];
        if (Math.abs(delta) > 1 && (center(rect)[axis] - center(other)[axis]) * Math.sign(delta) < Math.min(1, Math.abs(delta))) return false;
      }
    }
    if (trial.blocks.some((block, j) => overlaps(rect, block, gap) && !overlaps(before, scene.blocks[j], gap))) return false;
    for (let j = 0; j < trial.cables.length; j++) {
      const cable = trial.cables[j], old = scene.cables[j];
      if (cable.obstructed && !old.obstructed || cable.crowded && !old.crowded) return false;
      if (trial.blocks.some((block, k) => cableHits(trial.documentCables[j], block) && !cableHits(scene.documentCables[j], scene.blocks[k]))) return false;
    }
    if (trial.documentLabels.some((label, j) => trial.blocks.some((block, k) => overlaps(label, block, 3) && !overlaps(scene.documentLabels[j], scene.blocks[k], 3)))) return false;
    if (trial.documentLabels.some((label, j) => trial.documentCards.some((card, k) => overlaps(label, card, 3) && !overlaps(scene.documentLabels[j], scene.documentCards[k], 3)) || trial.documentLabels.some((other, k) => k > j && overlaps(label, other, 3) && !overlaps(scene.documentLabels[j], scene.documentLabels[k], 3)))) return false;
    if (!options.diagram.cables) { const previous = hiddenObstructions(scene); if ([...hiddenObstructions(trial)].some(id => !previous.has(id))) return false; }
    return connectedDistance(trial) < connectedDistance(scene) - .5 && cableLength(trial) <= cableLength(scene) + .01;
  };
  // Proposals use the original geometry so results do not depend on a solver
  // converging. Stable ID order also makes repeated snapshots deterministic.
  for (const id of [...ids].sort()) {
    if (manualDevicePosition(options.devicePositions, id)) continue;
    const i = index.get(id)!, rect = original.documentCards[i], start = center(rect);
    const neighbours = snapshot.links.flatMap(link => link.a[0] === id ? [link.b[0]] : link.b[0] === id ? [link.a[0]] : []).filter(peer => index.has(peer));
    let dx = 0, dy = 0;
    for (const peer of new Set(neighbours)) {
      const other = original.documentCards[index.get(peer)!], end = center(other), x = end.x - start.x, y = end.y - start.y;
      const k = Math.max(0, 1 - Math.min(x ? (rect.width + other.width) / 2 / Math.abs(x) : Infinity, y ? (rect.height + other.height) / 2 / Math.abs(y) : Infinity));
      const free = Math.hypot(x, y) * k;
      if (free <= gap * 2) continue;
      const amount = Math.min(32, (free - gap * 2) * .1), length = Math.hypot(x, y);
      dx += x / length * amount; dy += y / length * amount;
    }
    const count = new Set(neighbours).size || 1; dx /= count; dy /= count;
    // A card sharing a center-axis keeps that row/column. Other members can
    // still close vertical/horizontal gaps without shearing a whole tier.
    if (neighbours.some(peer => Math.abs(center(original.documentCards[index.get(peer)!]).x - start.x) <= 1)) dx = 0;
    if (neighbours.some(peer => Math.abs(center(original.documentCards[index.get(peer)!]).y - start.y) <= 1)) dy = 0;
    if (Math.hypot(dx, dy) < 1) continue;
    for (const fraction of [1, .5, .25]) {
      const base = center(documentRect(original.automatic.boxes[i], original));
      const candidate = { ...positions, [id]: { x: (start.x + dx * fraction - base.x) / original.scale, y: (start.y + dy * fraction - base.y) / original.scale } };
      const trial = positionStudioDevices(original.automatic, snapshot, { ...options, compactOffsets: candidate }, language);
      if (!safe(trial, i)) continue;
      positions = candidate; scene = trial; moved.push(id); break;
    }
  }
  return { positions, moved };
}
