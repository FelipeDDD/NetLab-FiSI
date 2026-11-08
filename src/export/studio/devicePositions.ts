import type { Card, Point, Rect } from './geometry';

export type DevicePositions = Record<string, Point>;
export interface DiagramTransform { tx: number; ty: number; scale: number; }
export const toDocument = (point: Point, transform: DiagramTransform): Point => ({ x: transform.tx + point.x * transform.scale, y: transform.ty + point.y * transform.scale });
export const toTopology = (point: Point, transform: DiagramTransform): Point => ({ x: (point.x - transform.tx) / transform.scale, y: (point.y - transform.ty) / transform.scale });
export const documentRect = (rect: Rect, transform: DiagramTransform): Rect => ({ ...toDocument(rect, transform), width: rect.width * transform.scale, height: rect.height * transform.scale });
/** Pointer events and getScreenCTM use the same iframe-local client space. */
export function pointerInDocument(svg: SVGSVGElement, client: Point): Point | null {
  const matrix = svg.getScreenCTM(); if (!matrix) return null;
  const point = svg.createSVGPoint(); point.x = client.x; point.y = client.y;
  return point.matrixTransform(matrix.inverse());
}

/** Presentation centers, in printable-document pixels (never viewport pixels). */
export function manualDevicePosition(positions: DevicePositions, id: string): Point | undefined {
  if (!Object.hasOwn(positions, id)) return;
  const point = positions[id];
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
}
export function clampDeviceCenter(point: Point, size: Pick<Rect, 'width' | 'height'>, area: Rect): Point {
  return { x: size.width > area.width ? area.x + area.width / 2 : Math.max(area.x + size.width / 2, Math.min(area.x + area.width - size.width / 2, point.x)),
    y: size.height > area.height ? area.y + area.height / 2 : Math.max(area.y + size.height / 2, Math.min(area.y + area.height - size.height / 2, point.y)) };
}

/** Apply after automatic separation and page fit. Do not move neighbours or
 * include manual positions in the bounds used to fit the topology. */
export function positionDeviceCards(cards: Card[], positions: DevicePositions, transform: DiagramTransform, area: Rect): Card[] {
  return cards.map(card => {
    const chosen = manualDevicePosition(positions, card.device.id); if (!chosen) return card;
    // A valid saved centre is an anchor. Content/title edits may change the
    // rendered size; report an actual overflow instead of moving that anchor.
    // Out-of-page imported coordinates still use the existing safe recovery.
    const inside = chosen.x >= area.x && chosen.x <= area.x + area.width && chosen.y >= area.y && chosen.y <= area.y + area.height;
    const position = inside ? chosen : clampDeviceCenter(chosen, { width: card.width * transform.scale, height: card.height * transform.scale }, area), world = toTopology(position, transform);
    return { ...card, x: world.x - card.width / 2, y: world.y - card.height / 2 };
  });
}
