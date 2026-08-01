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
// original sender's ping/traceroute session can be matched by icmp id.
export interface OriginalRef {
  src: U32;
  dst: U32;
  icmpId: number | null;
  icmpSeq: number | null;
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
  code: 'net' | 'host';
  original: OriginalRef;
}

export type IcmpMessage = IcmpEchoRequest | IcmpEchoReply | IcmpTimeExceeded | IcmpUnreachable;

export interface Ipv4Packet {
  kind: 'ipv4';
  src: U32;
  dst: U32;
  ttl: number;
  icmp: IcmpMessage;
}

export type FramePayload = ArpPayload | Ipv4Packet;

export interface EthernetFrame {
  srcMac: string;
  dstMac: string;
  payload: FramePayload;
}
