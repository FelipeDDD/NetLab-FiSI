import type { WireTransfer, WireVisualTrace } from './engine/network';
import type { GuidedPacketState, PacketVisualizationMode } from './guidedPacket';

export const PACKET_ANIMATION_KEY = 'netlab:packet-animation-duration:v1';
export const PACKET_ANIMATION_SPEED_KEY = 'netlab:packet-animation-speed:v1';
export const PACKET_ANIMATION_SPEEDS = [0.5, 1, 2, 4] as const;
export const DEFAULT_PACKET_ANIMATION_SPEED = 1;
export const PING_ANIMATION_SPEEDS = [0.5, 1, 2] as const;
export const PING_ANIMATION_HIDE_DELAY_MS = 3_000;
// Experimental presentation timings, independent of Link.latency/Scheduler.
export const PACKET_ANIMATION_BASE_MS = { live: 200, guided: 1_000 } as const;
const LEGACY_PACKET_ANIMATION_BASE_MS = 1_000;
export const packetAnimationDuration = (speed: number, mode: PacketVisualizationMode = 'live') => PACKET_ANIMATION_BASE_MS[mode] / speed;

export function isPingAnimationActive(state: GuidedPacketState): boolean {
  const p = state.playback;
  return (state.observation.status === 'observing' && !state.observation.sourceFinished) ||
    (p.hops.length > 0 && (p.index < p.hops.length - 1 || p.progress < 1));
}

// Presentation-only metadata: engine timestamps remain unchanged.
export interface AnimatedTransfer extends WireTransfer {
  visualStart: number;
  visualDuration: number;
  parentTransferId?: number;
  pingTraffic?: boolean;
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
      const speed = normalizePacketAnimationSpeed(LEGACY_PACKET_ANIMATION_BASE_MS / previous);
      savePacketAnimationSpeed(speed);
      return speed;
    }
  } catch { /* Local presentation preferences are optional. */ }
  return DEFAULT_PACKET_ANIMATION_SPEED;
}

export function savePacketAnimationSpeed(speed: number): void {
  try { localStorage.setItem(PACKET_ANIMATION_SPEED_KEY, String(speed)); } catch { /* Runtime control still works. */ }
}

export function sequencePacketAnimation(transfer: WireTransfer, visual: WireVisualTrace | undefined, packets: readonly AnimatedTransfer[], clock: number, duration: number): AnimatedTransfer {
  // Forwarding takes precedence. Only a response's first hop depends directly
  // on its request's final hop; independent transfers/branches remain parallel.
  const predecessor = visual?.parentTransferId ?? visual?.echoRequestTransferId ?? visual?.arpRequestTransferId;
  const parent = packets.find((packet) => packet.id === predecessor);
  const visualStart = Math.max(clock, parent ? parent.visualStart + parent.visualDuration : clock);
  // Missing/expired predecessors never stall the network or invent a relation.
  // Retain every eligible transmission until its own visual deadline.
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
    const changed = { ...packet, visualStart, visualDuration: duration };
    result.push(changed); updated.set(changed.id, changed);
  }
  return result;
}
