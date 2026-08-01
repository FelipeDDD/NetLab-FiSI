import type { U32 } from './ip';

export interface ArpPayload {
  kind: 'arp';
  op: 'request' | 'reply';
  senderIp: U32;
  senderMac: string;
  targetIp: U32;
  targetMac: string | null;
}

// Reference back to the packet that triggered an ICMP error, so the
// original sender's ping/traceroute/socket session can be matched.
export interface OriginalRef {
  src: U32;
  dst: U32;
  proto: 'icmp' | 'tcp' | 'udp';
  icmpId: number | null;
  icmpSeq: number | null;
  srcPort: number | null;
  dstPort: number | null;
}

export interface IcmpEchoRequest {
  type: 'echo-request';
  id: number;
  seq: number;
}

export interface IcmpEchoReply {
  type: 'echo-reply';
  id: number;
  seq: number;
}

export interface IcmpTimeExceeded {
  type: 'time-exceeded';
  original: OriginalRef;
}

export interface IcmpUnreachable {
  type: 'dest-unreachable';
  code: 'net' | 'host' | 'port';
  original: OriginalRef;
}

export type IcmpMessage = IcmpEchoRequest | IcmpEchoReply | IcmpTimeExceeded | IcmpUnreachable;

export interface IcmpL4 {
  kind: 'icmp';
  msg: IcmpMessage;
}

// Application payloads carried inside TCP/UDP. These ride real simulated
// packets, so DHCP/DNS/HTTP traffic animates on the wire and can be
// firewalled like anything else.
export type DhcpOp = 'discover' | 'offer' | 'request' | 'ack';

export interface DhcpApp {
  kind: 'dhcp';
  op: DhcpOp;
  xid: number;
  clientMac: string;
  yourIp?: U32;
  prefix?: number;
  router?: U32 | null;
  dns?: U32 | null;
  serverIp?: U32;
}

export interface DnsQueryApp {
  kind: 'dns-query';
  qid: number;
  qname: string;
}

export interface DnsAnswerApp {
  kind: 'dns-answer';
  qid: number;
  qname: string;
  addr: U32 | null; // null = NXDOMAIN
}

export interface HttpRequestApp {
  kind: 'http-request';
  method: 'GET';
  path: string;
  host: string;
}

export interface HttpResponseApp {
  kind: 'http-response';
  status: number;
  reason: string;
  body: string;
}

export interface RipApp {
  kind: 'rip';
  routes: { dest: U32; prefix: number; metric: number }[];
}

export type AppData = DhcpApp | DnsQueryApp | DnsAnswerApp | HttpRequestApp | HttpResponseApp | RipApp;

export interface TcpSegment {
  kind: 'tcp';
  srcPort: number;
  dstPort: number;
  syn: boolean;
  ack: boolean;
  rst: boolean;
  fin: boolean;
  app?: AppData;
}

export interface UdpDatagram {
  kind: 'udp';
  srcPort: number;
  dstPort: number;
  app?: AppData;
}

export type L4 = IcmpL4 | TcpSegment | UdpDatagram;

export interface Ipv4Packet {
  kind: 'ipv4';
  src: U32;
  dst: U32;
  ttl: number;
  l4: L4;
}

export type FramePayload = ArpPayload | Ipv4Packet;

export interface EthernetFrame {
  srcMac: string;
  dstMac: string;
  payload: FramePayload;
}
