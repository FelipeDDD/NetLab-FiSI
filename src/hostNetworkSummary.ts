import type { NetInterface } from './engine/device';
import type { IpDevice } from './engine/ipdevice';

export interface NetworkValueSource { value: number; source: string }
const ownSource = (iface: NetInterface) => iface.ipv4Mode === 'dhcp' ? 'DHCP' : 'Statisch · Schnittstelle';

export function hostGatewaySummary(device: IpDevice, iface: NetInterface): NetworkValueSource[] {
  const values: NetworkValueSource[] = [];
  // Identify by ownership, not address equality: a user route and an interface
  // option can legitimately have the same gateway while remaining independent.
  for (const route of device.staticRoutes) {
    if (route.prefix === 0 && route.ifaceName === iface.name && route.via !== null) {
      values.push({ value: route.via, source: 'Explizite Route' });
    }
  }
  if (iface.up && iface.ip && iface.gateway !== null) values.push({ value: iface.gateway, source: ownSource(iface) });
  for (const route of device.routes()) {
    if (route.kind === 'rip' && route.prefix === 0 && route.ifaceName === iface.name && route.via !== null) {
      values.push({ value: route.via, source: 'RIP' });
    }
  }
  return values;
}

export function hostDnsSummary(device: IpDevice, iface: NetInterface): NetworkValueSource | null {
  if (device.manualNameserver !== null) return { value: device.manualNameserver, source: 'Globaler Override' };
  const owner = device.interfaces.find((candidate) => candidate.up && candidate.ip && candidate.dns !== null);
  return owner ? { value: owner.dns!, source: `${ownSource(owner)}${owner === iface ? '' : ` · ${owner.name}`}` } : null;
}
