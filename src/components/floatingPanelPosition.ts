export type PanelPoint = { x: number; y: number };
export type PanelSize = { width: number; height: number };

/** Shared presentation geometry, independent of panel contents or simulator state. */
export function boundFloatingPanel(position: PanelPoint, area: PanelSize, size: PanelSize): PanelPoint {
  const bound = (value: number, available: number, length: number) => Math.max(0, Math.min(value, Math.max(0, available - length)));
  return { x: bound(position.x, area.width, size.width), y: bound(position.y, area.height, size.height) };
}
