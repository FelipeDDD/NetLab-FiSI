import type { DevicePositions } from './devicePositions';
import { center, type Rect } from './geometry';

/** Reflect rendered rectangles around their common vertical extent. This maps
 * their real top/bottom edges back inside the same bounds, without clamping,
 * refitting the topology, moving tables or touching icon/text orientation. */
export function flippedDevicePositions(cards: (Rect & { id: string })[], positions: DevicePositions): DevicePositions {
  if (!cards.length) return positions;
  const sum = Math.min(...cards.map(r => r.y)) + Math.max(...cards.map(r => r.y + r.height));
  return { ...positions, ...Object.fromEntries(cards.map(r => [r.id, { x: center(r).x, y: sum - center(r).y }])) };
}
