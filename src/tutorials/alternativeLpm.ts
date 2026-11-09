import type { Network } from '../engine/network';
import { Host, IpDevice, RouterDevice } from '../engine/ipdevice';
import { parseCidr, parseIp, networkOf } from '../engine/ip';
import { serializeNetwork, type SaveFile } from '../engine/serialize';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_ROUTERS, ALTERNATIVE_PCS } from './alternativePathsChapter';

export interface LpmProgress {
  stage: 'unprepared' | 'preparing' | 'ready'; baseline: string[] | null;
  pc: { id: string; mac: string } | null; localReply: string | null; pathReply: string | null;
  /** Credit for the old theoretical activity, never evidence of new packets. */
  legacy: boolean;
}
export const emptyLpm = (): LpmProgress => ({ stage: 'unprepared', baseline: null, pc: null, localReply: null, pathReply: null, legacy: false });
export const LPM_GATEWAY = '192.168.30.129', LPM_ADDRESS = '192.168.30.130';
const ip = (s: string) => parseIp(s)!;
const ranges = ['192.168.10.0/24', '192.168.20.0/24', '10.0.12.0/30', '10.0.23.0/30', '10.0.13.0/30'].map(s => parseCidr(s)!);
const intersects = (dest: string) => {
  const r = parseCidr(dest); if (!r) return true;
  const low = networkOf(r.addr, r.prefix), high = low + 2 ** (32 - r.prefix) - 1;
  return ranges.some(n => low <= n.addr + 2 ** (32 - n.prefix) - 1 && high >= n.addr);
};
/** Only configuration relevant to A/B and the transit links witnesses A↔B.
 * Keep the old full signatures available in the controller for legacy receipts. */
function abProjection(topology: SaveFile) {
  const owned: readonly string[] = [...ALTERNATIVE_ROUTERS, ...ALTERNATIVE_PCS];
  topology.devices = topology.devices.filter(d => owned.includes(d.id)).map(d => ({ ...d,
    ifaces: d.ifaces.filter(i => d.id !== I.r3 || i.name !== 'eth3'), routes: d.routes.filter(r => intersects(r.dest)) }));
  topology.links = topology.links.filter(l => owned.includes(l.a[0]) && owned.includes(l.b[0]));
  topology.devices.sort((a, b) => a.id.localeCompare(b.id)); topology.links.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(topology);
}
export const abSignature = (net: Network) => abProjection(serializeNetwork(net, {}));
export function lpmPortError(net: Network) {
  const r = net.devices.get(I.r3), p = r?.getInterface('eth3');
  return !(r instanceof RouterDevice) || !p || !p.up || !!p.link || !!p.ip && (p.ip.addr !== ip(LPM_GATEWAY) || p.ip.prefix !== 25) || !!p.gateway;
}
/** Binding requires an explicit physical connection to the reserved port, not
 * merely the first new Linux host. Pre-existing independent PCs are excluded. */
export function findLpmPc(net: Network, baseline: readonly string[]) {
  const port = net.devices.get(I.r3)?.getInterface('eth3'), link = port?.link;
  if (!link || link.medium !== 'ethernet') return null;
  const peer = link.a === port ? link.b : link.a, pc = peer.device;
  return pc instanceof Host && pc.kind === 'host' && pc.os === 'linux' && pc.interfaces.length === 1 && peer.name === 'eth0' && !baseline.includes(pc.id) ? { id: pc.id, mac: peer.mac } : null;
}
export function lpmPcValid(net: Network, p: LpmProgress) {
  const pc = net.devices.get(p.pc?.id ?? ''), i = pc?.getInterface('eth0'), r = net.devices.get(I.r3)?.getInterface('eth3');
  const unique = (addr: number) => [...net.devices.values()].flatMap(d => d.interfaces).filter(i => i.ip?.addr === addr).length === 1;
  const gateway = pc instanceof IpDevice ? pc.lookupRoute(ip('192.168.10.10')) : null;
  return !!(p.stage === 'ready' && pc instanceof Host && pc.kind === 'host' && pc.os === 'linux' && pc.interfaces.length === 1 && !!i && i.mac === p.pc?.mac &&
    i.up && r?.up && i.link?.operational && i.link === r.link && i.ip?.addr === ip(LPM_ADDRESS) && i.ip.prefix === 25 &&
    r.ip?.addr === ip(LPM_GATEWAY) && r.ip.prefix === 25 && gateway?.prefix === 0 && gateway.ifaceName === 'eth0' && gateway.via === ip(LPM_GATEWAY) && unique(i.ip.addr) && unique(r.ip.addr));
}
export function lpmRoutesReady(net: Network, p: LpmProgress) {
  if (!lpmPcValid(net, p)) return false;
  const r1 = net.devices.get(I.r1), r2 = net.devices.get(I.r2);
  if (!(r1 instanceof IpDevice) || !(r2 instanceof IpDevice)) return false;
  const route = (dest: string, prefix: number, via: string, iface: string) => {
    const entries = r1.staticRoutes.filter(r => r.dest === ip(dest) && r.prefix === prefix);
    return entries.length === 1 && entries[0].via === ip(via) && entries[0].ifaceName === iface;
  };
  // Verify R2 can forward the whole usable /25, not just this one host.
  const r2Forwards = Array.from({ length: 126 }, (_, n) => r2.lookupRoute(ip('192.168.30.129') + n)).every(r => r?.kind === 'static' && r.via === ip('10.0.23.2') && r.ifaceName === 'eth1');
  const chosen = r1.lookupRoute(ip(LPM_ADDRESS));
  return route('192.168.30.0', 24, '10.0.12.2', 'eth0') && route('192.168.30.128', 25, '10.0.13.2', 'eth1') && r2Forwards && chosen?.prefix === 25 && chosen.via === ip('10.0.13.2') && chosen.ifaceName === 'eth1';
}
export function lpmLocalSignature(net: Network, pcId: string) {
  const t = serializeNetwork(net, {}), pc = net.devices.get(pcId), router = net.devices.get(I.r3);
  return JSON.stringify({ devices: t.devices.filter(d => [pcId, I.r3].includes(d.id)).map(d => ({ id: d.id, kind: d.kind, os: d.os, forwarding: d.forwarding, firewall: d.firewall, ifaces: d.ifaces.filter(i => d.id === pcId || i.name === 'eth3') })),
    links: t.links.filter(l => l.a[0] === pcId || l.b[0] === pcId),
    choices: [pc instanceof IpDevice ? pc.lookupRoute(ip(LPM_GATEWAY)) : null, router instanceof IpDevice ? router.lookupRoute(ip(LPM_ADDRESS)) : null] });
}
export function lpmPathSignature(net: Network, pcId: string) {
  const t = serializeNetwork(net, {}), owned: readonly string[] = [...ALTERNATIVE_ROUTERS, I.a, pcId];
  t.devices = t.devices.filter(d => owned.includes(d.id)).map(d => ({ ...d, routes: d.routes.filter(r => intersects(r.dest) || (() => { const p = parseCidr(r.dest); return !p || networkOf(ip(LPM_ADDRESS), p.prefix) === networkOf(p.addr, p.prefix); })()) }));
  t.links = t.links.filter(l => owned.includes(l.a[0]) && owned.includes(l.b[0]));
  t.devices.sort((a, b) => a.id.localeCompare(b.id)); t.links.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(t);
}
export const lpmPaths = (pcId: string) => ({ request: [I.a, I.r1, I.r3, pcId], reply: [pcId, I.r3, I.r2, I.r1, I.a] });
