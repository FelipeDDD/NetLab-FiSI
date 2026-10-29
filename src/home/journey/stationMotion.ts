import { clamp, smoothStep } from './geometry';

export const STATION_MOTION = { pixelsPerSecond: 750, minDurationMs: 300, maxDurationMs: 1100, hysteresisPx: 14, activationLine: .58 } as const;

/** Midpoints select a destination; a small deadband keeps wheel noise from toggling it. */
export function stationAt(readingY: number, anchors: readonly number[], previous?: number): number {
  let index = previous === undefined ? 0 : clamp(previous, 0, anchors.length - 1);
  const band = previous === undefined ? 0 : STATION_MOTION.hysteresisPx;
  while (index < anchors.length - 1 && readingY >= (anchors[index] + anchors[index + 1]) / 2 + band) index++;
  while (index > 0 && readingY < (anchors[index - 1] + anchors[index]) / 2 - band) index--;
  return index;
}

export type StationMove = { from: number; to: number; elapsed: number; duration: number };
export function stationMove(from: number, to: number, pathLength: number): StationMove {
  return { from, to, elapsed: 0, duration: clamp(Math.abs(to - from) * pathLength / STATION_MOTION.pixelsPerSecond * 1000, STATION_MOTION.minDurationMs, STATION_MOTION.maxDurationMs) };
}
export function stationMovePosition(move: StationMove): number {
  return move.from + (move.to - move.from) * smoothStep(move.elapsed / move.duration);
}

/** Preserve the same inter-station position when a responsive path is remeasured. */
export function remapStationPosition(position: number, before: readonly number[], after: readonly number[]): number {
  const end = before.findIndex((value, i) => i > 0 && position <= value);
  if (end < 0) return after.at(-1) ?? 0;
  const start = end - 1, fraction = clamp((position - before[start]) / Math.max(1e-9, before[end] - before[start]));
  return after[start] + fraction * (after[end] - after[start]);
}
