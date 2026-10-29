export type Point = { x: number; y: number };
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const HERO_TIMING = { movementScale: 1.5, readingScale: 1, routerHoldMs: 1260, arrivalMs: 550, restartMs: 900 } as const;
export const SEEK_DURATION_MS = 650;
export const HERO_PATH = 'M140 170 C200 170 170 100 280 100 S410 170 480 170 S610 170 670 170 C740 170 740 100 820 100 S950 170 1000 170 C1120 170 1120 210 1210 210 S1310 170 1370 170';
// Existing reading holds are preserved. Only movement times scale, independently.
const phases = [
  [2700, 0, false], [1440, 1, true], [1260, 1, false], [720, 2, true], [HERO_TIMING.routerHoldMs, 2, false],
  [1440, 3, true], [2880, 3, false], [1620, 2, true], [540, 2, false],
  [900, 1, true], [540, 1, false], [1080, 0, true], [360, 0, false],
] as const;
const milliseconds: [number, number][] = [[0, 0]];
for (const [duration, station, moving] of phases) milliseconds.push([milliseconds.at(-1)![0] + duration * (moving ? HERO_TIMING.movementScale : HERO_TIMING.readingScale), station]);
milliseconds.push([milliseconds.at(-1)![0] + HERO_TIMING.restartMs, 0]);
export const JOURNEY_DURATION_MS = milliseconds.at(-1)![0];
export const HERO_TIMELINE = milliseconds.map(([ms, station]) => [ms / JOURNEY_DURATION_MS, station] as const);
export const HERO_REPLY_PROGRESS = HERO_TIMELINE[7][0];
export const SCENE_PROGRESS = [0, (HERO_TIMELINE[4][0] + HERO_TIMELINE[5][0]) / 2, (HERO_TIMELINE[6][0] + HERO_TIMELINE[7][0]) / 2] as const;
/** One conceptual IP journey. A new Echo Reply travels back, not the request. */
export function travelProgress(progress: number, stops: readonly number[] = [0, .45, .57, 1]): number {
  // Distinct travel, arrival/reading and cycle-reset intervals.
  // Repeated positions are holds; easing only applies to movement segments.
  const p = clamp(progress);
  for (let i = 1; i < HERO_TIMELINE.length; i++) {
    const [end, endStation] = HERO_TIMELINE[i], [start, startStation] = HERO_TIMELINE[i - 1];
    const a = stops[startStation], b = stops[endStation];
    if (p <= end) return a + (b - a) * smoothStep((p - start) / (end - start));
  }
  return 0;
}
/** The hero path is monotonic in X; resolve exact artwork arrival fractions once. */
export function pathFractionAtX(path: Pick<SVGPathElement, 'getTotalLength' | 'getPointAtLength'>, x: number) {
  const length = path.getTotalLength(); let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (path.getPointAtLength(mid * length).x < x) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export function sceneForX(x: number): number { return x < 480 ? 0 : x < 960 ? 1 : 2; }
export function cameraForX(x: number): number { return clamp(x - 240, 0, 960); }
export function smoothStep(t: number): number { t = clamp(t); return t * t * (3 - 2 * t); }
/** A bounded, non-oscillating low-pass filter; no velocity/spring overshoot. */
export function follow(current: number, target: number, elapsed: number): number {
  if (Math.abs(current - target) < .0005) return target;
  return current + (target - current) * (1 - Math.exp(-Math.min(elapsed, 50) / 65));
}
export function scrollProgress(scrollY: number, top: number, firstY: number, lastY: number, viewportHeight: number): number {
  return clamp((scrollY + viewportHeight * .58 - top - firstY) / Math.max(1, lastY - firstY));
}
/** Vertical tangents keep the same reversible path between measured connectors. */
export function scrollSegments(points: readonly Point[]): string[] {
  return points.slice(1).map((point, i) => {
    const previous = points[i], middleY = (previous.y + point.y) / 2;
    return `M${previous.x} ${previous.y} C${previous.x} ${middleY} ${point.x} ${middleY} ${point.x} ${point.y}`;
  });
}

/** Route the alternating layout through the measured gap between rows.
 * Vertical legs stay in each artwork column; the rounded crossing stays outside panels. */
export function alternatingScrollSegments(points: readonly Point[], rows: readonly { top: number; bottom: number }[]): string[] {
  return points.slice(1).map((b, i) => {
    const a = points[i], middle = (rows[i].bottom + rows[i + 1].top) / 2;
    const direction = Math.sign(b.x - a.x);
    const radius = Math.max(0, Math.min(16, (rows[i + 1].top - rows[i].bottom) / 2 - 3, Math.abs(b.x - a.x) / 2, (middle - a.y) / 2, (b.y - middle) / 2));
    return `M${a.x} ${a.y} L${a.x} ${middle - radius} Q${a.x} ${middle} ${a.x + direction * radius} ${middle} L${b.x - direction * radius} ${middle} Q${b.x} ${middle} ${b.x} ${middle + radius} L${b.x} ${b.y}`;
  });
}
