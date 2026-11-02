import type { NetInterface } from './engine/device';
import type { IpDevice, Route } from './engine/ipdevice';

export interface NetworkValueSource { value: number; source: string }
const ownSource = (iface: NetInterface) => iface.ipv4Mode === 'dhcp' ? 'DHCP' : 'Statisch · Schnittstelle';

const sameRoute = (a: Route, b: Route) => a.dest === b.dest && a.prefix === b.prefix && a.via === b.via && a.ifaceName === b.ifaceName && a.kind === b.kind;

/** Ask the engine at route boundaries, rather than assuming an arbitrary
 * public IP uses a default (it might have a more-specific route). */
export function defaultRouteSummary(device: IpDevice, iface: NetInterface) {
  const routes = device.routes();
  const boundaries = [0, ...routes.filter(r => r.prefix > 0).map(r => r.dest + 2 ** (32 - r.prefix)).filter(end => end < 2 ** 32)];
  let selected: Route | null = null;
  for (const destination of boundaries) {
    const candidate = device.lookupRoute(destination);
    if (candidate?.prefix === 0) { selected = candidate; break; }
  }
  const explicit = device.staticRoutes.filter(r => r.prefix === 0 && r.ifaceName === iface.name);
  const learned = routes.filter(r => r.prefix === 0 && r.kind === 'rip' && r.ifaceName === iface.name);
  const selectedSource = selected && (selected.kind === 'rip' ? 'RIP' : device.staticRoutes.some(r => sameRoute(r, selected!)) ? 'Explizite Route' : 'Schnittstellen-Gateway');
  const usableDefaults = routes.filter(route => {
    if (route.prefix !== 0) return false;
    const outgoing = device.getInterface(route.ifaceName);
    return !!outgoing?.up && !!outgoing.link &&
      (device.kind !== 'notebook' && device.kind !== 'smartphone' || outgoing.link.operational);
  });
  return { explicit, learned, selected, selectedSource,
    competing: new Set(usableDefaults.map(r => `${r.ifaceName}:${r.via}`)).size > 1,
    multiple: new Set(routes.filter(r => r.prefix === 0).map(r => `${r.ifaceName}:${r.via}`)).size > 1 };
}

/** Compact overview: competing next hops are explained in Netzwerk instead of
 * presenting the simulator's order-based tie-break as a unique gateway. */
export function selectedDefaultGateway(device: IpDevice, iface: NetInterface): number | null {
  const { selected, competing } = defaultRouteSummary(device, iface);
  return selected?.ifaceName === iface.name && !competing ? selected.via : null;
}

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
  const owner = device.interfaces.find((candidate) => candidate.up && candidate.ip && candidate.dns !== null && (device.kind !== 'notebook' && device.kind !== 'smartphone' || candidate.link?.operational));
  return owner ? { value: owner.dns!, source: `${ownSource(owner)}${owner === iface ? '' : ` · ${owner.name}`}` } : null;
}
