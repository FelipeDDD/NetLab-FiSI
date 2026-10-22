export type CableStyle = 'straight' | 'hybrid';
export type Point = { x: number; y: number };
export type CableBox = Point & { width: number; height: number };
export const HYBRID_STEM = 50;
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const center = (b: CableBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
function exit(box: CableBox, target: Point) {
  const c = center(box), dx = target.x - c.x, dy = target.y - c.y;
  if (!dx && !dy) return c;
  const scale = Math.min(box.width / 2 / Math.abs(dx || 1e-9), box.height / 2 / Math.abs(dy || 1e-9));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}
function normal(box: CableBox, p: Point) {
  const c = center(box), rx = (p.x - c.x) / (box.width / 2), ry = (p.y - c.y) / (box.height / 2);
  return { direction: Math.abs(rx) > Math.abs(ry) ? { x: Math.sign(rx), y: 0 } : { x: 0, y: Math.sign(ry) },
    // Fade toward Straight near corners instead of snapping between face normals.
    strength: Math.min(1, Math.abs(Math.abs(rx) - Math.abs(ry)) * 8) };
}
const move = (p: Point, n: Point, d: number) => ({ x: p.x + n.x * d, y: p.y + n.y * d });

export function cableGeometry(a: CableBox, b: CableBox, style: CableStyle, stemLength = HYBRID_STEM) {
  const start = exit(a, center(b)), end = exit(b, center(a)), gap = distance(start, end);
  const straight = () => ({ path: `M ${start.x},${start.y}L ${end.x},${end.y}`, length: gap, curved: false,
    pointAt: (progress: number) => lerp(start, end, Math.max(0, Math.min(1, progress))) });
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  if (style === 'straight' || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0 || overlap || gap < 8 || start.x === end.x || start.y === end.y) return straight();
  const na = normal(a, start), nb = normal(b, end);
  const stem = Math.min(Math.max(0, stemLength), gap * 0.22,
    na.direction.x || nb.direction.x ? Math.abs(end.x - start.x) / 4 : Infinity,
    na.direction.y || nb.direction.y ? Math.abs(end.y - start.y) / 4 : Infinity) * Math.min(na.strength, nb.strength);
  if (stem < 0.1) return straight();
  const p = move(start, na.direction, stem), q = move(end, nb.direction, stem);
  const c1 = move(p, na.direction, stem), c2 = move(q, nb.direction, stem);
  const cubic = (t: number) => {
    const u = 1 - t;
    return { x: u ** 3 * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * q.x,
      y: u ** 3 * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * q.y };
  };
  // Arc-length lookup is built once per geometry, never via SVG DOM per frame.
  const lengths = [0]; let previous = p;
  for (let i = 1; i <= 128; i++) { const next = cubic(i / 128); lengths.push(lengths[i - 1] + distance(previous, next)); previous = next; }
  const first = distance(start, p), last = distance(q, end), curve = lengths[128], length = first + curve + last;
  return { path: `M ${start.x},${start.y}L ${p.x},${p.y}C ${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}L ${end.x},${end.y}`, length, curved: true,
    pointAt(progress: number): Point {
      const d = Math.max(0, Math.min(1, progress)) * length;
      if (d <= first) return lerp(start, p, first ? d / first : 0);
      if (d >= first + curve) return lerp(q, end, last ? (d - first - curve) / last : 1);
      const target = d - first; let lo = 1, hi = 128;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < target) lo = mid + 1; else hi = mid; }
      return cubic((lo - 1 + (target - lengths[lo - 1]) / (lengths[lo] - lengths[lo - 1] || 1)) / 128);
    } };
}

export function loadCableStyle(): CableStyle {
  try { return localStorage.getItem('netlab-cable-style') === 'hybrid' ? 'hybrid' : 'straight'; } catch { return 'straight'; }
}
