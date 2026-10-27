import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyGuidedPacket, type GuidedHop, type GuidedPacketState, type PacketVisualizationMode } from '../guidedPacket';
import type { AnimatedTransfer } from '../packetAnimation';
import { PacketLayer } from './PacketLayer';
import { GuidedPacketControls } from './GuidedPacketControls';
const view = vi.hoisted(() => ({
  packetVisualizationMode: 'guided' as PacketVisualizationMode, guidedPacket: null as unknown as GuidedPacketState,
  packets: [] as AnimatedTransfer[], dropFlashes: [], clock: 0, packetAnimationClock: 500,
  nodes: ['a', 'switch', 'b'].map((id, index) => ({ id, position: { x: index * 100, y: 0 }, measured: { width: 10, height: 10 } })),
  edges: [], cableStyle: 'straight',
}));
vi.mock('../store', () => ({ useStore: (select: (state: typeof view) => unknown) => select(view) }));
vi.mock('@xyflow/react', () => ({ useViewport: () => ({ x: 0, y: 0, zoom: 1 }), ViewportPortal: ({children}: {children: React.ReactNode}) => children }));
const first: GuidedHop = { id: 1, start: 0, end: 80, linkId: '1', fromDeviceId: 'a', toDeviceId: 'switch', kind: 'icmp',
  fromDeviceName: 'PC1', toDeviceName: 'SW1', fromInterface: 'eth0', toInterface: 'eth1', ping: 1, direction: 'request' };
const second = { ...first, id: 2, linkId: '2', parentTransferId: 1, fromDeviceId: 'switch', toDeviceId: 'b', fromDeviceName: 'SW1', toDeviceName: 'PC2' };
it('renders focused progressive playback only, preserving simultaneous Live animations', () => {
  view.guidedPacket = emptyGuidedPacket();
  view.guidedPacket.playback = { ...view.guidedPacket.playback, status: 'paused', hops: [first, second], progress: .5 };
  view.guidedPacket.observation.observed = [first, second];
  view.packets = [first, second].map(p => ({ ...p, visualStart: 0, visualDuration: 1000 }));
  let layer = renderToStaticMarkup(createElement(PacketLayer));
  expect(layer.match(/class="packet-dot"/g)).toHaveLength(1); expect(layer).toContain('cx="55"');
  const controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('Schrittmodus Wiedergabe'); expect(controls).toContain('neuesten Ping-Befehls'); expect(controls).not.toContain('Observe next ping');
  expect(controls).toContain('PC1 / eth0 → SW1 / eth1'); expect(controls).toContain('Step');
  expect(controls.match(/<button\b[^>]*>Play<\/button>/)?.[0]).not.toContain('disabled');
  view.guidedPacket.playback = { ...view.guidedPacket.playback, status: 'finished', index: 1, progress: 1 };
  expect(renderToStaticMarkup(createElement(GuidedPacketControls)).match(/<button\b[^>]*>Play<\/button>/)?.[0]).toContain('disabled');
  view.packetVisualizationMode = 'live';
  layer = renderToStaticMarkup(createElement(PacketLayer)); expect(layer.match(/class="packet-dot"/g)).toHaveLength(2);
});
it('keeps replay and observation clearly separate with honest empty/error states', () => {
  view.guidedPacket = emptyGuidedPacket();
  let controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('Waiting for a ping');
  expect(controls.match(/<button\b[^>]*>Replay<\/button>/)?.[0]).toContain('disabled');
  view.guidedPacket.playback = { ...view.guidedPacket.playback, kind: 'replay', status: 'playing', hops: [first] };
  view.guidedPacket.observation.observed = [first];
  controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('Replay of observed hops'); expect(controls).toContain('>Follow</button>');
  expect(controls).toContain('Observation continues during playback and pause');
  view.guidedPacket = emptyGuidedPacket();
  view.guidedPacket.observation.message = 'Local ping: no packets crossed a link.';
  controls = renderToStaticMarkup(createElement(GuidedPacketControls)); expect(controls).toContain('Local ping');
  expect(controls).not.toContain('Hop 1');
});
it('automatically renders one ping dot in Live and removes it at the last visual arrival', () => {
  view.packetVisualizationMode = 'live';
  view.guidedPacket = emptyGuidedPacket();
  view.guidedPacket.observation.session = {deviceId:'a',icmpId:1};
  view.guidedPacket.observation.status = 'observing';
  view.guidedPacket.playback = {...view.guidedPacket.playback,hops:[first,second],progress:.5,status:'playing'};
  view.packets = [first,second].map(p=>({...p,pingTraffic:true,visualStart:0,visualDuration:1000}));
  expect(renderToStaticMarkup(createElement(PacketLayer)).match(/class="packet-dot"/g)).toHaveLength(1);
  view.guidedPacket.observation.status = 'complete';
  view.guidedPacket.playback = {...view.guidedPacket.playback,index:1,progress:1,status:'finished'};
  expect(renderToStaticMarkup(createElement(PacketLayer))).not.toContain('class="packet-dot"');
  view.packets.push({...view.packets[0],id:3,kind:'tcp',pingTraffic:false});
  expect(renderToStaticMarkup(createElement(PacketLayer)).match(/class="packet-dot"/g)).toHaveLength(1);
});

it('draws parallel ARP sibling links and unrelated Live broadcast while preserving one focused ping attempt', () => {
  view.packetVisualizationMode='live';view.guidedPacket=emptyGuidedPacket();
  view.guidedPacket.observation.session={deviceId:'a',icmpId:1};view.guidedPacket.observation.status='observing';
  const root={...first,kind:'arp' as const,arp:'request' as const,visualStep:0};
  const branches=[{...second,id:2,kind:'arp' as const,arp:'request' as const,visualStep:1},
    {...second,id:3,linkId:'3',kind:'arp' as const,arp:'request' as const,visualStep:1}];
  view.guidedPacket.playback={...view.guidedPacket.playback,hops:[root,...branches],index:1,progress:.5,status:'playing'};
  view.packets=[{...first,id:4,kind:'udp',visualStart:0,visualDuration:1000}];
  const layer=renderToStaticMarkup(createElement(PacketLayer));
  expect(layer.match(/class="packet-dot"/g)).toHaveLength(3);
  expect(layer).toContain('data-transfer-id="2"');expect(layer).toContain('data-transfer-id="3"');
  expect(layer).not.toContain('data-transfer-id="1"');
});
