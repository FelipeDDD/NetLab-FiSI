import { ipToString } from './engine/ip';
import type { AppData } from './engine/types';
import type { CapturedPacket } from './packetCapture';

export const PACKET_PAGE_SIZE = 50;
export type PacketFields = Record<string, unknown>;
export interface PacketDetailsLayer { name: string; fields: PacketFields }

const address = (value: number | null | undefined) => value === undefined ? undefined : value === null ? 'None' : ipToString(value);

function appSummary(app: AppData): { protocol: string; summary: string } {
  switch (app.kind) {
    case 'dhcp': return { protocol: 'DHCP', summary: `${app.op.toUpperCase()} · xid ${app.xid}${app.yourIp === undefined ? '' : ` · ${ipToString(app.yourIp)}`}` };
    case 'dns-query': return { protocol: 'DNS', summary: `Query ${app.qname}` };
    case 'dns-answer': return { protocol: 'DNS', summary: `${app.qname} → ${app.addr === null ? 'NXDOMAIN' : ipToString(app.addr)}` };
    case 'http-request': return { protocol: 'HTTP', summary: `${app.method} ${app.path}` };
    case 'http-response': return { protocol: 'HTTP', summary: `${app.status} ${app.reason}` };
    case 'rip': return { protocol: 'RIP', summary: `Advertisement · ${app.routes.length} routes` };
  }
}

export function packetSummary(packet: CapturedPacket) {
  const p = packet.frame.payload;
  if (p.kind === 'arp') return {
    protocol: 'ARP', source: `IP ${ipToString(p.senderIp)}`, destination: `IP ${ipToString(p.targetIp)}`,
    summary: p.op === 'request' ? `Who has ${ipToString(p.targetIp)}?` : `${ipToString(p.senderIp)} is at ${p.senderMac}`,
  };
  const l4 = p.l4;
  let description: { protocol: string; summary: string };
  if (l4.kind === 'icmp') {
    const msg = l4.msg;
    description = { protocol: 'ICMP', summary: `${msg.type}${'seq' in msg ? ` · id ${msg.id} seq ${msg.seq}` : ''}` };
  } else if (l4.app) description = appSummary(l4.app);
  else {
    const flags = l4.kind === 'tcp' ? [l4.syn && 'SYN', l4.ack && 'ACK', l4.rst && 'RST', l4.fin && 'FIN'].filter(Boolean).join(', ') : '';
    description = { protocol: l4.kind.toUpperCase(), summary: `${l4.srcPort} → ${l4.dstPort}${flags ? ` [${flags}]` : ''}` };
  }
  return { ...description, source: `IP ${ipToString(p.src)}`, destination: `IP ${ipToString(p.dst)}` };
}

function applicationFields(app: AppData): PacketFields {
  switch (app.kind) {
    case 'dhcp': return {
      Operation: app.op, 'Transaction ID': app.xid, 'Client MAC': app.clientMac,
      'Offered IP': address(app.yourIp), Prefix: app.prefix, Router: address(app.router),
      DNS: address(app.dns), 'Server IP': address(app.serverIp),
    };
    case 'dns-query': return { 'Query ID': app.qid, Name: app.qname };
    case 'dns-answer': return { 'Query ID': app.qid, Name: app.qname, Answer: app.addr === null ? 'NXDOMAIN' : ipToString(app.addr) };
    case 'http-request': return { Method: app.method, Path: app.path, Host: app.host };
    case 'http-response': return { Status: app.status, Reason: app.reason, Body: app.body };
    case 'rip': return { Routes: app.routes.map((r) => ({ Network: `${ipToString(r.dest)}/${r.prefix}`, Metric: r.metric })) };
  }
}

export function packetLayers(packet: CapturedPacket): PacketDetailsLayer[] {
  const { frame } = packet, p = frame.payload;
  const layers: PacketDetailsLayer[] = [{ name: 'Ethernet', fields: { 'Source MAC': frame.srcMac, 'Destination MAC': frame.dstMac } }];
  if (p.kind === 'arp') {
    layers.push({ name: 'ARP', fields: { Operation: p.op, 'Sender IP': address(p.senderIp), 'Sender MAC': p.senderMac,
      'Target IP': address(p.targetIp), 'Target MAC': p.targetMac ?? undefined } });
    return layers;
  }
  layers.push({ name: 'IPv4', fields: { 'Source IP': address(p.src), 'Destination IP': address(p.dst), TTL: p.ttl } });
  const l4 = p.l4;
  if (l4.kind === 'icmp') {
    const msg = l4.msg, fields: PacketFields = { Type: msg.type };
    if ('id' in msg) { fields.Identifier = msg.id; fields.Sequence = msg.seq; }
    else {
      if ('code' in msg) fields.Code = msg.code;
      const original = msg.original;
      fields['Original packet'] = Object.fromEntries(Object.entries({
        'Source IP': address(original.src), 'Destination IP': address(original.dst), Protocol: original.proto,
        'ICMP ID': original.icmpId, 'ICMP sequence': original.icmpSeq, 'Source port': original.srcPort, 'Destination port': original.dstPort,
      }).filter(([, value]) => value !== null));
    }
    layers.push({ name: 'ICMP', fields });
  } else {
    const fields: PacketFields = { 'Source port': l4.srcPort, 'Destination port': l4.dstPort };
    if (l4.kind === 'tcp') fields.Flags = { SYN: l4.syn, ACK: l4.ack, RST: l4.rst, FIN: l4.fin };
    layers.push({ name: l4.kind.toUpperCase(), fields });
    if (l4.app) layers.push({ name: appSummary(l4.app).protocol, fields: applicationFields(l4.app) });
  }
  return layers;
}

// Object identity survives published batches, unlike a page number after eviction.
// It also prevents a same-ID record in a replacement topology from being selected.
export function packetPage(records: readonly CapturedPacket[], anchor: CapturedPacket | null) {
  const start = anchor ? Math.max(0, records.indexOf(anchor)) : 0;
  return { start, rows: records.slice(start, start + PACKET_PAGE_SIZE) };
}
