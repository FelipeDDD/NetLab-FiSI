import { parseIp } from './engine/ip';
import type { CapturedPacket } from './packetCapture';
import { matchesTrafficProtocols, trafficProtocolLayers, type TrafficProtocol } from './packetProtocols';

export interface PacketFilters {
  protocols: TrafficProtocol[];
  source: string;
  destination: string;
  linkId: string;
}

export const emptyPacketFilters: PacketFilters = { protocols: [], source: '', destination: '', linkId: '' };

export function filterCapturedPackets(records: readonly CapturedPacket[], filters: PacketFilters): readonly CapturedPacket[] {
  const source = filters.source.trim(), destination = filters.destination.trim();
  if (!source && !destination && !filters.linkId && !filters.protocols.length) return records;
  const sourceIp = source ? parseIp(source) : undefined;
  const destinationIp = destination ? parseIp(destination) : undefined;
  if (sourceIp === null || destinationIp === null) return [];
  return records.filter(packet => {
    if (filters.linkId && packet.linkId !== filters.linkId) return false;
    const payload = packet.frame.payload;
    const from = payload.kind === 'arp' ? payload.senderIp : payload.src;
    const to = payload.kind === 'arp' ? payload.targetIp : payload.dst;
    return (sourceIp === undefined || sourceIp === from) && (destinationIp === undefined || destinationIp === to) &&
      (!filters.protocols.length || matchesTrafficProtocols(filters.protocols, trafficProtocolLayers(payload)));
  });
}
