import type { SavedDevice, SavedLink } from './engine/serialize';

export const TOPOLOGY_HISTORY_LIMIT = 50;
export type Point = { x: number; y: number };
export interface NodeMovement { id: string; before: Point; after: Point }
// Discriminated entries leave room for future edit types, without storing engines.
export type MoveOperation = { type: 'move-nodes'; label: string; changes: NodeMovement[] };
export type HistoryLink = SavedLink & { latency: number };
export type CreatedDevice = { saved: SavedDevice; macs: Record<string, string>; index: number };
export type InterfaceIp = { addr: number; prefix: number } | null;
export type InspectorOperation =
  | { type: 'rename-device'; label: string; deviceId: string; before: string; after: string }
  | { type: 'set-iface-ip'; label: string; deviceId: string; ifaceName: string; before: InterfaceIp; after: InterfaceIp }
  | { type: 'set-nameserver'; label: string; deviceId: string; before: number | null; after: number | null }
  | { type: 'set-services'; label: string; deviceId: string; proto: 'tcp' | 'udp'; before: number[]; after: number[] }
  | { type: 'set-ssid'; label: string; deviceId: string; before: string; after: string }
  | { type: 'set-port-vlan'; label: string; deviceId: string; port: string; before: number; after: number }
  | { type: 'set-iface-state'; label: string; deviceId: string; ifaceName: string; before: boolean; after: boolean };
export const sameInterfaceIp = (a: InterfaceIp, b: InterfaceIp) => a === b || (!!a && !!b && a.addr === b.addr && a.prefix === b.prefix);
export const sortedServicePorts = (ports: Iterable<number>): number[] => [...new Set(ports)].sort((a, b) => a - b);
export function sameServicePorts(a: Iterable<number>, b: Iterable<number>): boolean {
  const left = sortedServicePorts(a), right = sortedServicePorts(b);
  return left.length === right.length && left.every((port, i) => port === right[i]);
}
export type TopologyOperation = MoveOperation
  | InspectorOperation
  | { type: 'add-links' | 'remove-links'; label: string; links: HistoryLink[] }
  | { type: 'delete-devices'; label: string; devices: CreatedDevice[]; links: HistoryLink[]; colors: Record<string, string> }
  | { type: 'create-device'; label: string; device: CreatedDevice };
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
