export type PacketPanelSide = 'left' | 'right';
export type PacketTableMode = 'compact' | 'full';
export interface PacketInspectorPreference {
  side: PacketPanelSide; mode: PacketTableMode; widths: { compact: number; full: number };
}
export const PACKET_LAYOUT_KEY = 'netlab-packet-inspector-layout';
export function normalizePacketInspector(value: unknown): PacketInspectorPreference {
  const s = value && typeof value === 'object' ? value as Partial<PacketInspectorPreference> : {};
  const width = (value: unknown, fallback: number, max: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(300, Math.min(max, value))) : fallback;
  return { side: s.side === 'left' ? 'left' : 'right', mode: s.mode === 'compact' ? 'compact' : 'full',
    widths: { compact: width(s.widths?.compact, 370, 680), full: width(s.widths?.full, 600, 800) } };
}
export function loadPacketInspector(): PacketInspectorPreference {
  try { return normalizePacketInspector(JSON.parse(localStorage.getItem(PACKET_LAYOUT_KEY) ?? 'null')); }
  catch { return normalizePacketInspector(null); }
}
export function savePacketInspector(value: PacketInspectorPreference): void {
  try { localStorage.setItem(PACKET_LAYOUT_KEY, JSON.stringify(value)); } catch { /* Local-only preference. */ }
}
export function packetPanelGeometry(viewport: number, deviceWidth: number, preference: PacketInspectorPreference) {
  const hasDevice = deviceWidth > 0;
  const placement = viewport <= 700 ? 'stack' : hasDevice && (viewport <= 1100 || viewport - deviceWidth < 580) ? 'rows' : 'columns';
  const displayedDevice = Math.min(deviceWidth, Math.max(0, viewport - 16));
  const available = placement === 'stack' ? viewport - 16 : viewport - displayedDevice - (placement === 'columns' ? 280 : 0);
  const max = Math.max(0, Math.min(preference.mode === 'full' ? 800 : 680, available)), min = Math.min(300, max);
  const width = Math.round(Math.max(min, Math.min(max, preference.widths[preference.mode])));
  return { placement, width, min, max, deviceWidth: displayedDevice };
}
