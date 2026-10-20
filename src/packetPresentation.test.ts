import { expect, it } from 'vitest';
import type { CapturedPacket } from './packetCapture';
import type { AppData, FramePayload } from './engine/types';
import { parseIp } from './engine/ip';
import { packetLayers, packetPage, packetSummary, PACKET_PAGE_SIZE } from './packetPresentation';

const ip = (text: string) => parseIp(text)!;
function record(payload: FramePayload, id = 1): CapturedPacket {
  return { id, start: id, end: id + 80, linkId: 'cable', fromDeviceId: 'router', toDeviceId: 'switch',
    fromDeviceName: 'R1', toDeviceName: 'SW1', fromInterface: 'eth2', toInterface: 'eth7',
    kind: payload.kind === 'arp' ? 'arp' : payload.l4.kind,
    frame: { srcMac: '02:00:00:00:00:01', dstMac: 'ff:ff:ff:ff:ff:ff', payload }, truncatedFields: [] };
}
const echo = (): FramePayload => ({ kind: 'ipv4', src: ip('10.0.0.1'), dst: ip('10.0.1.2'), ttl: 63,
  l4: { kind: 'icmp', msg: { type: 'echo-request', id: 4, seq: 9 } } });

it('distinguishes protocol addresses from link endpoints and preserves real ARP and ICMP fields', () => {
  const arp = record({ kind: 'arp', op: 'request', senderIp: ip('10.0.0.1'), targetIp: ip('10.0.0.2'), senderMac: 'aa', targetMac: null });
  expect(packetSummary(arp)).toEqual({ protocol: 'ARP', source: 'IP 10.0.0.1', destination: 'IP 10.0.0.2', summary: 'Who has 10.0.0.2?' });
  expect(packetLayers(arp).map((l) => l.name)).toEqual(['Ethernet', 'ARP']);
  const packet = record(echo());
  expect(packetSummary(packet)).toMatchObject({ protocol: 'ICMP', destination: 'IP 10.0.1.2', summary: 'echo-request · id 4 seq 9' });
  expect(packetLayers(packet)[1].fields).toEqual({ 'Source IP': '10.0.0.1', 'Destination IP': '10.0.1.2', TTL: 63 });
  expect(packetLayers(packet)[2].fields).toEqual({ Type: 'echo-request', Identifier: 4, Sequence: 9 });
});

it('formats nested ICMP error references without inventing missing transport fields', () => {
  const packet = record({ kind: 'ipv4', src: 1, dst: 2, ttl: 64, l4: { kind: 'icmp', msg: { type: 'dest-unreachable', code: 'net',
    original: { src: ip('192.0.2.1'), dst: ip('192.0.2.2'), proto: 'icmp', icmpId: 7, icmpSeq: 3, srcPort: null, dstPort: null } } } });
  expect(packetLayers(packet).at(-1)!.fields).toEqual({ Type: 'dest-unreachable', Code: 'net', 'Original packet': {
    'Source IP': '192.0.2.1', 'Destination IP': '192.0.2.2', Protocol: 'icmp', 'ICMP ID': 7, 'ICMP sequence': 3,
  } });
});

it.each([
  [{ kind: 'dhcp', op: 'offer', xid: 3, clientMac: 'aa', yourIp: ip('10.0.0.100'), prefix: 24, router: null } as AppData, 'DHCP', 'Offered IP', '10.0.0.100'],
  [{ kind: 'dns-query', qid: 4, qname: 'web.lan' } as AppData, 'DNS', 'Name', 'web.lan'],
  [{ kind: 'dns-answer', qid: 4, qname: 'web.lan', addr: null } as AppData, 'DNS', 'Answer', 'NXDOMAIN'],
  [{ kind: 'http-request', method: 'GET', path: '/index', host: 'web.lan' } as AppData, 'HTTP', 'Path', '/index'],
  [{ kind: 'http-response', status: 200, reason: 'OK', body: '<p>hi</p>\n🌐' } as AppData, 'HTTP', 'Body', '<p>hi</p>\n🌐'],
  [{ kind: 'rip', routes: [{ dest: ip('10.0.0.0'), prefix: 24, metric: 2 }] } as AppData, 'RIP', 'Routes', [{ Network: '10.0.0.0/24', Metric: 2 }]],
] as const)('presents %s using actual application data', (app, protocol, field, value) => {
  const packet = record({ kind: 'ipv4', src: 1, dst: 2, ttl: 64, l4: { kind: 'udp', srcPort: 67, dstPort: 68, app } });
  expect(packetSummary(packet).protocol).toBe(protocol);
  expect(packetLayers(packet).at(-1)).toMatchObject({ name: protocol, fields: { [field]: value } });
  expect(packetLayers(packet)[2]).toEqual({ name: 'UDP', fields: { 'Source port': 67, 'Destination port': 68 } });
});

it('shows only simulated TCP ports and flags', () => {
  const packet = record({ kind: 'ipv4', src: 1, dst: 2, ttl: 64, l4: { kind: 'tcp', srcPort: 40000, dstPort: 80, syn: true, ack: true, rst: false, fin: false } });
  expect(packetSummary(packet).summary).toBe('40000 → 80 [SYN, ACK]');
  expect(packetLayers(packet).at(-1)!.fields).toEqual({ 'Source port': 40000, 'Destination port': 80, Flags: { SYN: true, ACK: true, RST: false, FIN: false } });
});

it('bounds rendered pages and anchors reading across append, eviction, clear and same-ID topology replacement', () => {
  const records = Array.from({ length: 1_000 }, (_, i) => record(echo(), i));
  const anchor = records[100];
  expect(packetPage(records, anchor).rows).toHaveLength(PACKET_PAGE_SIZE);
  expect(packetPage([...records, record(echo(), 1000)], anchor).rows[0]).toBe(anchor);
  expect(packetPage(records.slice(80), anchor)).toMatchObject({ start: 20, rows: records.slice(100, 150) });
  expect(packetPage(records.slice(101), anchor).start).toBe(0);
  expect(packetPage([], anchor).rows).toEqual([]);
  const replacement = record(echo(), anchor.id);
  expect(packetPage([replacement], anchor).rows).toEqual([replacement]);
  expect([replacement].includes(anchor)).toBe(false);
});
