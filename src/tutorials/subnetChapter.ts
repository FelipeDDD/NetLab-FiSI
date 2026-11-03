import type { Network } from '../engine/network';
import { Host } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { parseIp, sameSubnet } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';
import { FIRST_DEVICES } from './firstConnection';

export const SUBNET_CHAPTER = { id: 'subnet-mask', version: 1, steps: 5 } as const;
export const SUBNET_PC_ID = 'tutorial-02-d';
export const SUBNET_DEMO_COMMAND = 'ping -c 8 192.168.10.10';
export const SUBNET_LINK_ID = 'tutorial-02-d-link';
export type SubnetWarning = 'missing' | 'conflict' | 'noPort' | 'network' | 'forms' | 'terminalBusy' | 'terminalInput' | 'demoRepeat';

/** Chapter 1 receipts exclude only the additional Chapter 2 device and cable. */
export function chapterOneSignature(net: Network): string {
  const topology = serializeNetwork(net, {});
  topology.devices = topology.devices.filter(d => d.id !== SUBNET_PC_ID);
  topology.links = topology.links.filter(l => l.a[0] !== SUBNET_PC_ID && l.b[0] !== SUBNET_PC_ID);
  return JSON.stringify(topology);
}
export function subnetPeers(net: Network, pcC: string) {
  const sw = net.devices.get(FIRST_DEVICES.sw);
  if (!(sw instanceof SwitchDevice) || sw.kind !== 'switch') return null;
  const peers = [[FIRST_DEVICES.a, '192.168.10.10'], [FIRST_DEVICES.b, '192.168.10.20'], [pcC, '192.168.10.30']] as const;
  const ports = peers.map(([id, address]) => {
    const d = net.devices.get(id), iface = d?.getInterface('eth0'), link = iface?.link;
    if (!(d instanceof Host) || d.kind !== 'host' || !iface?.up || iface.ip?.addr !== parseIp(address) || iface.ip.prefix !== 24 || !link?.operational) return null;
    const other = link.a === iface ? link.b : link.a;
    return other.device === sw ? other : null;
  });
  if (ports.some(p => !p) || ports.some(p => sw.vlanOf(p!.name) !== sw.vlanOf(ports[0]!.name))) return null;
  return { sw, vlan: sw.vlanOf(ports[0]!.name) };
}
export function subnetPreparationError(net: Network, pcC: string): SubnetWarning | null {
  if (!net.devices.has(FIRST_DEVICES.sw)) return 'missing';
  if (net.devices.has(SUBNET_PC_ID) || net.links.has(SUBNET_LINK_ID) || [...net.devices.values()].some(d => d.name.trim().toLowerCase() === 'pc d')) return 'conflict';
  const peers = subnetPeers(net, pcC);
  if (!peers) return 'network';
  return peers.sw.interfaces.some(i => !i.link && i.up && i.medium === 'ethernet' && peers.sw.vlanOf(i.name) === peers.vlan) ? null : 'noPort';
}
export function subnetDevice(net: Network, pcC: string) {
  const peers = subnetPeers(net, pcC), d = net.devices.get(SUBNET_PC_ID), iface = d?.getInterface('eth0'), link = iface?.link;
  if (!peers || !(d instanceof Host) || d.kind !== 'host' || d.os !== 'linux' || !iface?.up || iface.ip?.addr !== parseIp('192.168.10.12') || iface.gateway !== null || !link?.operational) return null;
  const other = link.a === iface ? link.b : link.a;
  return other.device === peers.sw && peers.sw.vlanOf(other.name) === peers.vlan ? { d, iface, peers } : null;
}
export function initialSubnetDevice(net: Network, pcC: string): boolean {
  const current = subnetDevice(net, pcC);
  return !!current && current.iface.ip!.prefix === 28 && current.d.staticRoutes.length === 0;
}
export function correctedSubnet(net: Network, pcC: string): boolean {
  const current = subnetDevice(net, pcC);
  return !!current && ['192.168.10.10', '192.168.10.20', '192.168.10.30'].every(address => {
    const target = parseIp(address)!, route = current.d.lookupRoute(target);
    return sameSubnet(current.iface.ip!.addr, target, current.iface.ip!.prefix) && route?.kind === 'connected' && route.ifaceName === 'eth0' && route.via === null;
  });
}
