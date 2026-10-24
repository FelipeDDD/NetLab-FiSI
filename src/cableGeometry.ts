export type CableStyle = 'straight' | 'hybrid';
export type Point = { x: number; y: number };
export type CableBox = Point & { width: number; height: number; front?: { x: number; y: number }; visibleTip?: number; rearBelow?: number };
export const HYBRID_STEM = 50;
// Development-only comparison, never persisted or exposed in Settings.
// Reload app.html?cableStem=20 (or 10 / 0); no query keeps the baseline.
export function readExperimentalStem(search: string): number | undefined {
  const value = new URLSearchParams(search).get('cableStem');
  return value === '20' || value === '10' || value === '0' ? Number(value) : undefined;
}
const EXPERIMENTAL_STEM = import.meta.env.DEV && typeof window !== 'undefined'
  ? readExperimentalStem(window.location.search) : undefined;
// Separate diagnostic: reduce both axial stems and Bezier handles, not RJ45 geometry.
const EXPERIMENTAL_TANGENT = import.meta.env.DEV && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('cableTangent') === 'soft' ? 0.25 : 1;
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

function bodyGeometry(a: CableBox, b: CableBox, style: CableStyle, stemLength = HYBRID_STEM, rigidCap?: number, tangentInfluence = 1) {
  const start = exit(a, center(b)), end = exit(b, center(a)), gap = distance(start, end);
  const straight = () => ({ path: `M ${start.x},${start.y}L ${end.x},${end.y}`, length: gap, curved: false,
    pointAt: (progress: number) => lerp(start, end, Math.max(0, Math.min(1, progress))) });
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  if (style === 'straight' || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0 || overlap || gap < 8 || start.x === end.x || start.y === end.y) return straight();
  const na = normal(a, start), nb = normal(b, end);
  const control = Math.min(Math.max(0, stemLength), gap * 0.22,
    na.direction.x || nb.direction.x ? Math.abs(end.x - start.x) / 4 : Infinity,
    na.direction.y || nb.direction.y ? Math.abs(end.y - start.y) / 4 : Infinity) * Math.min(na.strength, nb.strength) * tangentInfluence;
  if (control < 0.1) return straight();
  // Isolate the rigid length from the curve handles, including the 0px case.
  const stem = rigidCap === undefined ? control : Math.min(control, Math.max(0, rigidCap) * Math.min(na.strength, nb.strength));
  const p = move(start, na.direction, stem), q = move(end, nb.direction, stem);
  const c1 = move(p, na.direction, control), c2 = move(q, nb.direction, control);
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

// A short front approach is part of the same measured path used by packets.
// Only its overlay is repainted over the equipment's PNG.
export function cableGeometry(a: CableBox, b: CableBox, style: CableStyle, stemLength = HYBRID_STEM, rigidCap = EXPERIMENTAL_STEM, tangentInfluence = EXPERIMENTAL_TANGENT) {
  const shifted = (box: CableBox) => box.front ? { ...box, x: box.x + box.front.x, y: box.y + box.front.y }
    : box.rearBelow ? { ...box, y: box.y + box.rearBelow } : box;
  const body = bodyGeometry(shifted(a), shifted(b), style, stemLength, rigidCap, tangentInfluence);
  const front = (box: CableBox, end: boolean) => {
    if (box.rearBelow) {
      // Rear arrivals emerge below the chassis and rise into the chosen socket.
      // The main route stays occluded; this leg alone is painted over the face.
      const port = center(box), join = body.pointAt(end ? 1 : 0);
      return { length: distance(port, join), path: `M ${port.x},${port.y}L ${join.x},${join.y}`,
        reverse: `L ${port.x},${port.y}`, pointAt: (t: number) => lerp(port, join, Math.max(0, Math.min(1, t))) };
    }
    if (!box.front) return undefined;
    const port = center(box), stem = { x: port.x, y: port.y + 10 };
    const join = body.pointAt(end ? 1 : 0), next = body.pointAt(end ? 0.999 : 0.001);
    const d = distance(join, next) || 1;
    const c1 = { x: stem.x, y: stem.y + 8 };
    const c2 = { x: join.x - (next.x - join.x) / d * 8, y: join.y - (next.y - join.y) / d * 8 };
    const points = [port, stem];
    for (let i = 1; i <= 64; i++) {
      const t = i / 64, u = 1 - t;
      points.push({ x: u ** 3 * stem.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * join.x,
        y: u ** 3 * stem.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * join.y });
    }
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    const length = lengths[lengths.length - 1];
    const xy = (p: Point) => `${p.x},${p.y}`;
    return { length, path: `M ${xy(port)}L ${xy(stem)}C ${xy(c1)} ${xy(c2)} ${xy(join)}`,
      reverse: `C ${xy(c2)} ${xy(c1)} ${xy(stem)}L ${xy(port)}`,
      pointAt(t: number) {
        const target = Math.max(0, Math.min(1, t)) * length;
        let i = 1; while (i < lengths.length - 1 && lengths[i] < target) i++;
        return lerp(points[i - 1], points[i], (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1));
      } };
  };
  const start = front(a, false), end = front(b, true);
  const first = start?.length ?? 0, last = end?.length ?? 0;
  const length = first + body.length + last;
  // Reveal only the last few pixels of an otherwise occluded rear approach.
  // Sampling the existing path leaves routing, travel distance and timing intact.
  const tip = (box: CableBox, end: boolean) => {
    if (!box.visibleTip || !body.length) return undefined;
    const fraction = Math.min(box.visibleTip, body.length) / body.length;
    return Array.from({ length: 9 }, (_, i) => {
      const t = fraction * i / 8;
      const p = body.pointAt(end ? 1 - t : t);
      return `${i ? 'L' : 'M'} ${p.x},${p.y}`;
    }).join('');
  };
  return {
    path: (start ? start.path + body.path.replace(/^M/, 'L') : body.path) + (end?.reverse ?? ''),
    length, curved: body.curved || !!start || !!end,
    frontStart: start?.path ?? tip(a, false), frontEnd: end?.path ?? tip(b, true),
    isFrontAt: (t: number) => ((!!start || !!a.visibleTip) && t * length <= (start ? first : a.visibleTip!))
      || ((!!end || !!b.visibleTip) && t * length >= length - (end ? last : b.visibleTip!)),
    pointAt(t: number): Point {
      const d = Math.max(0, Math.min(1, t)) * length;
      if (start && d <= first) return start.pointAt(d / first);
      if (end && d >= first + body.length) return end.pointAt((length - d) / last);
      return body.pointAt(body.length ? (d - first) / body.length : 0);
    },
  };
}

export function loadCableStyle(): CableStyle {
  try { return localStorage.getItem('netlab-cable-style') === 'hybrid' ? 'hybrid' : 'straight'; } catch { return 'straight'; }
}
