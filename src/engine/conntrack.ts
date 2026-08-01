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
}

export interface CtResult {
  pkt: Ipv4Packet;
  state: CtStateName;
  entry: CtEntry | null;
  dir: 'orig' | 'reply' | 'none';
}

function rewriteTo(pkt: Ipv4Packet, t: Tuple): Ipv4Packet {
  const l4 = pkt.l4;
  if (l4.kind === 'tcp' || l4.kind === 'udp') {
    return { ...pkt, src: t.srcIp, dst: t.dstIp, l4: { ...l4, srcPort: t.srcPort, dstPort: t.dstPort } };
  }
  return { ...pkt, src: t.srcIp, dst: t.dstIp };
}

export class ConnTrack {
  private byOrig = new Map<string, CtEntry>();
  private byReply = new Map<string, CtEntry>();

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
      const e = this.lookup(this.byOrig, ot, now) ?? this.lookup(this.byReply, ot, now);
      return { pkt, state: e ? 'related' : 'new', entry: e, dir: 'none' };
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

  confirm(orig: Tuple, trans: Tuple, now: number): void {
    const existing = this.byOrig.get(key(orig));
    if (existing) {
      existing.lastSeen = now;
      return;
    }
    const entry: CtEntry = { orig, trans, state: 'new', lastSeen: now };
    this.byOrig.set(key(orig), entry);
    this.byReply.set(key(reverseTuple(trans)), entry);
  }

  list(now: number): CtEntry[] {
    const out: CtEntry[] = [];
    for (const [k, e] of this.byOrig) {
      if (now - e.lastSeen > TIMEOUT_MS) {
        this.byOrig.delete(k);
        this.byReply.delete(key(reverseTuple(e.trans)));
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
      this.byOrig.delete(key(e.orig));
      this.byReply.delete(key(reverseTuple(e.trans)));
      return null;
    }
    return e;
  }
}
