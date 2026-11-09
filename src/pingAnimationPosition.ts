import type { PanelPoint } from './components/floatingPanelPosition';

/** Document presentation only; unrelated to global/manual animation speed. */
export interface PingAnimationPosition { remember: boolean; position?: PanelPoint }
export function readPingAnimationPosition(value: unknown): PingAnimationPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { remember: false };
  const source = value as PingAnimationPosition, point = source.position;
  if (source.remember !== true) return { remember: false };
  return { remember: true, ...(point && [point.x, point.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER)
    ? { position: { x: point.x, y: point.y } } : {}) };
}
