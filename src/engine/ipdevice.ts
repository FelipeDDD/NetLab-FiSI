import { Device, NetInterface } from './device';
import type { ScheduledEvent } from './scheduler';
import type { ArpPayload, EthernetFrame, IcmpMessage, Ipv4Packet, OriginalRef } from './types';
import { BROADCAST_MAC, networkOf, type U32 } from './ip';

export const DEFAULT_TTL = 64;
const ARP_RETRY_MS = 500;
const ARP_MAX_TRIES = 3;

// Events delivered to a ping/traceroute session registered under an ICMP id.
export type IcmpEvent =
  | { type: 'reply'; from: U32; seq: number; ttl: number }
  | { type: 'time-exceeded'; from: U32; seq: number | null }
  | { type: 'unreachable'; from: U32; seq: number | null; code: 'net' | 'host' }
  | { type: 'send-error'; seq: number | null; message: string };

export interface Route {
  dest: U32;
  prefix: number;
  via: U32 | null;
  ifaceName: string;
  kind: 'connected' | 'static';
}

export interface ArpEntry {
  mac: string;
  ifaceName: string;
  at: number;
}

interface PendingArp {
  iface: NetInterface;
  queue: Ipv4Packet[];
  tries: number;
  timer: ScheduledEvent | null;
}

function refOf(pkt: Ipv4Packet): OriginalRef {
  const icmp = pkt.icmp;
  const hasIds = icmp.type === 'echo-request' || icmp.type === 'echo-reply';
  return {
    src: pkt.src,
    dst: pkt.dst,
    icmpId: hasIds ? icmp.id : null,
    icmpSeq: hasIds ? icmp.seq : null,
  };
}

export abstract class IpDevice extends Device {
  forwarding = false;
  arpTable = new Map<U32, ArpEntry>();
  staticRoutes: Route[] = [];

  private pendingArp = new Map<U32, PendingArp>();
  private icmpListeners = new Map<number, (ev: IcmpEvent) => void>();
  private icmpIdSeq = 0;

  allocIcmpId(): number {
    return ++this.icmpIdSeq;
  }

  onIcmp(id: number, fn: (ev: IcmpEvent) => void): void {
    this.icmpListeners.set(id, fn);
  }

  offIcmp(id: number): void {
    this.icmpListeners.delete(id);
  }

  myIps(): U32[] {
    return this.interfaces.filter((i) => i.ip).map((i) => i.ip!.addr);
  }

  hasIp(ip: U32): boolean {
    return this.interfaces.some((i) => i.ip && i.ip.addr === ip);
  }

  routes(): Route[] {
    const rs: Route[] = [];
    for (const i of this.interfaces) {
      if (i.up && i.ip) {
        rs.push({
          dest: networkOf(i.ip.addr, i.ip.prefix),
          prefix: i.ip.prefix,
          via: null,
          ifaceName: i.name,
          kind: 'connected',
        });
      }
    }
    rs.push(...this.staticRoutes);
    return rs;
  }

  lookupRoute(dst: U32): Route | null {
    let best: Route | null = null;
    for (const r of this.routes()) {
      if (networkOf(dst, r.prefix) !== r.dest) continue;
      const iface = this.getInterface(r.ifaceName);
      if (!iface || !iface.up || !iface.link) continue;
      if (!best || r.prefix > best.prefix) best = r;
    }
    return best;
  }

  addIp(ifaceName: string, addr: U32, prefix: number): string | null {
    const iface = this.getInterface(ifaceName);
    if (!iface) return `Cannot find device "${ifaceName}"`;
    if (iface.ip && iface.ip.addr === addr && iface.ip.prefix === prefix)
      return 'RTNETLINK answers: File exists';
    if (iface.ip)
      return `netsim: one address per interface in phase 1 — "ip address del ${ifaceName}'s current address" first`;
    iface.ip = { addr, prefix };
    return null;
  }

  delIp(ifaceName: string, addr: U32, prefix: number): string | null {
    const iface = this.getInterface(ifaceName);
    if (!iface) return `Cannot find device "${ifaceName}"`;
    if (!iface.ip || iface.ip.addr !== addr || iface.ip.prefix !== prefix)
      return 'RTNETLINK answers: Cannot assign requested address';
    iface.ip = null;
    return null;
  }

