import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyGuidedPacket, waitForGuidedPacket, type GuidedPacketState, type PacketVisualizationMode } from '../guidedPacket';
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

it('renders only the selected guided hop, its controls and finished endpoint; Live keeps concurrent dots', () => {
  const first = { id: 1, start: 0, end: 80, linkId: '1', fromDeviceId: 'a', toDeviceId: 'switch', kind: 'icmp' as const,
    fromDeviceName: 'PC1', toDeviceName: 'SW1', fromInterface: 'eth0', toInterface: 'eth1', ping: 1, direction: 'request' as const };
  const second = { ...first, id: 2, linkId: '2', parentTransferId: 1, fromDeviceId: 'switch', toDeviceId: 'b', fromDeviceName: 'SW1', toDeviceName: 'PC2' };
  view.guidedPacket = { ...emptyGuidedPacket(), status: 'paused', hops: [first, second], progress: 0.5 };
  view.packets = [first, second].map((p) => ({ ...p, visualStart: 0, visualDuration: 1000 }));
  let layer = renderToStaticMarkup(createElement(PacketLayer));
  expect(layer.match(/class="packet-dot"/g)).toHaveLength(1); expect(layer).toContain('cx="55"');
  const controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('Observe next ping'); expect(controls).toContain('Hop 1 / 2'); expect(controls).toContain('Ping 1/4');
  expect(controls).toContain('PC1 / eth0 → SW1 / eth1'); expect(controls).not.toContain('Next hop'); expect(controls).toContain('Replay');
  expect(controls.match(/<button\b[^>]*>Play<\/button>/)?.[0]).not.toContain('disabled');
  view.guidedPacket = { ...view.guidedPacket, status: 'playing' };
  expect(renderToStaticMarkup(createElement(GuidedPacketControls)).match(/<button\b[^>]*>Pause<\/button>/)?.[0]).not.toContain('disabled');
  view.guidedPacket = { ...view.guidedPacket, index: 1, progress: 1, status: 'finished' };
  layer = renderToStaticMarkup(createElement(PacketLayer));
  expect(layer).toContain('cx="205"'); expect(layer.match(/class="packet-dot"/g)).toHaveLength(1);
  const finishedControls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(finishedControls).toContain('Sequence finished');
  const finishedPlay = finishedControls.match(/<button\b[^>]*>Play<\/button>/)?.[0];
  expect(finishedPlay).toContain('disabled'); expect(finishedPlay).toContain('Use Replay to start again');
  expect(finishedPlay).toContain('aria-describedby="guided-playback-status"');
  expect(finishedControls.match(/<button\b[^>]*>Replay<\/button>/)?.[0]).not.toContain('disabled');
  view.guidedPacket = emptyGuidedPacket();
  expect(renderToStaticMarkup(createElement(GuidedPacketControls)).match(/<button\b[^>]*>Play<\/button>/)?.[0]).toContain('disabled');
  view.packetVisualizationMode = 'live';
  expect(renderToStaticMarkup(createElement(PacketLayer)).match(/class="packet-dot"/g)).toHaveLength(2);
});

it('shows real collection counts with disabled playback, then replaces feedback when replay starts', () => {
  view.guidedPacket = emptyGuidedPacket();
  let controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).not.toContain('Waiting for next ping...'); // Idle is distinct from an armed observation.
  expect(controls).toContain('Choose Observe next ping');
  view.guidedPacket = waitForGuidedPacket();
  controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('Waiting for next ping...'); expect(controls).not.toContain('Capturing ping');
  for (let count = 1; count <= 4; count++) {
    view.guidedPacket = { ...view.guidedPacket, status: 'collecting', attempts: Array.from({ length: count }, (_, index) => ({
      seq: index + 3, requestRoot: index + 1, requestDestination: null, replyRoot: null, replyDestination: null, deadline: 10000, replied: false,
    })) };
    controls = renderToStaticMarkup(createElement(GuidedPacketControls));
    expect(controls).toContain(`Capturing ping ${count}/4...`); expect(controls).not.toContain('Waiting for next ping...');
    expect(controls.match(/<button\b[^>]*>Play<\/button>/)?.[0]).toContain('disabled');
    expect(controls.match(/<button\b[^>]*>Replay<\/button>/)?.[0]).toContain('disabled');
  }
  view.guidedPacket = { ...view.guidedPacket, status: 'playing', message: '4/4 requests observed', hops: [{
    id: 1, start: 0, end: 80, linkId: '1', fromDeviceId: 'a', toDeviceId: 'switch', kind: 'icmp',
    fromDeviceName: 'PC1', toDeviceName: 'SW1', fromInterface: 'eth0', toInterface: 'eth1', ping: 1, direction: 'request',
  }] };
  controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('4/4 requests observed'); expect(controls).not.toContain('Capturing ping');
  expect(controls).not.toContain('Preparing replay');
  expect(controls.match(/<button\b[^>]*>Pause<\/button>/)?.[0]).not.toContain('disabled');
  expect(controls.match(/<button\b[^>]*>Replay<\/button>/)?.[0]).not.toContain('disabled');
  view.guidedPacket = { ...view.guidedPacket, status: 'incomplete', message: 'No ICMP request observed.' };
  controls = renderToStaticMarkup(createElement(GuidedPacketControls));
  expect(controls).toContain('No ICMP request observed.'); expect(controls).not.toContain('Waiting for next ping...');
});
