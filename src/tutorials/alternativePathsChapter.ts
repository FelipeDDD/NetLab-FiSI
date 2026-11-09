import type { Network } from '../engine/network';
import { Host, IpDevice, RouterDevice } from '../engine/ipdevice';
import { parseIp, networkOf, ipToString } from '../engine/ip';
import { serializeNetwork, type SavedLink } from '../engine/serialize';
import type { ProjectDocument } from '../projects/types';

export const ALTERNATIVE_IDS = { r1: 'tutorial-05-r1', r2: 'tutorial-05-r2', r3: 'tutorial-05-r3', a: 'tutorial-05-a', b: 'tutorial-05-b' } as const;
export const ALTERNATIVE_ROUTERS: readonly string[] = [ALTERNATIVE_IDS.r1, ALTERNATIVE_IDS.r2, ALTERNATIVE_IDS.r3];
export const ALTERNATIVE_PCS: readonly string[] = [ALTERNATIVE_IDS.a, ALTERNATIVE_IDS.b];
export const ALTERNATIVE_LINKS = { left: 'tutorial-05-12', right: 'tutorial-05-23', direct: 'tutorial-05-13', a: 'tutorial-05-a-link', b: 'tutorial-05-b-link' } as const;
const I = ALTERNATIVE_IDS, L = ALTERNATIVE_LINKS, ip = (address: string) => parseIp(address)!;
export const TRANSIT_PLAN = [
  { device: I.r1, iface: 'eth0', address: '10.0.12.1/30' }, { device: I.r2, iface: 'eth0', address: '10.0.12.2/30' },
  { device: I.r2, iface: 'eth1', address: '10.0.23.1/30' }, { device: I.r3, iface: 'eth0', address: '10.0.23.2/30' },
  { device: I.r1, iface: 'eth1', address: '10.0.13.1/30' }, { device: I.r3, iface: 'eth1', address: '10.0.13.2/30' },
] as const;
export const TRIANGLE_LINKS: SavedLink[] = [
  { id: L.left, a: [I.r1, 'eth0'], b: [I.r2, 'eth0'], latency: 40 },
  { id: L.right, a: [I.r2, 'eth1'], b: [I.r3, 'eth0'], latency: 40 },
  { id: L.direct, a: [I.r1, 'eth1'], b: [I.r3, 'eth1'], latency: 40 },
];
export const NEIGHBOR_TESTS = [
  { key: 'n12', from: I.r1, to: I.r2, target: '10.0.12.2', iface: 'eth0' }, { key: 'n21', from: I.r2, to: I.r1, target: '10.0.12.1', iface: 'eth0' },
  { key: 'n23', from: I.r2, to: I.r3, target: '10.0.23.2', iface: 'eth1' }, { key: 'n32', from: I.r3, to: I.r2, target: '10.0.23.1', iface: 'eth0' },
  { key: 'n13', from: I.r1, to: I.r3, target: '10.0.13.2', iface: 'eth1' }, { key: 'n31', from: I.r3, to: I.r1, target: '10.0.13.1', iface: 'eth1' },
] as const;
export type NeighborTest = typeof NEIGHBOR_TESTS[number]['key'];
export const ALTERNATIVE_TOTAL = 20;
export function alternativePart(step: number) {
  if (step <= 4) return { part: 1, start: 1, total: 4 };
  if (step <= 13) return { part: 2, start: 5, total: 9 };
  if (step <= 17) return { part: 3, start: 14, total: 4 };
  return { part: 4, start: 18, total: 3 };
}
export type AlternativeWarning = 'forms' | 'missing' | 'transit' | 'wiring' | 'port' | 'conflict' | 'lpmPort' | 'lpmIdentity';
export interface AlternativePcIdentity { a: string; b: string }
export function alternativePathsDocument(): ProjectDocument {
  return { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [
    { id: I.r1, name: 'R1', x: 420, y: 550 }, { id: I.r2, name: 'R2', x: 900, y: 120 }, { id: I.r3, name: 'R3', x: 1380, y: 550 },
  ].map(d => ({ ...d, kind: 'router', os: 'linux', forwarding: true, routes: [], ifaces: Array.from({ length: 4 }, (_, index) => ({ name: `eth${index}`, up: true, ip: null, ipv4Mode: 'unconfigured' })) })), links: structuredClone(TRIANGLE_LINKS) } };
}
const dev = (net: Network, id: string) => { const d = net.devices.get(id); return d instanceof IpDevice ? d : null; };
function matchesLink(net: Network, link: SavedLink, allowBroken: boolean) {
  const a = net.devices.get(link.a[0])?.getInterface(link.a[1]), b = net.devices.get(link.b[0])?.getInterface(link.b[1]);
  if (!a || !b) return false;
  const actual = net.links.get(link.id);
  if (!actual) return allowBroken && !a.link && !b.link;
  return actual.medium === 'ethernet' && a.link === actual && b.link === actual && (allowBroken || actual.operational);
}
export function triangleWiring(net: Network, allowBroken = false) {
  return ALTERNATIVE_ROUTERS.every(id => net.devices.get(id) instanceof RouterDevice && dev(net, id)!.forwarding && !dev(net, id)!.ripEnabled) && TRIANGLE_LINKS.every(link => matchesLink(net, link, allowBroken && link.id !== L.direct));
}
export function transitConfigured(net: Network, allowBroken = false) {
  return triangleWiring(net, allowBroken) && TRANSIT_PLAN.every(row => {
    const iface = net.devices.get(row.device)!.getInterface(row.iface), [address] = row.address.split('/');
    return iface?.ip?.addr === ip(address) && iface.ip.prefix === 30 && [...net.devices.values()].flatMap(d => d.interfaces).filter(i => i.ip?.addr === iface.ip!.addr).length === 1;
  });
}
/** The same address/uniqueness rules, limited to the link currently practised. */
export function transitLinkConfigured(net: Network, index: number) {
  return triangleWiring(net) && TRANSIT_PLAN.slice(index * 2, index * 2 + 2).every(row => {
    const iface = net.devices.get(row.device)?.getInterface(row.iface);
    return iface?.ip?.addr === ip(row.address.split('/')[0]) && iface.ip.prefix === 30 && [...net.devices.values()].flatMap(d => d.interfaces).filter(i => i.ip?.addr === iface.ip!.addr).length === 1;
  });
}
const canonical = (net: Network) => { const topology = serializeNetwork(net, {}); topology.devices.sort((a, b) => a.id.localeCompare(b.id)); topology.links.sort((a, b) => a.id.localeCompare(b.id)); return topology; };
export const alternativeSignature = (net: Network) => JSON.stringify(canonical(net));
/** Normalize only the two permitted link interruptions. IPs, routes, firewall,
 * identities, extra links and PC connectivity still have to match the witness. */
