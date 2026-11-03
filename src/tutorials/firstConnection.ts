import type { ProjectDocument } from '../projects/types';
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';

/** Chapter identity is independent of Beta exercises and saved topology versions.
 * Later chapters must extend the current draft; only a new lab calls this factory. */
export interface GuidedChapter {
  id: string;
  version: number;
  steps: readonly ('cable' | 'ipv4' | 'ping' | 'stop-ping' | 'add-pc' | 'cable-c' | 'ipv4-c' | 'ping-c')[];
}
export const FIRST_CONNECTION: GuidedChapter = { id: 'first-connection', version: 1, steps: ['cable', 'ipv4', 'ping', 'stop-ping', 'add-pc', 'cable-c', 'ipv4-c', 'ping-c'] };
export const FIRST_DEVICES = { a: 'tutorial-01-a', sw: 'tutorial-01-switch', b: 'tutorial-01-b' } as const;

export function firstConnectionDocument(): ProjectDocument {
  const { a, sw, b } = FIRST_DEVICES;
  return { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [
    { id: a, kind: 'host', name: 'PC A', x: 100, y: 280, os: 'linux', forwarding: false,
      ifaces: [{ name: 'eth0', ip: null, up: true }], routes: [] },
    { id: sw, kind: 'switch', name: 'Switch', x: 440, y: 280, forwarding: false,
      ifaces: Array.from({ length: 8 }, (_, i) => ({ name: 'eth' + i, ip: null, up: true })), routes: [] },
    { id: b, kind: 'host', name: 'PC B', x: 780, y: 280, os: 'linux', forwarding: false,
      ifaces: [{ name: 'eth0', ip: '192.168.10.20/24', up: true }], routes: [] },
  ], links: [{ id: 'tutorial-01-b-link', a: [sw, 'eth0'], b: [b, 'eth0'], latency: 80 }] } };
}

export function firstConnectionConditions(net: Network) {
  const { a, sw, b } = FIRST_DEVICES;
  const pcA = net.devices.get(a), pcB = net.devices.get(b), switchDevice = net.devices.get(sw);
  const exists = pcA instanceof IpDevice && pcA.kind === 'host' && pcB instanceof IpDevice && pcB.kind === 'host' && switchDevice?.kind === 'switch';
  const connected = (id: string) => [...net.links.values()].some(link =>
    link.a.device.id === id && link.b.device.id === sw || link.b.device.id === id && link.a.device.id === sw);
  const cable = exists && connected(a);
  const iface = pcA?.getInterface('eth0'), target = pcB?.getInterface('eth0');
  const ipv4 = exists && iface?.ip?.addr === parseIp('192.168.10.10') && iface.ip.prefix === 24;
  const ready = cable && ipv4 && iface?.up === true && target?.up === true &&
    target.ip?.addr === parseIp('192.168.10.20') && target.ip.prefix === 24 && connected(b);
  return { exists, cable, ipv4, ready };
}
