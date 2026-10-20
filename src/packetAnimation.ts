import type { WireTransfer, WireVisualTrace } from './engine/network';

export const PACKET_ANIMATION_KEY = 'netlab:packet-animation-duration:v1';
export const PACKET_ANIMATION_SPEED_KEY = 'netlab:packet-animation-speed:v1';
export const PACKET_ANIMATION_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4] as const;
export const DEFAULT_PACKET_ANIMATION_SPEED = 1;
export const MAX_VISUAL_QUEUE_MS = 12_000;
export const packetAnimationDuration = (speed: number) => 1_000 / speed;

// Presentation-only metadata: engine timestamps remain unchanged.
export interface AnimatedTransfer extends WireTransfer {
  visualStart: number;
  visualDuration: number;
  parentTransferId?: number;
}

export function normalizePacketAnimationSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_PACKET_ANIMATION_SPEED;
  return PACKET_ANIMATION_SPEEDS.reduce<number>((nearest, speed) => Math.abs(speed - value) < Math.abs(nearest - value) ? speed : nearest, 1);
}

export function readPacketAnimationSpeed(): number {
  try {
    const value = localStorage.getItem(PACKET_ANIMATION_SPEED_KEY);
    if (value?.trim() && Number.isFinite(Number(value)) && Number(value) > 0) return normalizePacketAnimationSpeed(Number(value));
    const previous = Number(localStorage.getItem(PACKET_ANIMATION_KEY));
    if (Number.isFinite(previous) && previous > 0) {
      const speed = normalizePacketAnimationSpeed(1_000 / previous);
      savePacketAnimationSpeed(speed);
      return speed;
    }
  } catch { /* Local presentation preferences are optional. */ }
  return DEFAULT_PACKET_ANIMATION_SPEED;
}

export function savePacketAnimationSpeed(speed: number): void {
  try { localStorage.setItem(PACKET_ANIMATION_SPEED_KEY, String(speed)); } catch { /* Runtime control still works. */ }
}

export function sequencePacketAnimation(transfer: WireTransfer, visual: WireVisualTrace | undefined, packets: readonly AnimatedTransfer[], clock: number, duration: number): AnimatedTransfer | null {
  const parent = visual && packets.find((packet) => packet.id === visual.parentTransferId);
  const visualStart = Math.max(clock, parent ? parent.visualStart + parent.visualDuration : clock);
  // Bound visual backlog without ever delaying the actual transmission.
  if (visualStart > clock + MAX_VISUAL_QUEUE_MS) return null;
  return { ...transfer, visualStart, visualDuration: duration, ...(parent ? { parentTransferId: parent.id } : {}) };
}

export function packetAnimationProgress(packet: AnimatedTransfer, clock: number): number | null {
  const elapsed = clock - packet.visualStart;
  return elapsed < 0 || elapsed >= packet.visualDuration ? null : elapsed / packet.visualDuration;
}

export function retimePacketAnimations(packets: readonly AnimatedTransfer[], clock: number, duration: number): AnimatedTransfer[] {
  const result: AnimatedTransfer[] = [], updated = new Map<number, AnimatedTransfer>();
  for (const packet of packets) {
    if (packet.visualStart + packet.visualDuration <= clock) continue;
    const parent = packet.parentTransferId === undefined ? undefined : updated.get(packet.parentTransferId);
    const visualStart = packet.visualStart <= clock
      ? clock - (clock - packet.visualStart) / packet.visualDuration * duration
      : parent ? parent.visualStart + parent.visualDuration
        : clock + (packet.visualStart - clock) * duration / packet.visualDuration;
    if (visualStart > clock + MAX_VISUAL_QUEUE_MS) continue;
    const changed = { ...packet, visualStart, visualDuration: duration };
    result.push(changed); updated.set(changed.id, changed);
  }
  return result;
}
