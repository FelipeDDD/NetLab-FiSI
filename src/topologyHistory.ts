import type { SavedDevice, SavedLink } from './engine/serialize';
import type { DhcpServerConfig, HttpServerConfig } from './engine/ipdevice';

export const TOPOLOGY_HISTORY_LIMIT = 50;
export type Point = { x: number; y: number };
export interface NodeMovement { id: string; before: Point; after: Point }
// Discriminated entries leave room for future edit types, without storing engines.
export type MoveOperation = { type: 'move-nodes'; label: string; changes: NodeMovement[] };
export type HistoryLink = SavedLink & { latency: number };
export type CreatedDevice = { saved: SavedDevice; macs: Record<string, string>; index: number };
export type InterfaceIp = { addr: number; prefix: number } | null;
export type DhcpSettings = Omit<DhcpServerConfig, 'leases'>;
export type DnsRecords = [string, number][];
export type DhcpFieldEdit =
  | { field: 'rangeStart' | 'rangeEnd'; before: number; after: number }
  | { field: 'router' | 'dns'; before: number | null; after: number | null };
export type InspectorOperation =
  | {type:'set-dhcp-server-enabled';label:string;deviceId:string;before:boolean;after:boolean}
  | {type:'set-dhcp-configuration';label:string;deviceId:string;before:import('./engine/dhcpPools').DhcpConfiguration;after:import('./engine/dhcpPools').DhcpConfiguration}
  | { type: 'set-wifi-range'; label: string; deviceId: string; before: number; after: number }
  | { type: 'enable-wireless'; label: string; deviceId: string; mac: string }
  | { type: 'resize-switch'; label: string; deviceId: string; before: number; after: number; port: { name: string; mac: string } }
  | { type: 'set-interface-ipv4'; label: string; deviceId: string; ifaceName: string; before: import('./engine/ipv4Config').InterfaceIpv4; after: import('./engine/ipv4Config').InterfaceIpv4 }
  | { type: 'set-host-os'; label: string; deviceId: string; before: import('./hostOs').HostOs; after: import('./hostOs').HostOs }
  | { type: 'rename-device'; label: string; deviceId: string; before: string; after: string }
  | { type: 'set-iface-ip'; label: string; deviceId: string; ifaceName: string; before: InterfaceIp; after: InterfaceIp }
  | { type: 'set-nameserver'; label: string; deviceId: string; before: number | null; after: number | null }
  | { type: 'set-services'; label: string; deviceId: string; proto: 'tcp' | 'udp'; before: number[]; after: number[] }
  | { type: 'set-ssid'; label: string; deviceId: string; before: string; after: string }
  | { type: 'set-port-vlan'; label: string; deviceId: string; port: string; before: number; after: number }
  | { type: 'create-dhcp-server'; label: string; deviceId: string; after: DhcpSettings }
  | { type: 'create-dns-server'; label: string; deviceId: string; after: { enabled: boolean; records: DnsRecords } }
  | { type: 'create-http-server'; label: string; deviceId: string; after: HttpServerConfig }
  | { type: 'set-server-enabled'; label: string; deviceId: string; server: 'dhcpServer' | 'dnsServer' | 'httpServer'; before: boolean; after: boolean }
  | ({ type: 'set-dhcp-field'; label: string; deviceId: string } & DhcpFieldEdit)
  | { type: 'set-dns-records'; label: string; deviceId: string; before: DnsRecords; after: DnsRecords }
  | { type: 'set-http-port'; label: string; deviceId: string; before: number; after: number }
  | { type: 'set-http-body'; label: string; deviceId: string; before: string; after: string }
  | { type: 'set-rip-enabled'; label: string; deviceId: string; before: boolean; after: boolean }
  | { type: 'set-forwarding'; label: string; deviceId: string; before: boolean; after: boolean }
  | { type: 'set-iface-state'; label: string; deviceId: string; ifaceName: string; before: boolean; after: boolean };
export const sameInterfaceIp = (a: InterfaceIp, b: InterfaceIp) => a === b || (!!a && !!b && a.addr === b.addr && a.prefix === b.prefix);
export const sortedServicePorts = (ports: Iterable<number>): number[] => [...new Set(ports)].sort((a, b) => a - b);
export function sameServicePorts(a: Iterable<number>, b: Iterable<number>): boolean {
  const left = sortedServicePorts(a), right = sortedServicePorts(b);
  return left.length === right.length && left.every((port, i) => port === right[i]);
}
export type TopologyOperation = MoveOperation
  | InspectorOperation
  | { type: 'set-area-markings'; label: string; before: import('./areaMarkings').AreaMarking[]; after: import('./areaMarkings').AreaMarking[] }
  | { type: 'set-cable-color'; label: string; linkId: string; before: import('./cableAppearance').CableAppearance | null; after: import('./cableAppearance').CableAppearance }
  | { type: 'reconnect-link'; label: string; end: 'a' | 'b'; before: HistoryLink; after: HistoryLink; beforeColor: import('./cableAppearance').CableAppearance | null; afterColor: import('./cableAppearance').CableAppearance | null }
  | { type: 'add-links' | 'remove-links'; label: string; links: HistoryLink[]; cableColors?: import('./cableAppearance').CableAppearances }
  | { type: 'delete-devices'; label: string; devices: CreatedDevice[]; links: HistoryLink[]; colors: Record<string, string>; cableColors?: import('./cableAppearance').CableAppearances; markings?: { before: import('./areaMarkings').AreaMarking[]; after: import('./areaMarkings').AreaMarking[] } }
  | { type: 'paste-devices'; label: string; devices: CreatedDevice[]; links: HistoryLink[]; colors: Record<string,string>; cableColors: import('./cableAppearance').CableAppearances }
  | { type: 'create-device'; label: string; device: CreatedDevice };
export const isInspectorOperation = (operation: TopologyOperation): operation is InspectorOperation => 'deviceId' in operation;
export interface TopologyHistory { past: TopologyOperation[]; future: TopologyOperation[] }
export const emptyTopologyHistory = (): TopologyHistory => ({ past: [], future: [] });
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function recordOperation(history: TopologyHistory, operation: TopologyOperation): TopologyHistory {
  return { past: [...history.past, structuredClone(operation)].slice(-TOPOLOGY_HISTORY_LIMIT), future: [] };
}

export function recordMovement(history: TopologyHistory, changes: NodeMovement[]): TopologyHistory {
  const actual = changes.filter((change) => !samePoint(change.before, change.after));
  if (!actual.length) return history;
  const operation: TopologyOperation = {
    type: 'move-nodes', label: actual.length === 1 ? 'Move device' : `Move ${actual.length} devices`,
    changes: actual.map(({ id, before, after }) => ({ id, before: { ...before }, after: { ...after } })),
  };
  return recordOperation(history, operation);
}

export function applyMovement<T extends { id: string; position: Point }>(nodes: T[], operation: MoveOperation, direction: 'undo' | 'redo'): T[] | null {
  const from = direction === 'undo' ? 'after' : 'before';
  const to = direction === 'undo' ? 'before' : 'after';
  // Reject stale operations atomically rather than partially moving survivors.
  if (operation.changes.some((c) => !nodes.some((n) => n.id === c.id && samePoint(n.position, c[from])))) return null;
  return nodes.map((node) => {
    const change = operation.changes.find((c) => c.id === node.id);
    return change ? { ...node, position: { ...change[to] } } : node;
  });
}
