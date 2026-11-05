import type { Network, PingProgress, WireTransfer, WireFrameContext } from './engine/network';

/** Read-only presentation observations. No frame references, cache, timers or
 * protocol actions; subscribers cannot replace the simulator's wire handler. */
export type NetworkObservation = { network: Network } & (
  { kind: 'ping'; event: Readonly<PingProgress> } |
  { kind: 'icmp'; from: string; to: string; source: number; destination: number; icmpId: number; seq: number; direction: 'request' | 'reply' }
);
const listeners = new Set<(event: NetworkObservation) => void>();
export function observeNetworkActivity(listener: (event: NetworkObservation) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(event: NetworkObservation) { for (const listener of listeners) { try { listener(event); } catch { /* Observers cannot interrupt delivery. */ } } }
export function observePingActivity(network: Network, event: PingProgress) { if (listeners.size) publish({ kind: 'ping', network, event: { ...event } }); }
export function observeIcmpActivity(network: Network, transfer: WireTransfer, context: WireFrameContext) {
  if (!listeners.size) return;
  const packet = context.frame.payload;
  if (packet.kind !== 'ipv4' || packet.l4.kind !== 'icmp') return;
  const msg = packet.l4.msg;
  if (msg.type !== 'echo-request' && msg.type !== 'echo-reply') return;
  publish({ kind: 'icmp', network, from: transfer.fromDeviceId, to: transfer.toDeviceId, source: packet.src, destination: packet.dst, icmpId: msg.id, seq: msg.seq, direction: msg.type === 'echo-request' ? 'request' : 'reply' });
}
