import type { Network } from './engine/network';
import type { Point } from './cableGeometry';

// pointAt is arc-length normalized: works with cableGeometry and the actual SVG
// path, including front segments. Called only when opening a context menu.
export function cableEndAt(geometry: { length: number; pointAt(t: number): Point }, point: Point): 'a' | 'b' {
  const steps = Math.min(512, Math.max(32, Math.ceil(geometry.length / 6)));
  let closest = Infinity, progress = 0, previous = geometry.pointAt(0);
  for (let i = 1; i <= steps; i++) {
    const next = geometry.pointAt(i / steps), dx = next.x - previous.x, dy = next.y - previous.y;
    const fraction = Math.max(0, Math.min(1, ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
    const distance = (point.x - previous.x - dx * fraction) ** 2 + (point.y - previous.y - dy * fraction) ** 2;
    if (distance < closest) { closest = distance; progress = (i - 1 + fraction) / steps; }
    previous = next;
  }
  return progress <= 0.5 + 1e-8 ? 'a' : 'b';
}

export function firstReconnectInterface(net: Network, draft: { id: string; end: 'a' | 'b' }, deviceId: string) {
  const original = net.links.get(draft.id)?.[draft.end];
  // The preview keeps the original Link attached. Dropping it back on its own
  // device restores that exact port, even if other interfaces are free.
  if (original?.device.id === deviceId && net.reconnectError(draft.id, draft.end, deviceId, original.name) === null) return original;
  return net.devices.get(deviceId)?.interfaces.find(iface => iface.medium === 'ethernet' && !iface.link
    && net.reconnectError(draft.id, draft.end, deviceId, iface.name) === null) ?? null;
}

export function reconnectTargetError(net: Network, draft: { id: string; end: 'a' | 'b' }, deviceId: string): string {
  const device = net.devices.get(deviceId);
  if (!device || device.disposed) return 'Gerät nicht verfügbar.';
  const ethernet = device.interfaces.filter(i => i.medium === 'ethernet');
  if (!ethernet.length) return `${device.name}: keine Ethernet-Schnittstelle.`;
  const free = ethernet.find(i => !i.link);
  if (!free) return `${device.name}: keine freie Ethernet-Schnittstelle.`;
  return net.reconnectError(draft.id, draft.end, deviceId, free.name) ?? 'Keine kompatible Schnittstelle verfügbar.';
}