  addRoute(dest: U32, prefix: number, via: U32 | null, dev?: string): string | null {
    let ifaceName = dev ?? null;
    if (ifaceName && !this.getInterface(ifaceName)) return `Cannot find device "${ifaceName}"`;
    if (!ifaceName) {
      if (via === null) return 'Error: either "via" or "dev" is required.';
      const r = this.lookupRoute(via);
      if (!r || r.kind !== 'connected') return 'Error: Nexthop has invalid gateway.';
      ifaceName = r.ifaceName;
    }
    if (this.staticRoutes.some((r) => r.dest === dest && r.prefix === prefix))
      return 'RTNETLINK answers: File exists';
    this.staticRoutes.push({ dest: networkOf(dest, prefix), prefix, via, ifaceName, kind: 'static' });
    return null;
  }

  delRoute(dest: U32, prefix: number): string | null {
    const i = this.staticRoutes.findIndex((r) => r.dest === networkOf(dest, prefix) && r.prefix === prefix);
    if (i < 0) return 'RTNETLINK answers: No such process';
    this.staticRoutes.splice(i, 1);
    return null;
  }

  sendEcho(dst: U32, id: number, seq: number, ttl = DEFAULT_TTL): string | null {
    return this.sendIcmp(dst, { type: 'echo-request', id, seq }, { ttl });
  }

  sendIcmp(dst: U32, icmp: IcmpMessage, opts: { ttl?: number; srcOverride?: U32 } = {}): string | null {
    if (this.hasIp(dst)) {
      // Pinging one of our own addresses short-circuits the wire entirely.
      const pkt: Ipv4Packet = { kind: 'ipv4', src: opts.srcOverride ?? dst, dst, ttl: opts.ttl ?? DEFAULT_TTL, icmp };
      this.network.scheduler.schedule(1, () => this.deliverLocal(pkt));
      return null;
    }
    const route = this.lookupRoute(dst);
    if (!route) return 'Network is unreachable';
    const iface = this.getInterface(route.ifaceName)!;
    const src = opts.srcOverride ?? iface.ip?.addr;
    if (src === undefined) return 'Network is unreachable';
    const pkt: Ipv4Packet = { kind: 'ipv4', src, dst, ttl: opts.ttl ?? DEFAULT_TTL, icmp };
    this.routePacket(pkt, route);
    return null;
  }

  receiveFrame(iface: NetInterface, frame: EthernetFrame): void {
    if (frame.payload.kind === 'arp') {
      this.handleArp(iface, frame.payload);
      return;
    }
    if (frame.dstMac !== iface.mac && frame.dstMac !== BROADCAST_MAC) return;
    this.handleIp(frame.payload);
  }

  private routePacket(pkt: Ipv4Packet, route: Route): void {
    const iface = this.getInterface(route.ifaceName)!;
    const nextHop = route.via ?? pkt.dst;
    this.resolveAndSend(iface, nextHop, pkt);
  }

  private resolveAndSend(iface: NetInterface, nextHop: U32, pkt: Ipv4Packet): void {
    const cached = this.arpTable.get(nextHop);
    if (cached) {
      iface.send({ srcMac: iface.mac, dstMac: cached.mac, payload: pkt });
      return;
    }
    const pending = this.pendingArp.get(nextHop);
    if (pending) {
      pending.queue.push(pkt);
      return;
    }
    const entry: PendingArp = { iface, queue: [pkt], tries: 1, timer: null };
    this.pendingArp.set(nextHop, entry);
    this.sendArpRequest(iface, nextHop);
    entry.timer = this.network.scheduler.schedule(ARP_RETRY_MS, () => this.arpRetry(nextHop, entry));
  }

  private arpRetry(nextHop: U32, entry: PendingArp): void {
    if (entry.tries >= ARP_MAX_TRIES) {
      this.pendingArp.delete(nextHop);
      for (const pkt of entry.queue) this.failDelivery(pkt);
      return;
    }
    entry.tries++;
    this.sendArpRequest(entry.iface, nextHop);
    entry.timer = this.network.scheduler.schedule(ARP_RETRY_MS, () => this.arpRetry(nextHop, entry));
  }

