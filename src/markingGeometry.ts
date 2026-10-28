export interface AreaRect { x: number; y: number; width: number; height: number }
export interface MarkingExtension extends AreaRect { id: string }
export interface AreaPoint { x: number; y: number }
export const MIN_EXTENSION_SIZE = 12;
export function validAreaRect(r: AreaRect): boolean {
  return [r.x, r.y, r.width, r.height, r.x + r.width, r.y + r.height].every(Number.isFinite)
    && r.width >= MIN_EXTENSION_SIZE && r.height >= MIN_EXTENSION_SIZE;
}
export function readExtensions(value: unknown): MarkingExtension[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(r => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || seen.has(r.id) || !validAreaRect(r)) return [];
    seen.add(r.id); return [{ id: r.id, x: r.x, y: r.y, width: r.width, height: r.height }];
  });
}
export const containsPoint = (r: AreaRect, p: AreaPoint) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
/** Edge contact counts; corner-only contact cannot form a usable continuous area. */
export function touchesArea(r: AreaRect, other: AreaRect): boolean {
  const x = Math.min(r.x + r.width, other.x + other.width) - Math.max(r.x, other.x);
  const y = Math.min(r.y + r.height, other.y + other.height) - Math.max(r.y, other.y);
  return x >= 0 && y >= 0 && (x > 0 || y > 0);
}
export function rectangleBetween(a: AreaPoint, b: AreaPoint): AreaRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Coordinate compression + exposed cell edges. Only exterior boundaries survive;
 * one even-odd SVG path fills all loops once (including holes/disjoint islands).
 * Complexity depends on rectangle count, never on canvas size or zoom. */
export function unionLoops(rectangles: readonly AreaRect[]): AreaPoint[][] {
  if (!rectangles.length) return [];
  const xs = [...new Set(rectangles.flatMap(r => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  const ys = [...new Set(rectangles.flatMap(r => [r.y, r.y + r.height]))].sort((a, b) => a - b);
  const cells = Array.from({ length: ys.length - 1 }, () => Array(xs.length - 1).fill(false) as boolean[]);
  for (const r of rectangles) {
    const left = xs.indexOf(r.x), right = xs.indexOf(r.x + r.width), top = ys.indexOf(r.y), bottom = ys.indexOf(r.y + r.height);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) cells[y][x] = true;
  }
  type Edge = { a: AreaPoint; b: AreaPoint; direction: number };
  const edges: Edge[] = [], key = (p: AreaPoint) => `${p.x},${p.y}`;
  const add = (x1: number, y1: number, x2: number, y2: number, direction: number) => edges.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, direction });
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) if (cells[y][x]) {
    if (!cells[y - 1]?.[x]) add(xs[x], ys[y], xs[x + 1], ys[y], 0);
    if (!cells[y]?.[x + 1]) add(xs[x + 1], ys[y], xs[x + 1], ys[y + 1], 1);
    if (!cells[y + 1]?.[x]) add(xs[x + 1], ys[y + 1], xs[x], ys[y + 1], 2);
    if (!cells[y]?.[x - 1]) add(xs[x], ys[y + 1], xs[x], ys[y], 3);
  }
  const outgoing = new Map<string, number[]>(), unused = new Set(edges.map((_, i) => i));
  edges.forEach((edge, i) => outgoing.set(key(edge.a), [...outgoing.get(key(edge.a)) ?? [], i]));
  const loops: AreaPoint[][] = [];
  while (unused.size) {
    let index = unused.values().next().value!;
    const start = key(edges[index].a), points: AreaPoint[] = [];
    while (unused.has(index)) {
      const edge = edges[index]; unused.delete(index); points.push(edge.a);
      if (key(edge.b) === start) break;
      const candidates = (outgoing.get(key(edge.b)) ?? []).filter(i => unused.has(i));
      // Prefer right, straight, left at corner-only junctions to keep islands separate.
      const rank = (i: number) => [1, 0, 3, 2].indexOf((edges[i].direction - edge.direction + 4) % 4);
      candidates.sort((a, b) => rank(a) - rank(b));
      if (!candidates.length) break;
      index = candidates[0];
    }
    const corners = points.filter((p, i) => {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
      return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x);
    });
    if (corners.length >= 4) loops.push(corners);
  }
  return loops;
}

export function unionPath(rectangles: readonly AreaRect[], radius = 8): string {
  return unionLoops(rectangles).map(points => points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    const before = Math.hypot(p.x - a.x, p.y - a.y), after = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, before / 2, after / 2);
    const entry = { x: p.x + (a.x - p.x) * r / before, y: p.y + (a.y - p.y) * r / before };
    const exit = { x: p.x + (b.x - p.x) * r / after, y: p.y + (b.y - p.y) * r / after };
    return `${i ? 'L' : 'M'}${entry.x},${entry.y}Q${p.x},${p.y} ${exit.x},${exit.y}`;
  }).join('') + 'Z').join('');
}
