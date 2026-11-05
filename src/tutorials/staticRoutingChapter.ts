import type { Network } from '../engine/network';
import { Host, IpDevice, RouterDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { parseIp, networkOf, ipToString } from '../engine/ip';
import { serializeNetwork, type SavedDevice, type SavedLink } from '../engine/serialize';
import type { ProjectDocument } from '../projects/types';

export const STATIC_CHAPTER = { id: 'static-routing', version: 1, steps: 8 } as const;
export const STATIC_IDS = { a: 'tutorial-04-a', sa: 'tutorial-04-sa', r1: 'tutorial-04-r1', r2: 'tutorial-04-r2', r3: 'tutorial-04-r3', sb: 'tutorial-04-sb', b: 'tutorial-04-b', sc: 'tutorial-04-sc', c: 'tutorial-04-c' } as const;
export const STATIC_BASE_IDS: readonly string[] = [STATIC_IDS.a, STATIC_IDS.sa, STATIC_IDS.r1, STATIC_IDS.r2, STATIC_IDS.r3, STATIC_IDS.sb, STATIC_IDS.b];
export const STATIC_EXTENSION_IDS: readonly string[] = [STATIC_IDS.sc, STATIC_IDS.c];
export const STATIC_EXTENSION_LINKS = ['tutorial-04-r2-c', 'tutorial-04-c-link'];
export const STATIC_PAIRS = ['ab', 'ba', 'ac', 'ca', 'bc', 'cb'] as const;
export type StaticPair = typeof STATIC_PAIRS[number];
export type StaticWarning = 'forms' | 'missing' | 'network' | 'port' | 'conflict';
export interface StaticExtensionIdentity { pcMac: string; switchMacs: string[] }
const ip = (s: string) => parseIp(s)!;
const interfaces = (addresses: (string | null)[]) => addresses.map((address, i) => ({ name: `eth${i}`, ip: address, ipv4Mode: address ? 'static' as const : 'unconfigured' as const, up: true }));
export function staticRoutingDocument(): ProjectDocument {
  const I = STATIC_IDS;
  const host = (id: string, name: string, x: number, address: string, gateway: string): SavedDevice => ({ id, kind: 'host', os: 'linux', name, x, y: 260, forwarding: false, routes: [], ifaces: [{ name: 'eth0', up: true, ip: address, ipv4Mode: 'static', gateway }] });
  const sw = (id: string, name: string, x: number): SavedDevice => ({ id, kind: 'switch', name, x, y: 300, forwarding: false, routes: [], ifaces: interfaces(Array(8).fill(null)) });
  const router = (id: string, name: string, x: number, addresses: (string | null)[]): SavedDevice => ({ id, kind: 'router', os: 'linux', name, x, y: 300, forwarding: true, routes: [], ifaces: interfaces(addresses) });
  const links: SavedLink[] = [
    { id: 'tutorial-04-a-link', a: [I.a, 'eth0'], b: [I.sa, 'eth0'] },
    { id: 'tutorial-04-lan-a', a: [I.sa, 'eth1'], b: [I.r1, 'eth0'] },
    { id: 'tutorial-04-transit-12', a: [I.r1, 'eth1'], b: [I.r2, 'eth0'] },
    { id: 'tutorial-04-transit-23', a: [I.r2, 'eth1'], b: [I.r3, 'eth0'] },
    { id: 'tutorial-04-lan-b', a: [I.r3, 'eth1'], b: [I.sb, 'eth1'] },
    { id: 'tutorial-04-b-link', a: [I.sb, 'eth0'], b: [I.b, 'eth0'] },
  ];
  return { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [
    host(I.a, 'PC A', 0, '192.168.10.10/24', '192.168.10.1'), sw(I.sa, 'Switch A', 280),
    router(I.r1, 'R1', 580, ['192.168.10.1/24', '10.0.12.1/30', null, null]),
    router(I.r2, 'R2', 1020, ['10.0.12.2/30', '10.0.23.1/30', null, null]),
    router(I.r3, 'R3', 1460, ['10.0.23.2/30', '192.168.20.1/24', null, null]),
    sw(I.sb, 'Switch B', 1760), host(I.b, 'PC B', 2040, '192.168.20.20/24', '192.168.20.1'),
  ], links: links.map(l => ({ ...l, latency: 40 })) } };
}
/** Configuration identity deliberately excludes positions and transient caches. */
export const staticRoutingSignature = (net: Network) => JSON.stringify(serializeNetwork(net, {}));
const device = (net: Network, id: string) => { const d = net.devices.get(id); return d instanceof IpDevice ? d : null; };
const linked = (net: Network, a: string, ai: string, b: string, bi: string) => {
  const i = net.devices.get(a)?.getInterface(ai), j = net.devices.get(b)?.getInterface(bi), l = i?.link;
  return !!i?.up && !!j?.up && !!l?.operational && l.medium === 'ethernet' && j.link === l;
};
export function staticBaseReady(net: Network): boolean {
  const I = STATIC_IDS, routers = [I.r1, I.r2, I.r3];
  if (!routers.every(id => net.devices.get(id) instanceof RouterDevice && device(net, id)!.forwarding && !device(net, id)!.ripEnabled) ||
      ![I.sa, I.sb].every(id => net.devices.get(id) instanceof SwitchDevice) || ![I.a, I.b].every(id => net.devices.get(id) instanceof Host)) return false;
  const expected: [string, string, string, number][] = [[I.a, 'eth0', '192.168.10.10', 24], [I.r1, 'eth0', '192.168.10.1', 24], [I.r1, 'eth1', '10.0.12.1', 30], [I.r2, 'eth0', '10.0.12.2', 30], [I.r2, 'eth1', '10.0.23.1', 30], [I.r3, 'eth0', '10.0.23.2', 30], [I.r3, 'eth1', '192.168.20.1', 24], [I.b, 'eth0', '192.168.20.20', 24]];
  if (!expected.every(([id, name, address, prefix]) => { const i = device(net, id)?.getInterface(name); return i?.up && i.ip?.addr === ip(address) && i.ip.prefix === prefix && [...net.devices.values()].flatMap(d => d.interfaces).filter(j => j.ip?.addr === i.ip!.addr).length === 1; })) return false;
  const wiring: [string, string, string, string][] = [[I.a, 'eth0', I.sa, 'eth0'], [I.sa, 'eth1', I.r1, 'eth0'], [I.r1, 'eth1', I.r2, 'eth0'], [I.r2, 'eth1', I.r3, 'eth0'], [I.r3, 'eth1', I.sb, 'eth1'], [I.sb, 'eth0', I.b, 'eth0']];
  if (!wiring.every(args => linked(net, ...args))) return false;
  if ([I.sa, I.sb].some(id => { const sw = net.devices.get(id) as SwitchDevice; return sw.vlanOf('eth0') !== sw.vlanOf('eth1'); })) return false;
  return [[I.a, '192.168.20.20', '192.168.10.1'], [I.b, '192.168.10.10', '192.168.20.1']].every(([id, target, hop]) => { const r = device(net, id)!.lookupRoute(ip(target)); return r?.via === ip(hop) && r.ifaceName === 'eth0'; });
}
/** Inspect every route boundary inside the LAN, not just the two PCs. This
 * accepts equivalent aggregates/split routes and detects narrower wrong hops. */
