import type { WireTransfer } from './engine/network';
import type { AppData, FramePayload } from './engine/types';

export type ApplicationProtocol = 'dns' | 'http' | 'dhcp' | 'rip';
export type TrafficProtocol = WireTransfer['kind'] | ApplicationProtocol;
export const TRAFFIC_PROTOCOLS: readonly TrafficProtocol[] = ['arp', 'icmp', 'tcp', 'udp', 'dns', 'http', 'dhcp', 'rip'];

export function applicationProtocol(kind: AppData['kind']): ApplicationProtocol {
  switch (kind) {
    case 'dns-query': case 'dns-answer': return 'dns';
    case 'http-request': case 'http-response': return 'http';
    case 'dhcp': return 'dhcp';
    case 'rip': return 'rip';
  }
}

export function trafficProtocolLayers(payload: FramePayload) {
  if (payload.kind === 'arp') return { kind: 'arp', application: undefined } as const;
  const { l4 } = payload;
  return { kind: l4.kind, application: l4.kind !== 'icmp' && l4.app ? applicationProtocol(l4.app.kind) : undefined };
}

// Transport and application filters are alternatives. HTTP matches TCP too,
// while selecting HTTP alone omits TCP segments without HTTP data.
export function matchesTrafficProtocols(selected: readonly TrafficProtocol[], layers: {
  kind: WireTransfer['kind']; application?: ApplicationProtocol;
}): boolean {
  return selected.length === 0 || selected.includes(layers.kind) ||
    (layers.application !== undefined && selected.includes(layers.application));
}

export function toggleTrafficProtocol(selected: readonly TrafficProtocol[], protocol: TrafficProtocol): TrafficProtocol[] {
  return selected.includes(protocol) ? selected.filter(value => value !== protocol) : [...selected, protocol];
}
