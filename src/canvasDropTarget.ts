export interface DropPoint { x: number; y: number; }
export interface DropRegion { id: string; x: number; y: number; width: number; height: number; }
/** Never choose the nearest/topmost device when selection regions overlap. */
export function unambiguousDropTarget(point: DropPoint, regions: DropRegion[]): string | null {
  const ids = new Set(regions.filter(r => point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height).map(r => r.id));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Client-space DOM bounds already include canvas pan/zoom and caption scaling.
 * The transparent region is exactly the existing painted selection border. */
export function canvasDropTarget(root: HTMLElement, point: DropPoint): string | null {
  const top = root.ownerDocument.elementFromPoint(point.x, point.y), node = top?.closest<HTMLElement>('.react-flow__node');
  if (!node || !root.contains(node)) return null; // Do not drop through panels/overlays.
  const regions = [...root.querySelectorAll<HTMLElement>('.react-flow__node')].flatMap(element => {
    const region = element.querySelector<HTMLElement>('.device-interaction-region,.device-node');
    if (!region?.getClientRects().length) return [];
    const actual = element.querySelector<HTMLElement>('.device-interaction-region') ?? region, rect = actual.getBoundingClientRect();
    return [{ id: element.dataset.id!, x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  });
  // Preserve explicit handle drops, including the existing part outside a border.
  // They still participate in ambiguity detection against any other device.
  if (top?.closest('.react-flow__handle')) regions.push({ id: node.dataset.id!, ...point, width: 0, height: 0 });
  const target = unambiguousDropTarget(point, regions);
  return target === node.dataset.id ? target : null;
}
