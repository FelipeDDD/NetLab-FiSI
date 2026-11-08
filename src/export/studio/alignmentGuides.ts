import { center, overlaps, type Point, type Rect } from './geometry';
import { clampDeviceCenter } from './devicePositions';
import { distanceCandidates, type DistanceGuide } from './distanceGuides';

export interface AlignmentGuide { axis: 'x' | 'y'; value: number; from: number; to: number; reference: number; edge: 'start' | 'center' | 'end'; }
/** Tolerance is passed in document units after conversion from screen pixels.
 * Edges/centres and small equal-distance proposals participate; references never move. */
export function alignDeviceCenter(position: Point, size: Pick<Rect, 'width' | 'height'>, others: Rect[], area: Rect, tolerance: number, obstacles: Rect[] = [], previous: Partial<Point> = {}): { position: Point; guides: AlignmentGuide[]; distances: DistanceGuide[]; snapped: Partial<Point> } {
  const raw = clampDeviceCenter(position, size, area), rect = { x: raw.x - size.width / 2, y: raw.y - size.height / 2, width: size.width, height: size.height };
  const candidates = (axis: 'x' | 'y') => {
    const dimension = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x';
    const edges = others.flatMap((other, reference) => ([0, .5, 1] as const).flatMap((ratio, k) => {
      const value = other[axis] + other[dimension] * ratio, delta = value - rect[axis] - rect[dimension] * ratio;
      return Math.abs(delta) <= tolerance ? [{ axis, value, delta, reference, edge: (['start', 'center', 'end'] as const)[k], distance: Math.abs(center(other)[cross] - raw[cross]) }] : [];
    }));
    const distances = distanceCandidates(rect, others, axis, tolerance).map(candidate => ({ ...candidate, axis, value: raw[axis] + candidate.delta, edge: 'center' as const }));
    const all: (typeof edges[number] & { measure?: DistanceGuide })[] = [...edges, ...distances];
    return all.sort((a, b) => Number(Math.abs(raw[axis] + b.delta - (previous[axis] ?? Infinity)) < .01) - Number(Math.abs(raw[axis] + a.delta - (previous[axis] ?? Infinity)) < .01) || Math.abs(a.delta) - Math.abs(b.delta) || Number(!!b.measure) - Number(!!a.measure) || Number(b.measure?.kind === 'spacing') - Number(a.measure?.kind === 'spacing') || a.distance - b.distance || Number(b.edge === 'center') - Number(a.edge === 'center') || a.reference - b.reference);
  };
  const xs = candidates('x'), ys = candidates('y');
  // Try the nearest pair, then each axis independently. No attraction beyond
  // the screen tolerance and no snap that creates an overlap or margin clamp.
  for (const pair of [[xs[0], ys[0]], [xs[0], undefined], [undefined, ys[0]]]) {
    const [x, y] = pair; if (!x && !y) continue;
    const chosen = { x: raw.x + (x?.delta ?? 0), y: raw.y + (y?.delta ?? 0) }, clamped = clampDeviceCenter(chosen, size, area);
    if (Math.abs(clamped.x - chosen.x) > .001 || Math.abs(clamped.y - chosen.y) > .001) continue;
    const next = { ...rect, x: chosen.x - size.width / 2, y: chosen.y - size.height / 2 };
    if ([...others, ...obstacles].some(other => overlaps(next, other, 3))) continue;
    const guides = pair.flatMap(match => {
      if (!match || match.measure) return [];
      const other = others[match.reference], cross = match.axis === 'x' ? 'y' : 'x', dimension = match.axis === 'x' ? 'height' : 'width';
      return [{ axis: match.axis, value: match.value, from: Math.max(area[cross], Math.min(next[cross], other[cross]) - 10), to: Math.min(area[cross] + area[dimension], Math.max(next[cross] + next[dimension], other[cross] + other[dimension]) + 10), reference: match.reference, edge: match.edge }];
    });
    const distances = pair.flatMap(match => match?.measure ? [match.measure] : []).slice(0, 1);
    return { position: chosen, guides, distances, snapped: { ...(x ? { x: chosen.x } : {}), ...(y ? { y: chosen.y } : {}) } };
  }
  return { position: raw, guides: [], distances: [], snapped: {} };
}
