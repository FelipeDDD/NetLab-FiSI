import { hasTerminalKind } from './engine/device';
import { Host, IpDevice } from './engine/ipdevice';
import { broadcastOf, ipToString, networkOf, sameSubnet } from './engine/ip';
import type { Device } from './engine/device';

export interface PingAddress { address: string; interfaces: string[] }
export interface QuickPingSelection {
  sourceId: string;
  targetId?: string;
  addresses?: PingAddress[];
  message?: string;
  pending?: boolean;
}

/** Configured addresses only: eligibility never promises reachability. */
export function pingAddresses(device: Device | undefined): PingAddress[] {
  if (!(device instanceof IpDevice)) return [];
  const addresses = new Map<string, PingAddress>();
  for (const iface of device.interfaces) {
    const ip = iface.ip;
    if (!ip || ip.addr >>> 24 === 0 || ip.addr >>> 24 === 127 || ip.addr >>> 24 >= 224) continue;
    if (ip.prefix < 31 && (ip.addr === networkOf(ip.addr, ip.prefix) || ip.addr === broadcastOf(ip.addr, ip.prefix))) continue;
    const address = ipToString(ip.addr);
    const entry = addresses.get(address) ?? { address, interfaces: [] };
    entry.interfaces.push(iface.name); addresses.set(address, entry);
  }
  return [...addresses.values()];
}

export function preferredPingAddress(source: IpDevice, target: Device): string | null {
  const addresses = pingAddresses(target);
  if (addresses.length === 1) return addresses[0].address;
  const local = target.interfaces.filter(iface => iface.ip && source.interfaces.some(from =>
    from.up && from.ip && sameSubnet(from.ip.addr, iface.ip!.addr, from.ip.prefix)))
    .map(iface => ipToString(iface.ip!.addr));
  const unique = addresses.filter(a => local.includes(a.address));
  return unique.length === 1 ? unique[0].address : null;
}

export function quickPingCommand(source: IpDevice, address: string): string {
  return `ping ${source instanceof Host && source.os === 'windows' ? '-n' : '-c'} 4 ${address}`;
}

export const canQuickPing = (device: Device | undefined): device is IpDevice =>
  device instanceof IpDevice && hasTerminalKind(device.kind);
