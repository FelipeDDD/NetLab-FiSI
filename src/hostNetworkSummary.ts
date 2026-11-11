import type { NetInterface } from './engine/device';
import type { IpDevice, Route } from './engine/ipdevice';
import { translate, type Language } from './i18n';

export interface NetworkValueSource { value: number; source: string }
const ownSource = (iface: NetInterface, language: Language) => iface.ipv4Mode === 'dhcp' ? 'DHCP' : translate(language, 'navigation.gatewayStaticInterface');

const sameRoute = (a: Route, b: Route) => a.dest === b.dest && a.prefix === b.prefix && a.via === b.via && a.ifaceName === b.ifaceName && a.kind === b.kind;

/** Ask the engine at route boundaries, rather than assuming an arbitrary
 * public IP uses a default (it might have a more-specific route). */
export function defaultRouteSummary(device: IpDevice, iface: NetInterface, language: Language = 'de') {
  const routes = device.routes();
  const boundaries = [0, ...routes.filter(r => r.prefix > 0).map(r => r.dest + 2 ** (32 - r.prefix)).filter(end => end < 2 ** 32)];
  let selected: Route | null = null;
  for (const destination of boundaries) {
    const candidate = device.lookupRoute(destination);
    if (candidate?.prefix === 0) { selected = candidate; break; }
  }
  const explicit = device.staticRoutes.filter(r => r.prefix === 0 && r.ifaceName === iface.name);
  const learned = routes.filter(r => r.prefix === 0 && r.kind === 'rip' && r.ifaceName === iface.name);
  const selectedSource = selected && (selected.kind === 'connected' ? translate(language, 'navigation.gatewayConnected') : selected.kind === 'rip' ? 'RIP' : device.staticRoutes.some(r => sameRoute(r, selected!)) ? translate(language, 'navigation.gatewayExplicit') : translate(language, 'navigation.gatewayInterface'));
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

export function hostGatewaySummary(device: IpDevice, iface: NetInterface, language: Language = 'de'): NetworkValueSource[] {
  const values: NetworkValueSource[] = [];
  // Identify by ownership, not address equality: a user route and an interface
  // option can legitimately have the same gateway while remaining independent.
  for (const route of device.staticRoutes) {
    if (route.prefix === 0 && route.ifaceName === iface.name && route.via !== null) {
      values.push({ value: route.via, source: translate(language, 'navigation.gatewayExplicit') });
    }
  }
  if (iface.up && iface.ip && iface.gateway !== null) values.push({ value: iface.gateway, source: ownSource(iface, language) });
  for (const route of device.routes()) {
    if (route.kind === 'rip' && route.prefix === 0 && route.ifaceName === iface.name && route.via !== null) {
      values.push({ value: route.via, source: 'RIP' });
    }
  }
  return values;
}

export function hostDnsSummary(device: IpDevice, iface: NetInterface, language: Language = 'de'): NetworkValueSource | null {
  if (device.manualNameserver !== null) return { value: device.manualNameserver, source: translate(language, 'navigation.dnsOverrideSource') };
  const owner = device.interfaces.find((candidate) => candidate.up && candidate.ip && candidate.dns !== null && (device.kind !== 'notebook' && device.kind !== 'smartphone' || candidate.link?.operational));
  return owner ? { value: owner.dns!, source: `${ownSource(owner, language)}${owner === iface ? '' : ` · ${owner.name}`}` } : null;
}
