export const PACKET_ANIMATION_WIDGET_KEY = 'netlab:packet-animation-widget:v1';
export type PacketAnimationPlacement = { mode: 'toolbar' } | { mode: 'floating'; x: number; y: number };

export function clampPacketWidget(position: { x: number; y: number }, viewport: { width: number; height: number }, size: { width: number; height: number }): PacketAnimationPlacement {
  return { mode: 'floating', x: Math.max(0, Math.min(position.x, viewport.width - size.width)), y: Math.max(0, Math.min(position.y, viewport.height - size.height)) };
}

// A future exercise can supply a fallback without overriding a local choice.
export function readPacketAnimationPlacement(initial: PacketAnimationPlacement = { mode: 'toolbar' }): PacketAnimationPlacement {
  try {
    const stored = JSON.parse(localStorage.getItem(PACKET_ANIMATION_WIDGET_KEY) ?? 'null');
    if (stored?.mode === 'toolbar') return { mode: 'toolbar' };
    if (stored?.mode === 'floating' && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return { mode: 'floating', x: stored.x, y: stored.y };
  } catch { /* Optional local layout preference. */ }
  return initial;
}

export function savePacketAnimationPlacement(placement: PacketAnimationPlacement): void {
  try { localStorage.setItem(PACKET_ANIMATION_WIDGET_KEY, JSON.stringify(placement)); } catch { /* Dragging still works. */ }
}
