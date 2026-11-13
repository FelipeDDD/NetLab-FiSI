import { IpDevice, type Route } from './engine/ipdevice';
import { parseCidr, parseIp, networkOf } from './engine/ip';

export type RouteEditError = 'stale' | 'cidr' | 'hostBits' | 'gateway' | 'iface' | 'duplicate' | 'missing' | 'ambiguous' | 'required';
export interface RouteEditInput { destination: string; gateway: string; iface: string }
const identities = new WeakMap<IpDevice, number>(); let sequence = 0;
export const routeEditSignature = (device: IpDevice) => {
  if (!identities.has(device)) identities.set(device, ++sequence);
  return JSON.stringify({ identity: identities.get(device), routes: device.staticRoutes, interfaces: device.interfaces.map(i => ({ name: i.name, mac: i.mac, up: i.up, ip: i.ip, gateway: i.gateway, link: i.link?.id, operational: i.link?.operational })) });
};
const sameTarget = (a: Route, b: Route) => a.dest === b.dest && a.prefix === b.prefix;
/** Synchronous staging: only an own route array is writable. The inherited
 * interface/network view is read by the existing engine validators; no device
 * is inserted, no packets/timers run, and the real array is never edited here. */
export function planStaticRouteEdit(device: IpDevice, expected: string, original: Route | null, input: RouteEditInput | null): { routes: Route[] } | { error: RouteEditError } {
  if (device.disposed || routeEditSignature(device) !== expected) return { error: 'stale' };
  const index = original ? device.staticRoutes.findIndex(r => JSON.stringify(r) === JSON.stringify(original)) : -1;
  if (original && index < 0) return { error: 'missing' };
  if (original && device.staticRoutes.filter(r => sameTarget(r, original)).length !== 1) return { error: 'ambiguous' };
  const staged = Object.create(device) as IpDevice;
  staged.staticRoutes = structuredClone(device.staticRoutes);
  let error: string | null;
  if (!input) {
    if (!original) return { error: 'missing' };
    error = staged.delRoute(original.dest, original.prefix);
  } else {
    const target = input.destination.trim() === 'default' ? { addr: 0, prefix: 0 } : parseCidr(input.destination.trim());
    if (!target) return { error: 'cidr' };
    if (networkOf(target.addr, target.prefix) !== target.addr) return { error: 'hostBits' };
    const via = input.gateway.trim() ? parseIp(input.gateway.trim()) : null;
    if (input.gateway.trim() && via === null) return { error: 'gateway' };
    const dev = input.iface || undefined;
    error = original && sameTarget(original, { ...original, dest: target.addr, prefix: target.prefix })
      ? staged.replaceRoute(target.addr, target.prefix, via, dev) : staged.addRoute(target.addr, target.prefix, via, dev);
    if (!error && original && !sameTarget(original, { ...original, dest: target.addr, prefix: target.prefix })) {
      const added = staged.staticRoutes.pop()!;
      error = staged.delRoute(original.dest, original.prefix);
      if (!error) staged.staticRoutes.splice(index, 0, added);
    }
  }
  if (error) return { error: error === 'RTNETLINK answers: File exists' ? 'duplicate' : error === 'RTNETLINK answers: No such process' ? 'missing' : error.startsWith('Cannot find device') ? 'iface' : error.includes('multiple static routes') ? 'ambiguous' : error.includes('invalid gateway') ? 'gateway' : 'required' };
  return { routes: staged.staticRoutes };
}
