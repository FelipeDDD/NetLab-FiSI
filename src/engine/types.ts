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

export interface TcpSegment {
  kind: 'tcp';
  srcPort: number;
  dstPort: number;
  syn: boolean;
  ack: boolean;
  rst: boolean;
  fin: boolean;
}

export interface UdpDatagram {
  kind: 'udp';
  srcPort: number;
  dstPort: number;
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