function staticHop(net: Network, id: string, lan: string, iface: string, via: string) {
  const d = device(net, id); if (!d) return false;
  const low = ip(lan) + 1, high = ip(lan) + 254, targets = new Set([low, high]);
  for (const r of d.routes()) {
    const start = Math.max(low, r.dest), end = Math.min(high, r.dest + 2 ** (32 - r.prefix) - 1);
    if (start <= end) { targets.add(start); targets.add(end); if (start > low) targets.add(start - 1); if (end < high) targets.add(end + 1); }
  }
  return [...targets].every(target => {
    const r = d.lookupRoute(target), hop = d.lookupRoute(ip(via));
    return r?.kind === 'static' && r.ifaceName === iface && r.via === ip(via) && hop?.kind === 'connected' && hop.ifaceName === iface;
  });
}
export function staticRoutingConditions(net: Network) {
  const I = STATIC_IDS, base = staticBaseReady(net);
  const forward = base && staticHop(net, I.r1, '192.168.20.0', 'eth1', '10.0.12.2') && staticHop(net, I.r2, '192.168.20.0', 'eth1', '10.0.23.2');
  const backward = base && staticHop(net, I.r3, '192.168.10.0', 'eth0', '10.0.23.1') && staticHop(net, I.r2, '192.168.10.0', 'eth0', '10.0.12.1');
  const ci = device(net, I.c)?.getInterface('eth0'), ri = device(net, I.r2)?.getInterface('eth2'), sw = net.devices.get(I.sc);
  const usable = (addr: number) => networkOf(addr, 24) === ip('192.168.30.0') && addr % 256 > 0 && addr % 256 < 255 && [...net.devices.values()].flatMap(d => d.interfaces).filter(i => i.ip?.addr === addr).length === 1;
  const lanC = base && net.devices.get(I.c) instanceof Host && sw instanceof SwitchDevice && sw.vlanOf('eth0') === sw.vlanOf('eth1') && linked(net, I.r2, 'eth2', I.sc, 'eth1') && linked(net, I.c, 'eth0', I.sc, 'eth0') && !!ci?.ip && ci.ip.prefix === 24 && usable(ci.ip.addr) && !!ri?.ip && ri.ip.prefix === 24 && usable(ri.ip.addr) && ['192.168.10.10', '192.168.20.20'].every(target => { const route = device(net, I.c)!.lookupRoute(ip(target)); return route?.prefix === 0 && route.ifaceName === 'eth0' && route.via === ri.ip!.addr; });
  const toC = !!lanC && forward && backward && staticHop(net, I.r1, '192.168.30.0', 'eth1', '10.0.12.2') && staticHop(net, I.r3, '192.168.30.0', 'eth0', '10.0.23.1');
  // First absent route on the actual forward chain. Wrong next hops are not
  // reported as an absent route, and never pass the route-configuration tasks.
  const firstMissing = !base ? null : !device(net, I.r1)!.lookupRoute(ip('192.168.20.20')) ? I.r1 : staticHop(net, I.r1, '192.168.20.0', 'eth1', '10.0.12.2') && !device(net, I.r2)!.lookupRoute(ip('192.168.20.20')) ? I.r2 : null;
  return { base, forward, backward, lanC: !!lanC, toC, firstMissing };
}
export function staticTarget(net: Network, key: 'a' | 'b' | 'c') { const address = device(net, STATIC_IDS[key])?.getInterface('eth0')?.ip?.addr; return address === undefined ? null : ipToString(address); }
export function staticExtensionIdentity(net: Network): StaticExtensionIdentity | null {
  const pc = net.devices.get(STATIC_IDS.c), sw = net.devices.get(STATIC_IDS.sc);
  return pc instanceof Host && pc.interfaces.length === 1 && sw instanceof SwitchDevice && sw.interfaces.length === 8 ? { pcMac: pc.interfaces[0].mac, switchMacs: sw.interfaces.map(i => i.mac) } : null;
}
export function initialStaticExtension(net: Network): boolean {
  const I = STATIC_IDS, pc = device(net, I.c), ri = device(net, I.r2)?.getInterface('eth2'), sw = net.devices.get(I.sc);
  return !!staticExtensionIdentity(net) && pc instanceof Host && pc.name === 'PC C' && pc.os === 'linux' && !pc.forwarding && pc.interfaces[0].ipv4Mode === 'unconfigured' && !pc.interfaces[0].ip && pc.interfaces[0].gateway === null && pc.staticRoutes.length === 0 && !!ri && sw instanceof SwitchDevice && sw.name === 'Switch C' && sw.interfaces.every((iface, index) => iface.up && !iface.ip && sw.vlanOf(iface.name) === 1 && (index < 2 || !iface.link)) && linked(net, I.c, 'eth0', I.sc, 'eth0') && linked(net, I.r2, 'eth2', I.sc, 'eth1') && ri.link?.id === STATIC_EXTENSION_LINKS[0] && pc.interfaces[0].link?.id === STATIC_EXTENSION_LINKS[1];
}
export function staticExpansionError(net: Network): StaticWarning | null {
  if (STATIC_EXTENSION_IDS.some(id => net.devices.has(id))) return initialStaticExtension(net) ? null : 'conflict';
  if (STATIC_EXTENSION_LINKS.some(id => net.links.has(id))) return 'conflict';
  const port = net.devices.get(STATIC_IDS.r2)?.getInterface('eth2');
  return !port ? 'missing' : port.link || !port.up ? 'port' : null;
}
