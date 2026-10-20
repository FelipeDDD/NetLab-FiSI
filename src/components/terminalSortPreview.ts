export interface SortItem { id: string; left: number; width: number }

// Always hit-test the untransformed layout. Animated neighbors cannot move
// their own threshold back under the pointer and cause oscillation.
export function insertionAnchor(items: readonly SortItem[], x: number, dragged: string): string | null {
  return items.find((item) => item.id !== dragged && x < item.left + item.width / 2)?.id ?? null;
}

export function sortPreviewOffsets(items: readonly SortItem[], dragged: string, before: string | null, externalWidth = 0, gap = 0): Record<string, number> {
  const source = items.find((item) => item.id === dragged);
  if (before === dragged) return {};
  const remaining = items.filter((item) => item.id !== dragged);
  const index = before ? remaining.findIndex((item) => item.id === before) : remaining.length;
  if (index < 0) return {};
  const ordered = [...remaining];
  ordered.splice(index, 0, source ?? { id: dragged, left: 0, width: externalWidth });
  let left = items[0]?.left ?? 0;
  const result: Record<string, number> = {};
  for (const item of ordered) {
    if (items.some((old) => old.id === item.id)) result[item.id] = left - item.left;
    left += item.width + gap;
  }
  return result;
}

export function edgeScrollSpeed(x: number, left: number, right: number): number {
  const zone = Math.min(48, (right - left) / 4);
  if (x < left || x > right || zone <= 0) return 0;
  if (x < left + zone) return -14 * (1 - (x - left) / zone);
  if (x > right - zone) return 14 * (1 - (right - x) / zone);
  return 0;
}