export function failureBaselineSignature(net: Network) {
  const t = canonical(net);
  for (const link of TRIANGLE_LINKS.filter(link => link.id !== L.direct)) {
    if (!t.links.some(actual => actual.id === link.id)) t.links.push({ id: link.id, latency: link.latency, a: [...link.a], b: [...link.b] });
    for (const [id, name] of [link.a, link.b]) { const iface = t.devices.find(d => d.id === id)?.ifaces.find(i => i.name === name); if (iface) iface.up = true; }
  }
  t.links.sort((a, b) => a.id.localeCompare(b.id)); return JSON.stringify(t);
}
export function neighborSignature(net: Network) {
  const t = canonical(net);
  return JSON.stringify({ routers: t.devices.filter(d => ALTERNATIVE_ROUTERS.includes(d.id)).map(d => ({ id: d.id, kind: d.kind, ifaces: d.ifaces.filter(i => i.name === 'eth0' || i.name === 'eth1'), forwarding: d.forwarding, ripEnabled: d.ripEnabled, firewall: d.firewall })),
    links: t.links.filter(link => TRIANGLE_LINKS.some(l => l.id === link.id)), choices: NEIGHBOR_TESTS.map(test => dev(net, test.from)?.lookupRoute(ip(test.target))) });
}
/** A later link's addressing must not erase a previous link's real ping proof.
 * Keep neighborSignature unchanged to recognize receipts from version 1. */
