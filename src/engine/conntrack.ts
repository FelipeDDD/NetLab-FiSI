// Connection tracking: powers `ct state` matches and NAT. Entries hold the
// original tuple (as first seen, pre-NAT) and the translated tuple (post-NAT,
// identical when no NAT applies). Reply-direction packets are recognised via
// the reverse of the translated tuple and un-NATed back to the original.
import type { Ipv4Packet } from './types';
import type { U32 } from './ip';
import type { CtStateName } from './firewall';

export interface Tuple {
  proto: 'tcp' | 'udp' | 'icmp';
  srcIp: U32;
  srcPort: number;
  dstIp: U32;
  dstPort: number;
}

const TIMEOUT_MS = 120_000;

export function tupleOf(pkt: Ipv4Packet): Tuple | null {
  const l4 = pkt.l4;
  if (l4.kind === 'tcp' || l4.kind === 'udp')
    return { proto: l4.kind, srcIp: pkt.src, srcPort: l4.srcPort, dstIp: pkt.dst, dstPort: l4.dstPort };
  if (l4.msg.type === 'echo-request' || l4.msg.type === 'echo-reply')
    return { proto: 'icmp', srcIp: pkt.src, srcPort: l4.msg.id, dstIp: pkt.dst, dstPort: l4.msg.id };
  return null; // ICMP errors are classified via their embedded original reference
}

export function reverseTuple(t: Tuple): Tuple {
  return { proto: t.proto, srcIp: t.dstIp, srcPort: t.dstPort, dstIp: t.srcIp, dstPort: t.srcPort };
}

function key(t: Tuple): string {
  return `${t.proto}|${t.srcIp}|${t.srcPort}|${t.dstIp}|${t.dstPort}`;
}

export interface CtEntry {
  orig: Tuple;
  trans: Tuple;
  state: 'new' | 'established';
  lastSeen: number;
  masquerade?: { iface: string; address: U32 };
}

export interface CtResult {
  pkt: Ipv4Packet;
  state: CtStateName;
  entry: CtEntry | null;
  dir: 'orig' | 'reply' | 'none';
}

export function rewriteTo(pkt: Ipv4Packet, t: Tuple): Ipv4Packet {
  const current = tupleOf(pkt);
  if (current && key(current) === key(t)) return pkt;
  const l4 = pkt.l4;
  if (l4.kind === 'tcp' || l4.kind === 'udp') {
    return { ...pkt, src: t.srcIp, dst: t.dstIp, l4: { ...l4, srcPort: t.srcPort, dstPort: t.dstPort } };
  }
  if (l4.msg.type === 'echo-request' || l4.msg.type === 'echo-reply')
    return { ...pkt, src: t.srcIp, dst: t.dstIp, l4: l4.msg.id === t.srcPort ? l4 : { ...l4, msg: { ...l4.msg, id: t.srcPort } } };
  return { ...pkt, src: t.srcIp, dst: t.dstIp };
}

export class ConnTrack {
  private byOrig = new Map<string, CtEntry>();
  private byReply = new Map<string, CtEntry>();
  // Configurable bounded search also permits small deterministic exhaustion tests.
  constructor(private readonly ports = { min: 1024, max: 65535 }) {
    if (!Number.isInteger(ports.min) || !Number.isInteger(ports.max) || ports.min < 1 || ports.max > 65535 || ports.min > ports.max) throw Error('Invalid PAT port range');
  }

  remove(entry: CtEntry): void {
    if (this.byOrig.get(key(entry.orig)) === entry) this.byOrig.delete(key(entry.orig));
    if (this.byReply.get(key(reverseTuple(entry.trans))) === entry) this.byReply.delete(key(reverseTuple(entry.trans)));
  }

  invalidateMasquerade(address: (iface: string) => U32 | undefined): void {
    for (const entry of this.byOrig.values()) if (entry.masquerade && address(entry.masquerade.iface) !== entry.masquerade.address) this.remove(entry);
  }

