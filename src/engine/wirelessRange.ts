// Approximate teaching scale, independent of viewport/zoom. Calibrate here.
export const WIFI_CANVAS_UNITS_PER_METER = 180 / 250;
export const WIFI_RANGE = { min: 50, max: 500, default: 250 } as const;
export function normalizeWifiRange(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(WIFI_RANGE.min, Math.min(WIFI_RANGE.max, Math.round(value))) : WIFI_RANGE.default;
}
export const wifiRadius = (meters: number) => meters * WIFI_CANVAS_UNITS_PER_METER;
// Centers of the current AP body and Host artwork, in canvas coordinates.
export function wifiCenter(position: { x: number; y: number }, kind: string) {
  const offset = kind === 'smartphone' ? {x:40,y:55} : kind === 'notebook' ? {x:64,y:46} : {x:62,y:kind === 'ap' ? 48 : 39};
  return {x:position.x+offset.x,y:position.y+offset.y};
}
type Endpoint = { kind: string; position: { x: number; y: number }; ssid?: string; rangeMeters?: number };
export function wirelessError(ap: Endpoint, client: Endpoint, ssid: string | undefined): string | null {
  if (!ap.ssid?.trim() || ap.ssid !== ssid) return 'SSID nicht verfügbar';
  const a = wifiCenter(ap.position, ap.kind), b = wifiCenter(client.position, client.kind);
  return Math.hypot(a.x - b.x, a.y - b.y) <= wifiRadius(ap.rangeMeters ?? WIFI_RANGE.default) + 1e-9
    ? null : 'Außer Reichweite';
}
