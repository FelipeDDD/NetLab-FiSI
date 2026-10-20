import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PacketDetails, PacketInspector } from './PacketInspector';
import type { CapturedPacket } from '../packetCapture';

// Details are a pure view: do not initialize the live network or browser xterm.
const view = vi.hoisted(() => ({ packetInspectorOpen: false, packetCapture: {
  status: 'stopped', linkId: null, records: [] as CapturedPacket[], discarded: 0,
} }));
vi.mock('../store', () => ({ useStore: (select: (state: typeof view) => unknown) => select(view) }));

it('renders nested details and truncation metadata while treating HTTP content as inert text', () => {
  const packet: CapturedPacket = { id: 1, start: 1500, end: 1580, kind: 'tcp', linkId: 'link',
    fromDeviceId: 'srv', toDeviceId: 'r', fromDeviceName: 'Server', toDeviceName: 'Router', fromInterface: 'eth0', toInterface: 'eth2',
    frame: { srcMac: 'aa', dstMac: 'bb', payload: { kind: 'ipv4', src: 1, dst: 2, ttl: 64,
      l4: { kind: 'tcp', srcPort: 80, dstPort: 40000, syn: false, ack: true, rst: false, fin: false,
        app: { kind: 'http-response', status: 200, reason: 'OK', body: '<img src=x onerror="alert(1)">\n<script>bad()</script>' } } } },
    truncatedFields: [{ path: 'frame.payload.l4.app.body', originalLength: 20000, capturedLength: 16384 }],
  };
  const html = renderToStaticMarkup(createElement(PacketDetails, { packet, onClose: vi.fn() }));
  expect(html).toContain('Ethernet'); expect(html).toContain('IPv4'); expect(html).toContain('TCP'); expect(html).toContain('HTTP');
  expect(html).toContain('Server / eth0 → Router / eth2'); expect(html).toContain('was truncated');
  expect(html).toContain('16384 of 20000'); expect(html).toContain('&lt;img'); expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<img'); expect(html).not.toContain('<script>');
  expect(html).not.toContain('checksum'); expect(html).not.toContain('Content-Length');
  expect(html).toContain('aria-label="Close packet details"');
});

it('shows historical link names in the list, reopening without details or changing capture data', () => {
  const packet: CapturedPacket = { id: 9, start: 0, end: 80, kind: 'arp', linkId: 'old-link',
    fromDeviceId: 'deleted-router', toDeviceId: 'deleted-switch', fromDeviceName: 'Old Router', toDeviceName: 'Old Switch',
    fromInterface: 'eth2', toInterface: 'eth7', truncatedFields: [],
    frame: { srcMac: 'aa', dstMac: 'ff', payload: { kind: 'arp', op: 'request', senderIp: 1, targetIp: 2, senderMac: 'aa', targetMac: null } },
  };
  view.packetCapture.records = [packet]; view.packetInspectorOpen = true;
  const html = renderToStaticMarkup(createElement(PacketInspector));
  expect(html).toContain('scope="col">Link</th>');
  expect(html).toContain('<span>Old Router</span><span>→ Old Switch</span>');
  expect(html).toContain('Old Router / eth2 → Old Switch / eth7 (old-link)');
  expect(html).not.toContain('aria-label="Packet details"');
  view.packetInspectorOpen = false;
  expect(renderToStaticMarkup(createElement(PacketInspector))).toBe('');
  view.packetInspectorOpen = true;
  expect(renderToStaticMarkup(createElement(PacketInspector))).not.toContain('aria-label="Packet details"');
  expect(view.packetCapture.records).toEqual([packet]);
});