export function neighborLinkSignature(net: Network, index: number) {
  const t = canonical(net), tests = NEIGHBOR_TESTS.slice(index * 2, index * 2 + 2), link = TRIANGLE_LINKS[index];
  return JSON.stringify({ routers: t.devices.filter(d => tests.some(test => test.from === d.id)).map(d => ({ id: d.id, kind: d.kind, forwarding: d.forwarding, ripEnabled: d.ripEnabled, firewall: d.firewall,
    ifaces: d.ifaces.filter(i => tests.some(test => test.from === d.id && test.iface === i.name)) })),
    link: t.links.find(l => l.id === link.id), choices: tests.map(test => dev(net, test.from)?.lookupRoute(ip(test.target))) });
}
export const usedPathBroken = (net: Network) => TRIANGLE_LINKS.filter(link => link.id !== L.direct && !net.links.get(link.id)?.operational).length === 1;
function selectedHop(net: Network, id: string, lan: string, iface: string, via: string) {
  const d = dev(net, id); if (!d) return false;
  const low = ip(lan) + 1, high = ip(lan) + 254, samples = new Set([low, high]);
  for (const route of d.routes()) { const start = Math.max(low, route.dest), end = Math.min(high, route.dest + 2 ** (32 - route.prefix) - 1); if (start <= end) { samples.add(start); samples.add(end); if (start > low) samples.add(start - 1); if (end < high) samples.add(end + 1); } }
  const hop = d.lookupRoute(ip(via));
  return hop?.kind === 'connected' && hop.ifaceName === iface && !!d.getInterface(iface)?.link?.operational && [...samples].every(target => { const route = d.lookupRoute(target); return route?.kind === 'static' && route.ifaceName === iface && route.via === ip(via); });
}
export function alternativeTarget(net: Network, id: string) { const address = dev(net, id)?.getInterface('eth0')?.ip?.addr; return address === undefined ? null : ipToString(address); }
export function pcIdentity(net: Network): AlternativePcIdentity | null {
  const a = net.devices.get(I.a), b = net.devices.get(I.b);
  return a instanceof Host && a.kind === 'host' && a.interfaces.length === 1 && b instanceof Host && b.kind === 'host' && b.interfaces.length === 1 ? { a: a.interfaces[0].mac, b: b.interfaces[0].mac } : null;
}
export function initialAlternativePcs(net: Network) {
  return !!pcIdentity(net) && ([['a', I.r1, L.a], ['b', I.r3, L.b]] as const).every(([key, router, linkId]) => {
    const d = net.devices.get(I[key]) as Host, iface = d.interfaces[0];
    return d.name === `PC ${key.toUpperCase()}` && d.os === 'linux' && !d.forwarding && !iface.ip && iface.ipv4Mode === 'unconfigured' && iface.gateway === null && d.staticRoutes.length === 0 && matchesLink(net, { id: linkId, a: [d.id, 'eth0'], b: [router, 'eth2'] }, false);
  });
}
export function pcPreparationError(net: Network): AlternativeWarning | null {
  if (!transitConfigured(net)) return 'transit';
  if (ALTERNATIVE_PCS.some(id => net.devices.has(id))) return 'conflict';
  if ([L.a, L.b].some(id => net.links.has(id))) return 'conflict';
  return [I.r1, I.r3].some(id => { const port = net.devices.get(id)?.getInterface('eth2'); return !port || !port.up || !!port.link; }) ? 'port' : null;
}
export function alternativeConditions(net: Network) {
  const strict = transitConfigured(net), backbone = transitConfigured(net, true);
  const unique = (address: number) => [...net.devices.values()].flatMap(d => d.interfaces).filter(i => i.ip?.addr === address).length === 1;
  const lan = (pcId: string, routerId: string, linkId: string, base: string) => {
    const pc = net.devices.get(pcId), router = dev(net, routerId), i = pc?.getInterface('eth0'), r = router?.getInterface('eth2');
    const usable = (addr: number) => networkOf(addr, 24) === ip(base) && addr % 256 > 0 && addr % 256 < 255 && unique(addr);
    const route = pc instanceof IpDevice ? pc.lookupRoute(ip(base === '192.168.10.0' ? '192.168.20.20' : '192.168.10.10')) : null;
    return pc instanceof Host && !!i?.ip && i.ip.prefix === 24 && usable(i.ip.addr) && !!r?.ip && r.ip.prefix === 24 && usable(r.ip.addr) && route?.prefix === 0 && route.ifaceName === 'eth0' && route.via === r.ip.addr && matchesLink(net, { id: linkId, a: [pcId, 'eth0'], b: [routerId, 'eth2'] }, false);
  };
  const lanA = backbone && lan(I.a, I.r1, L.a, '192.168.10.0'), lanB = backbone && lan(I.b, I.r3, L.b, '192.168.20.0');
  const lans = lanA && lanB;
  const r1Forward = !!lans && strict && selectedHop(net, I.r1, '192.168.20.0', 'eth0', '10.0.12.2');
  const forward = r1Forward && selectedHop(net, I.r2, '192.168.20.0', 'eth1', '10.0.23.2');
  const r3Back = !!lans && strict && selectedHop(net, I.r3, '192.168.10.0', 'eth0', '10.0.23.1');
  const backward = r3Back && selectedHop(net, I.r2, '192.168.10.0', 'eth0', '10.0.12.1');
  const via = forward && backward;
  const direct = !!lans && selectedHop(net, I.r1, '192.168.20.0', 'eth1', '10.0.13.2') && selectedHop(net, I.r3, '192.168.10.0', 'eth1', '10.0.13.1');
  return { strict, backbone, lanA: !!lanA, lanB: !!lanB, lans: !!lans, r1Forward, forward, r3Back, backward, via, direct, broken: backbone && usedPathBroken(net) };
}
export function expectedPcPath(direction: 'ab' | 'ba', route: 'via' | 'direct') {
  const forward = route === 'via' ? [I.a, I.r1, I.r2, I.r3, I.b] : [I.a, I.r1, I.r3, I.b];
  return direction === 'ab' ? forward : [...forward].reverse();
}