  private failDelivery(pkt: Ipv4Packet): void {
    if (this.hasIp(pkt.src)) {
      // Locally originated: tell the session directly, like the kernel
      // reporting "Destination Host Unreachable" against our own address.
      const ref = refOf(pkt);
      if (ref.icmpId !== null) {
        this.icmpListeners.get(ref.icmpId)?.({
          type: 'send-error',
          seq: ref.icmpSeq,
          message: 'Destination Host Unreachable',
        });
      }
    } else {
      this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'host', original: refOf(pkt) });
    }
  }

  private sendArpRequest(iface: NetInterface, targetIp: U32): void {
    if (!iface.ip) return;
    iface.send({
      srcMac: iface.mac,
      dstMac: BROADCAST_MAC,
      payload: {
        kind: 'arp',
        op: 'request',
        senderIp: iface.ip.addr,
        senderMac: iface.mac,
        targetIp,
        targetMac: null,
      },
    });
  }

  private handleArp(iface: NetInterface, arp: ArpPayload): void {
    if (arp.op === 'request') {
      if (iface.ip && arp.targetIp === iface.ip.addr) {
        this.arpTable.set(arp.senderIp, { mac: arp.senderMac, ifaceName: iface.name, at: this.network.now });
        iface.send({
          srcMac: iface.mac,
          dstMac: arp.senderMac,
          payload: {
            kind: 'arp',
            op: 'reply',
            senderIp: iface.ip.addr,
            senderMac: iface.mac,
            targetIp: arp.senderIp,
            targetMac: arp.senderMac,
          },
        });
      }
      return;
    }
    this.arpTable.set(arp.senderIp, { mac: arp.senderMac, ifaceName: iface.name, at: this.network.now });
    const pending = this.pendingArp.get(arp.senderIp);
    if (pending) {
      if (pending.timer) this.network.scheduler.cancel(pending.timer);
      this.pendingArp.delete(arp.senderIp);
      for (const pkt of pending.queue) {
        pending.iface.send({ srcMac: pending.iface.mac, dstMac: arp.senderMac, payload: pkt });
      }
    }
  }

  private handleIp(pkt: Ipv4Packet): void {
    if (this.hasIp(pkt.dst)) {
      this.deliverLocal(pkt);
      return;
    }
    if (!this.forwarding) return;
    const ttl = pkt.ttl - 1;
    if (ttl <= 0) {
      this.sendIcmp(pkt.src, { type: 'time-exceeded', original: refOf(pkt) });
      return;
    }
    const route = this.lookupRoute(pkt.dst);
    if (!route) {
      this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'net', original: refOf(pkt) });
      return;
    }
    this.routePacket({ ...pkt, ttl }, route);
  }

  private deliverLocal(pkt: Ipv4Packet): void {
    const icmp = pkt.icmp;
    switch (icmp.type) {
      case 'echo-request':
        this.sendIcmp(
          pkt.src,
          { type: 'echo-reply', id: icmp.id, seq: icmp.seq },
          { srcOverride: this.hasIp(pkt.dst) ? pkt.dst : undefined },
        );
        break;
      case 'echo-reply':
        this.icmpListeners.get(icmp.id)?.({ type: 'reply', from: pkt.src, seq: icmp.seq, ttl: pkt.ttl });
        break;
      case 'time-exceeded':
        if (icmp.original.icmpId !== null) {
          this.icmpListeners.get(icmp.original.icmpId)?.({
            type: 'time-exceeded',
            from: pkt.src,
            seq: icmp.original.icmpSeq,
          });
        }
        break;
      case 'dest-unreachable':
        if (icmp.original.icmpId !== null) {
          this.icmpListeners.get(icmp.original.icmpId)?.({
            type: 'unreachable',
            from: pkt.src,
            seq: icmp.original.icmpSeq,
            code: icmp.code,
          });
        }
        break;
    }
  }
}

export class Host extends IpDevice {
  readonly kind = 'host' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.addInterfaces('eth', 1);
  }
}

export class RouterDevice extends IpDevice {
  readonly kind = 'router' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.forwarding = true;
    this.addInterfaces('eth', 4);
  }
}

// Only needed for the constructors above; kept at the bottom to avoid
// a circular value import at module-evaluation time.
import type { Network } from './network';
