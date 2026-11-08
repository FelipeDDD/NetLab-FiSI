import { center, type Rect } from './geometry';

export interface DistanceGuide {
  axis: 'x' | 'y'; kind: 'symmetry' | 'spacing';
  segments: [number, number][]; at: number;
  pivot?: { value: number; from: number; to: number };
}
export interface DistanceCandidate { delta: number; reference: number; distance: number; measure: DistanceGuide; }

/** Small drag-time references, not a layout solver. Every proposal moves only
 * the dragged card. Pair selection is independent of physical cable lengths. */
export function distanceCandidates(rect: Rect, others: Rect[], axis: 'x' | 'y', tolerance: number): DistanceCandidate[] {
  const dimension = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x', breadth = axis === 'x' ? 'height' : 'width';
  const c = center(rect), candidates: DistanceCandidate[] = [];
  const aligned = (a: Rect, b: Rect) => [0, .5, 1].some(r => Math.abs(a[cross] + a[breadth] * r - b[cross] - b[breadth] * r) <= tolerance);
  const push = (target: number, reference: number, segments: [number, number][], references: Rect[], kind: DistanceGuide['kind'], pivot?: Rect) => {
    const delta = target - c[axis]; if (Math.abs(delta) > tolerance || segments.some(([a, b]) => b - a < 4)) return;
    candidates.push({ delta, reference, distance: Math.min(...references.map(r => Math.abs(center(r)[axis] - c[axis]))),
      measure: { axis, kind, segments, at: Math.min(rect[cross], ...references.map(r => r[cross])) - 14,
        ...(pivot ? { pivot: { value: center(pivot)[axis], from: Math.min(rect[cross], ...references.map(r => r[cross])) - 10, to: Math.max(rect[cross] + rect[breadth], ...references.map(r => r[cross] + r[breadth])) + 10 } } : {}) } });
  };
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
    const [a, b] = [others[i], others[j]].sort((a, b) => a[axis] - b[axis]), ac = center(a)[axis], bc = center(b)[axis];
    if (bc - ac < 4) continue;
    // Distant triangle references: the opposite outer card shares a row/column
    // with the dragged card; the middle device supplies the centre axis.
    if (aligned(a, rect) && c[axis] > bc) push(2 * bc - ac, i, [[ac, bc], [bc, 2 * bc - ac]], [a, b], 'symmetry', b);
    if (aligned(b, rect) && c[axis] < ac) push(2 * ac - bc, i, [[2 * ac - bc, ac], [ac, bc]], [a, b], 'symmetry', a);
    // Equal clear gaps use actual facing borders, including unequal card sizes.
    if (!aligned(a, b) || !aligned(a, rect) || !aligned(b, rect)) continue;
    const end = a[axis] + a[dimension], start = b[axis], gap = start - end;
    if (gap < 4) continue;
    // Only adjacent references in this row/column; don't measure through cards.
    if (others.some(r => r !== a && r !== b && aligned(r, a) && center(r)[axis] > ac && center(r)[axis] < bc)) continue;
    const half = rect[dimension] / 2;
    if (c[axis] > bc) push(b[axis] + b[dimension] + gap + half, i, [[end, start], [b[axis] + b[dimension], b[axis] + b[dimension] + gap]], [a, b], 'spacing');
    else if (c[axis] < ac) push(a[axis] - gap - half, i, [[a[axis] - gap, a[axis]], [end, start]], [a, b], 'spacing');
    else {
      const target = (end + start) / 2, free = (gap - rect[dimension]) / 2;
      if (free >= 4) push(target, i, [[end, target - half], [target + half, start]], [a, b], 'spacing');
    }
  }
  return candidates;
}

export const distanceLabel = (guide: DistanceGuide) => guide.segments.map(([a, b]) => `${Math.round((b - a) * 10) / 10} px`).join(' ↔ ');
