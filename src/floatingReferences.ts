import { TERMINAL_REFERENCE } from './terminalReference';
import { boundExercisePanel } from './exercises/panelPosition';

export interface ReferenceTarget { entryId: string; operationIndex: number }
export const referenceKey = (target: ReferenceTarget) => `${target.entryId}:${target.operationIndex}`;
export function referenceSection(target: ReferenceTarget) {
  const entry = TERMINAL_REFERENCE.find(item => item.id === target.entryId);
  const operation = Number.isInteger(target.operationIndex) ? entry?.operations[target.operationIndex] : undefined;
  return entry && operation ? { entry, operation } : undefined;
}
export function canPinReference(target: ReferenceTarget) {
  return target.entryId === 'linux-ip-route' && !!referenceSection(target);
}
export function addReference(current: readonly ReferenceTarget[], target: ReferenceTarget) {
  if (!canPinReference(target)) return { status: 'unsupported' as const, items: current };
  if (current.some(item => referenceKey(item) === referenceKey(target))) return { status: 'duplicate' as const, items: current };
  if (current.length >= 2) return { status: 'limit' as const, items: current };
  return { status: 'added' as const, items: [...current, target] };
}

type Point = { x: number; y: number };
type Size = { width: number; height: number };
export type ReferenceRect = Point & Size;
export function boundReference(position: Point, viewport: Size, size: Size): Point {
  const point = boundExercisePanel({ x: position.x - 8, y: position.y - 8 },
    { width: viewport.width - 16, height: viewport.height - 16 }, size);
  return { x: point.x + 8, y: point.y + 8 };
}
/** Prefer free canvas space; overlap is unavoidable on very small screens. */
export function placeReference(viewport: Size, size: Size, canvas: ReferenceRect, obstacles: ReferenceRect[]): Point {
  const candidates = [
    { x: canvas.x + canvas.width - size.width - 12, y: canvas.y + 12 },
    { x: canvas.x + 12, y: canvas.y + 12 },
    { x: canvas.x + canvas.width - size.width - 12, y: canvas.y + canvas.height - size.height - 12 },
    { x: canvas.x + 12, y: canvas.y + canvas.height - size.height - 12 },
    ...obstacles.flatMap(rect => [
      { x: rect.x + rect.width + 12, y: rect.y }, { x: rect.x - size.width - 12, y: rect.y },
      { x: rect.x, y: rect.y + rect.height + 12 },
    ]),
  ].map(point => boundReference(point, viewport, size));
  const overlap = (point: Point) => obstacles.reduce((total, rect) => total +
    Math.max(0, Math.min(point.x + size.width, rect.x + rect.width) - Math.max(point.x, rect.x)) *
    Math.max(0, Math.min(point.y + size.height, rect.y + rect.height) - Math.max(point.y, rect.y)), 0);
  return candidates.reduce((best, point) => overlap(point) < overlap(best) ? point : best);
}
