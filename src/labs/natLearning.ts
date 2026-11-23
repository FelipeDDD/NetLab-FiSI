import type { Network } from '../engine/network';
import { Host, IpDevice } from '../engine/ipdevice';
import type { BrowserResult } from '../browser/request';
import type { CtEntry } from '../engine/conntrack';
import { serializeNetwork } from '../engine/serialize';
import { ipToString, parseIp } from '../engine/ip';
import type { CapturedPacket } from '../packetCapture';

// Presentation receipts use the existing Lab progress. Positions are not evidence.
export function natIntroSignature(net: Network): string {
  const saved = serializeNetwork(net, {});
  const ids = new Set(['PC1', 'lan', 'edge', 'web']);
  return JSON.stringify({ devices: saved.devices.filter(d => ids.has(d.id)),
    links: saved.links.filter(l => ids.has(l.a[0]) && ids.has(l.b[0])) });
}

export function natConfiguration(net: Network): string {
  return JSON.stringify(serializeNetwork(net, {}));
}

type NatResults = Readonly<Record<string, { pass: boolean; detail: string } | undefined>>;
export const NAT_INTRO_RESULTS = ['nat-capture', 'nat-first-http', 'nat-source-local', 'nat-source-external'] as const;
export const NAT_INVESTIGATION_RESULTS = ['nat-before-local', 'nat-before-pc1', 'nat-before-pc2'] as const;

export function natIntroComplete(results: NatResults): boolean {
  const local = results['nat-source-local'];
  const external = results['nat-source-external'];
  return !!(results['nat-first-http']?.pass && local?.pass && external?.pass && local.detail && local.detail === external.detail);
}

export function natInvestigationComplete(results: NatResults, correctionScreen?: number): boolean {
  const signature = results['nat-proof-nat-before-local']?.detail;
  // Older builds could replace individual proofs on review. A saved screen
  // from step 3 establishes prior passage, but every observation must exist.
  return NAT_INVESTIGATION_RESULTS.every(id => {
    const proof = results['nat-proof-' + id];
    return !!(results[id]?.pass && proof?.pass && proof.detail &&
      (proof.detail === signature || correctionScreen !== undefined));
  });
}

export function natSecondHost(net: Network, associated?: string): Host | null {
  if (associated) {
    const device = net.devices.get(associated);
    return device instanceof Host && device.kind === 'host' ? device : null;
  }
  const candidates = [...net.devices.values()].filter((d): d is Host => d instanceof Host && d.kind === 'host' && d.id !== 'PC1');
  return candidates.length === 1 ? candidates[0] : null;
}

export const NAT_LOCAL_IP = parseIp('192.168.60.10')!;
export const NAT_PEER_IP = parseIp('192.168.60.11')!;
const WAN_SERVER = parseIp('198.51.100.80')!;

export function natHostReady(net: Network, host: Host | null): boolean {
  const iface = host?.getInterface('eth0');
  const gateway = host?.lookupRoute(WAN_SERVER);
  return !!iface?.up && iface.ip?.addr === NAT_PEER_IP && iface.ip.prefix === 24 &&
    gateway?.prefix === 0 && gateway.via === parseIp('192.168.60.1') && gateway.ifaceName === iface.name &&
    !!iface.link?.operational && iface.link.other(iface).device === net.devices.get('lan');
}

export function natRouterEntries(net: Network): CtEntry[] {
  const router = net.devices.get('edge');
  return router instanceof IpDevice ? router.ct.list(net.now) : [];
}

export function natBrowserProof(net: Network, device: Host, result: BrowserResult, port: number | undefined,
  previous: ReadonlySet<CtEntry>, translated: boolean): boolean {
  const source = device.getInterface('eth0')?.ip?.addr;
  const entry = natRouterEntries(net).find(e => !previous.has(e) &&
    e.orig.proto === 'tcp' && e.orig.srcIp === source && e.orig.srcPort === port &&
    e.orig.dstIp === WAN_SERVER && e.orig.dstPort === 80 && e.trans.dstIp === WAN_SERVER && e.trans.dstPort === 80);
  if (!entry) return false;
  const server = net.devices.get('web');
  if (!(server instanceof IpDevice) || !server.hasIp(WAN_SERVER) ||
      !server.httpServer?.enabled || server.httpServer.port !== 80 || !server.httpServer.body.includes('Oficina conectada')) return false;
  if (translated) return (source === NAT_LOCAL_IP || source === NAT_PEER_IP) && entry.trans.srcIp === parseIp('198.51.100.2') &&
    entry.state === 'established' && result.kind === 'http' && result.status === 200 && result.body.includes('Oficina conectada');
  return source === NAT_PEER_IP && !server.lookupRoute(source) && entry.state === 'new' &&
    entry.trans.srcIp === source && entry.trans.srcPort === port && result.kind === 'error' && result.code === 'timeout';
}

export function natCapturedFlow(records: readonly CapturedPacket[]):
  { local: string; external: string } | 'missing-lan' | 'missing-wan' | 'unpaired' {
  const server = parseIp('198.51.100.80');
  const localAddress = parseIp('192.168.60.10');
  const externalAddress = parseIp('198.51.100.2');
  const lan = new Map<number, string>();
  let hasWan = false;
  for (const record of records) {
    const p = record.frame.payload;
    if (p.kind !== 'ipv4' || p.dst !== server || p.l4.kind !== 'tcp' ||
        !p.l4.syn || p.l4.ack || p.l4.dstPort !== 80) continue;
    if (record.fromDeviceId === 'lan' && record.toDeviceId === 'edge' && p.src === localAddress) {
      lan.set(record.id, ipToString(p.src));
    }
    if (record.fromDeviceId !== 'edge' || record.toDeviceId !== 'web' || p.src !== externalAddress) continue;
    hasWan = true;
    // The router preserves the arrival ID when forwarding, including after ARP and SNAT.
    const local = record.parentTransferId === undefined ? undefined : lan.get(record.parentTransferId);
    if (local !== undefined) return { local, external: ipToString(p.src) };
  }
  if (!lan.size) return 'missing-lan';
  return hasWan ? 'unpaired' : 'missing-wan';
}
