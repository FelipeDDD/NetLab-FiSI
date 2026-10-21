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
}));
vi.mock('../store', () => ({ useStore: (select: (state: typeof view) => unknown) => select(view) }));
vi.mock('@xyflow/react', () => ({ useViewport: () => ({ x: 0, y: 0, zoom: 1 }) }));
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
  expect(controls).toContain('Latest ping wins'); expect(controls).not.toContain('Observe next ping');
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
