import type { CapturedPacket, PacketCaptureState } from './packetCapture';
import { packetPage, PACKET_PAGE_SIZE } from './packetPresentation';

export interface PacketLiveView {
  following: boolean;
  anchor: CapturedPacket | null;
  acknowledged: number;
}

export const emptyPacketLiveView = (): PacketLiveView => ({ following: true, anchor: null, acknowledged: 0 });
// Retention keeps length constant, but discarded continues to count arrivals.
export const receivedPacketCount = (capture: PacketCaptureState) => capture.records.length + capture.discarded;

export function packetLivePage(capture: PacketCaptureState, view: PacketLiveView) {
  const latestStart = Math.max(0, Math.floor((capture.records.length - 1) / PACKET_PAGE_SIZE) * PACKET_PAGE_SIZE);
  return packetPage(capture.records, view.following ? capture.records[latestStart] ?? null : view.anchor);
}

export function suspendPacketLive(capture: PacketCaptureState, view: PacketLiveView): PacketLiveView {
  if (!view.following) return view;
  return { following: false, anchor: packetLivePage(capture, view).rows[0] ?? null, acknowledged: receivedPacketCount(capture) };
}

export function newPacketCount(capture: PacketCaptureState, view: PacketLiveView): number {
  return view.following ? 0 : Math.max(0, receivedPacketCount(capture) - view.acknowledged);
}

export function packetCaptureWasReset(before: PacketCaptureState, after: PacketCaptureState): boolean {
  return receivedPacketCount(after) < receivedPacketCount(before)
    || (after.records.length === 0 && before.records.length > 0);
}
