import type { Network } from '../engine/network';
import { Host, RouterDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { parseIp, sameSubnet, ipToString } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';
import type { ProjectDocument } from '../projects/types';
import { FIRST_DEVICES, firstConnectionDocument } from './firstConnection';
import { SUBNET_PC_ID, correctedSubnet, subnetPeers } from './subnetChapter';

export const ROUTER_CHAPTER = { id: 'two-networks', version: 2, steps: 8 } as const;
export const ROUTER_IDS = { router: 'tutorial-03-router', sw: 'tutorial-03-switch', e: 'tutorial-03-e', f: 'tutorial-03-f' } as const;
export const ROUTER_LINKS = { e: 'tutorial-03-e-link', f: 'tutorial-03-f-link' } as const;
export const DIRECT_C = 'tutorial-03-base-c';
export type RouterWarning = 'missing' | 'conflict' | 'noPort' | 'network' | 'forms' | 'cables' | 'interfaces' | 'hostIp' | 'gateways' | 'defaultRoute' | 'pcB' | 'repeatUnsafe' | 'diagnosisOther';
export const routerSignature = (net: Network) => JSON.stringify(serializeNetwork(net, {}));

export function routerDirectDocument(): ProjectDocument {
  const document = firstConnectionDocument(), t = document.topology;
  // Rounded coordinates from the Chapter 3 reference; earlier chapters keep their layout.
  Object.assign(t.devices[0], { x: 255, y: 56 });
  Object.assign(t.devices[1], { x: 371, y: 280 });
  Object.assign(t.devices[2], { x: 570, y: 56 });
  t.devices[0].ifaces[0].ip = '192.168.10.10/24';
  t.devices.push({ id: DIRECT_C, kind: 'host', name: 'PC C', x: 255, y: 493, os: 'linux', forwarding:false, ifaces: [{ name: 'eth0', up: true, ip: '192.168.10.30/24' }], routes: [] },
    { id: SUBNET_PC_ID, kind: 'host', name: 'PC D', x: 570, y: 493, os: 'linux', forwarding:false, ifaces: [{ name: 'eth0', up: true, ip: '192.168.10.12/24' }], routes: [] });
  for (const [id, port] of [[FIRST_DEVICES.a, 'eth1'], [DIRECT_C, 'eth2'], [SUBNET_PC_ID, 'eth3']]) t.links.push({ id: `direct-${id}`, a: [id, 'eth0'], b: [FIRST_DEVICES.sw, port], latency: 80 });
  return document;
}
export function routerPreparationError(net: Network, pcC: string): RouterWarning | null {
  if (!(net.devices.get(FIRST_DEVICES.sw) instanceof SwitchDevice)) return 'missing';
  if (Object.values(ROUTER_IDS).some(id => net.devices.has(id)) || Object.values(ROUTER_LINKS).some(id => net.links.has(id)) || [...net.devices.values()].some(d => ['router', 'switch b', 'pc e', 'pc f'].includes(d.name.trim().toLowerCase()))) return 'conflict';
  const peers = subnetPeers(net, pcC);
  if (!peers || !correctedSubnet(net, pcC)) return 'network';
  return peers.sw.interfaces.some(i => !i.link && i.up && i.medium === 'ethernet' && peers.sw.vlanOf(i.name) === peers.vlan) ? null : 'noPort';
}
const host = (net: Network, id: string) => { const d = net.devices.get(id); return d instanceof Host && d.kind === 'host' && d.os === 'linux' ? d : null; };
const portOn = (device: Host, sw: SwitchDevice) => {
  const i = device.getInterface('eth0'), l = i?.link;
  if (!i?.up || !l?.operational || l.medium === 'wireless') return null;
  const other = l.a === i ? l.b : l.a;
  return other.device === sw ? other : null;
};
const usable = (address: number, base: string) => sameSubnet(address, parseIp(base)!, 24) && address % 256 > 0 && address % 256 < 255;
export const routerTarget = (net:Network) => { const ip=net.devices.get(ROUTER_IDS.f)?.getInterface('eth0')?.ip;return ip?ipToString(ip.addr):null; };
export function routerConditions(net: Network, pcC: string) {
  const router = net.devices.get(ROUTER_IDS.router), swA = net.devices.get(FIRST_DEVICES.sw), swB = net.devices.get(ROUTER_IDS.sw);
  const a = host(net, FIRST_DEVICES.a), b=host(net,FIRST_DEVICES.b), e = host(net, ROUTER_IDS.e), f = host(net, ROUTER_IDS.f);
  const exists = router instanceof RouterDevice && swA instanceof SwitchDevice && swB instanceof SwitchDevice && !!a && !!b && !!e && !!f && !!host(net, pcC) && !!host(net, SUBNET_PC_ID);
  if (!exists) return { exists: false, cables: false, interfaces: false, hostIp: false, gateways: false, defaultRoute:false, bReady:false } as const;
  const aPort = portOn(a, swA), ePort = portOn(e, swB), fPort = portOn(f, swB);
  const side = (sw: SwitchDevice, port: typeof aPort) => router.interfaces.filter(i => {
    const l = i.link; if (!i.up || !l?.operational || l.medium === 'wireless' || !port) return false;
    const other = l.a === i ? l.b : l.a;
    return other.device === sw && sw.vlanOf(other.name) === sw.vlanOf(port.name);
  });
  const left = side(swA, aPort), right = side(swB, ePort);
  const cables = left.length === 1 && right.length === 1 && !!ePort;
  const unique = (address: number, iface: typeof router.interfaces[number]) => ![...net.devices.values()].some(d => d.interfaces.some(i => i !== iface && i.ip?.addr === address));
  const sideIp = (i: typeof router.interfaces[number] | undefined, base: string) => !!i?.ip && i.ip.prefix === 24 && usable(i.ip.addr, base) && unique(i.ip.addr, i);
  const interfaces = cables && router.forwarding && sideIp(left[0], '192.168.10.0') && sideIp(right[0], '192.168.20.0');
  const fi = f.getInterface('eth0'), ei = e.getInterface('eth0'), ai = a.getInterface('eth0');
  const hostIp = interfaces && !!fPort && !!ePort && swB.vlanOf(fPort.name)===swB.vlanOf(ePort.name) && !!fi?.ip && fi.ip.prefix === 24 && usable(fi.ip.addr, '192.168.20.0') && unique(fi.ip.addr, fi);
  const gateways = hostIp && ai?.ip?.addr === parseIp('192.168.10.10') && ai.ip.prefix === 24 && ei?.ip?.addr === parseIp('192.168.20.10') && ei.ip.prefix === 24 &&
    ai.gateway === left[0].ip!.addr && a.lookupRoute(fi!.ip!.addr)?.via === ai.gateway;
  const route=f.lookupRoute(parseIp('192.168.10.10')!),hop=route?.via!==null&&route?.via!==undefined?f.lookupRoute(route.via):null;
  const defaultRoute=!!gateways&&route?.prefix===0&&route.dest===0&&route.ifaceName==='eth0'&&route.via===right[0].ip!.addr&&hop?.kind==='connected'&&hop.ifaceName==='eth0';
  const bp=portOn(b,swA),bi=b.getInterface('eth0');
  const bReady=!!bp&&!!aPort&&swA.vlanOf(bp.name)===swA.vlanOf(aPort.name)&&bi?.ip?.addr===parseIp('192.168.10.20')&&bi.ip.prefix===24;
  return { exists, cables, interfaces, hostIp, gateways: !!gateways, defaultRoute, bReady };
}
/** Only the exact untouched insertion can be adopted after a crash before its receipt. */
export function initialRouterGroup(net: Network, legacy=false) {
  const r = net.devices.get(ROUTER_IDS.router), sw = net.devices.get(ROUTER_IDS.sw), e = host(net, ROUTER_IDS.e), f = host(net, ROUTER_IDS.f);
  if (!(r instanceof RouterDevice) || r.name !== 'Router' || !r.forwarding || r.interfaces.some(i => i.ip || i.link) || !(sw instanceof SwitchDevice) || sw.name !== 'Switch B' || !e || !f || e.name !== 'PC E' || f.name !== 'PC F') return false;
  if (e.interfaces[0].ip?.addr !== parseIp('192.168.20.10') || e.interfaces[0].ip?.prefix !== 24 || e.interfaces[0].gateway !== null || f.interfaces[0].ip || f.interfaces[0].gateway !== null) return false;
  const l=net.links.get(ROUTER_LINKS.e),fl=net.links.get(ROUTER_LINKS.f);
  return !!l&&l.a.device===e&&l.a.name==='eth0'&&l.b.device===sw&&!!portOn(e,sw)&&
    (!f.interfaces[0].link&&!fl||legacy&&!!fl&&fl.a.device===f&&fl.b.device===sw&&!!portOn(f,sw));
}