  process(pkt: Ipv4Packet, now: number): CtResult {
    const l4 = pkt.l4;
    if (l4.kind === 'icmp' && (l4.msg.type === 'time-exceeded' || l4.msg.type === 'dest-unreachable')) {
      const o = l4.msg.original;
      const ot: Tuple = {
        proto: o.proto,
        srcIp: o.src,
        srcPort: o.srcPort ?? o.icmpId ?? 0,
        dstIp: o.dst,
        dstPort: o.dstPort ?? o.icmpId ?? 0,
      };
      // Errors quote the packet as seen on the generating side of the NAT.
      // Require the error to be addressed to that packet's sender.
      if (pkt.dst !== ot.srcIp) return { pkt, state: 'new', entry: null, dir: 'none' };
      const outgoing = this.lookup(this.byReply, reverseTuple(ot), now);
      const incoming = outgoing ? null : this.lookup(this.byOrig, reverseTuple(ot), now);
      const e = outgoing ?? incoming;
      if (!e) return { pkt, state: 'new', entry: null, dir: 'none' };
      const target = outgoing ? e.orig : reverseTuple(e.trans);
      const original = { ...o, src: target.srcIp, dst: target.dstIp,
        ...(o.proto === 'icmp' ? { icmpId: target.srcPort } : { srcPort: target.srcPort, dstPort: target.dstPort }) };
      return { pkt: { ...pkt, dst: target.srcIp, src: pkt.src === ot.dstIp ? target.dstIp : pkt.src,
        l4: { ...l4, msg: { ...l4.msg, original } } }, state: 'related', entry: e, dir: outgoing ? 'reply' : 'orig' };
    }

    const t = tupleOf(pkt);
    if (!t) return { pkt, state: 'new', entry: null, dir: 'none' };

    // ICMP tuples are symmetric (id/id), so direction comes from the type:
    // echo-requests can only continue the original direction, echo-replies
    // can only be reply traffic. Otherwise a WAN host pinging in would
    // masquerade as the reply to a LAN ping with the same id.
    const icmpReply = l4.kind === 'icmp' && l4.msg.type === 'echo-reply';
    const icmpRequest = l4.kind === 'icmp' && l4.msg.type === 'echo-request';

    const orig = icmpReply ? null : this.lookup(this.byOrig, t, now);
    if (orig) {
      orig.lastSeen = now;
      return {
        pkt: rewriteTo(pkt, orig.trans),
        state: orig.state === 'established' ? 'established' : 'new',
        entry: orig,
        dir: 'orig',
      };
    }
    const reply = icmpRequest ? null : this.lookup(this.byReply, t, now);
    if (reply) {
      reply.lastSeen = now;
      reply.state = 'established';
      return { pkt: rewriteTo(pkt, reverseTuple(reply.orig)), state: 'established', entry: reply, dir: 'reply' };
    }
    return { pkt, state: 'new', entry: null, dir: 'none' };
  }

  confirm(orig: Tuple, trans: Tuple, now: number, masquerade?: CtEntry['masquerade']): Tuple | null {
    const validPorts = (t: Tuple) => [t.srcPort, t.dstPort].every(port => Number.isInteger(port) && port >= (t.proto === 'icmp' ? 0 : 1) && port <= 65535);
    if (!validPorts(orig) || !validPorts(trans)) return null;
    const existing = this.lookup(this.byOrig, orig, now);
    if (existing) {
      existing.lastSeen = now;
      return existing.trans;
    }
    let chosen = { ...trans };
    const occupied = (candidate: Tuple) => !!this.lookup(this.byReply, reverseTuple(candidate), now);
    if (occupied(chosen)) {
      // Only source NAT may allocate a replacement. A colliding DNAT/plain
      // flow must fail rather than secretly modifying the source endpoint.
      if (orig.srcIp === trans.srcIp) return null;
      let available = false;
      const min = trans.proto === 'icmp' ? 0 : this.ports.min;
      const max = trans.proto === 'icmp' ? 65535 : this.ports.max;
      for (let port = min; port <= max; port++) {
        chosen = { ...trans, srcPort: port, ...(trans.proto === 'icmp' ? { dstPort: port } : {}) };
        if (!occupied(chosen)) { available = true; break; }
      }
      if (!available) return null;
    }
    const entry: CtEntry = { orig: { ...orig }, trans: chosen, state: 'new', lastSeen: now, ...(masquerade ? { masquerade } : {}) };
    this.byOrig.set(key(orig), entry);
    this.byReply.set(key(reverseTuple(chosen)), entry);
    return chosen;
  }

  list(now: number): CtEntry[] {
    const out: CtEntry[] = [];
    for (const e of this.byOrig.values()) {
      if (now - e.lastSeen > TIMEOUT_MS) {
        this.remove(e);
        continue;
      }
      out.push(e);
    }
    return out;
  }

  private lookup(map: Map<string, CtEntry>, t: Tuple, now: number): CtEntry | null {
    const e = map.get(key(t));
    if (!e) return null;
    if (now - e.lastSeen > TIMEOUT_MS) {
      this.remove(e);
      return null;
    }
    return e;
  }
}
