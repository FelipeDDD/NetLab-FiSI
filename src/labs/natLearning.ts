import type { Network } from '../engine/network';
import { Host } from '../engine/ipdevice';
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

export function natSecondHost(net: Network, associated?: string): Host | null {
  if (associated) {
    const device = net.devices.get(associated);
    return device instanceof Host && device.kind === 'host' ? device : null;
  }
  const candidates = [...net.devices.values()].filter((d): d is Host => d instanceof Host && d.kind === 'host' && d.id !== 'PC1');
  return candidates.length === 1 ? candidates[0] : null;
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
