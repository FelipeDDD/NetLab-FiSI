import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { Shell } from '../commands/shell';
import { disposeNetwork } from '../engine/networkLifecycle';
import type { WireFrameContext, WireTransfer, WireVisualTrace } from '../engine/network';
import { PacketLayer } from '../components/PacketLayer';
import { visibleGuidedHops } from '../guidedPacket';
import { STATIC_IDS as I, staticRoutingDocument } from './staticRoutingChapter';

vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
// SSR normally reads Zustand's initial server snapshot. Keep the real store
// actions/engine, but let this renderer inspect the state at each visual tick.
vi.mock('../store', async importOriginal => {
  const actual = await importOriginal<typeof import('../store')>();
  return { ...actual, useStore: Object.assign((select: (state: ReturnType<typeof actual.useStore.getState>) => unknown) => select(actual.useStore.getState()), actual.useStore) };
});
vi.mock('@xyflow/react', () => ({ useViewport: () => ({ x: 0, y: 0, zoom: 1 }), ViewportPortal: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });

it('presents the real cold-cache first ping at 0.25× in causal order, including the router failure', () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  useStore.getState().importJson(JSON.stringify(staticRoutingDocument().topology));
  useStore.getState().setPacketAnimationSpeed(0.25); useStore.getState().setPaused(false);
  expect([...sim.net.devices.values()].filter(d => d instanceof IpDevice).every(d => d.arpTable.size === 0)).toBe(true);
  const observations: { transfer: WireTransfer; context: WireFrameContext; trace?: WireVisualTrace }[] = [];
  const original = sim.net.onWireTransfer!;
  sim.net.onWireTransfer = (transfer, context, trace) => { observations.push({ transfer, context, trace }); original(transfer, context, trace); };
  new Shell(sim.net.devices.get(I.a) as IpDevice).exec('ping -c 1 192.168.20.20', { write: () => {} }, () => {});
  const firstSeen = new Map<number, number>(), lastSeen = new Map<number, number>();
  for (let time = 0; time <= 8000; time += 10) {
    if (time) useStore.getState().tick(10);
    const markup = renderToStaticMarkup(createElement(PacketLayer));
    for (const match of markup.matchAll(/data-transfer-id="(\d+)"/g)) { const id = Number(match[1]); if (!firstSeen.has(id)) firstSeen.set(id, time); lastSeen.set(id, time); }
    const stages = visibleGuidedHops(useStore.getState().guidedPacket.playback);
    expect(new Set(stages.map(h => h.visualStep)).size).toBeLessThanOrEqual(1);
  }
  const arp = observations.filter(o => o.context.frame.payload.kind === 'arp');
  const request = arp.filter(o => o.context.frame.payload.kind === 'arp' && o.context.frame.payload.op === 'request');
  const reply = arp.filter(o => o.context.frame.payload.kind === 'arp' && o.context.frame.payload.op === 'reply');
  expect(request.map(o => [o.transfer.fromDeviceId, o.transfer.toDeviceId])).toEqual([[I.a, I.sa], [I.sa, I.r1]]);
  expect(reply.map(o => [o.transfer.fromDeviceId, o.transfer.toDeviceId])).toEqual([[I.r1, I.sa], [I.sa, I.a]]);
  const icmp = observations.filter(o => o.context.frame.payload.kind === 'ipv4' && o.context.frame.payload.l4.kind === 'icmp');
  expect(icmp.map(o => [o.transfer.fromDeviceId, o.transfer.toDeviceId])).toEqual([[I.a, I.sa], [I.sa, I.r1], [I.r1, I.sa], [I.sa, I.a]]);
  const chain = [...request, ...reply, ...icmp];
  console.log('CHAPTER4_COLD_ARP_SEQUENCE=' + JSON.stringify(chain.map(o => ({ id: o.transfer.id, from: o.transfer.fromDeviceId, to: o.transfer.toDeviceId,
    kind: o.context.frame.payload.kind === 'arp' ? o.context.frame.payload.op : o.context.frame.payload.l4.kind === 'icmp' ? o.context.frame.payload.l4.msg.type : '',
    engineStart: o.transfer.start, engineEnd: o.transfer.end, firstVisible: firstSeen.get(o.transfer.id), lastVisible: lastSeen.get(o.transfer.id) }))));
  for (let index = 1; index < chain.length; index++) {
    const previous = chain[index - 1].transfer, next = chain[index].transfer;
    expect(next.start).toBeGreaterThanOrEqual(previous.end);
    expect(firstSeen.get(next.id), `visible transfer ${next.id} must follow delivery ${previous.id}`).toBeGreaterThan(lastSeen.get(previous.id)!);
  }
});

it('keeps every ARP delivery before its response and queued IP frame on a successful cold-cache routed ping', () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  useStore.getState().importJson(JSON.stringify(staticRoutingDocument().topology));
  useStore.getState().setPacketAnimationSpeed(0.25); useStore.getState().setPaused(false);
  for (const [router, lan, via] of [[I.r1, '192.168.20.0/24', '10.0.12.2'], [I.r2, '192.168.20.0/24', '10.0.23.2'], [I.r3, '192.168.10.0/24', '10.0.23.1'], [I.r2, '192.168.10.0/24', '10.0.12.1']]) {
    new Shell(sim.net.devices.get(router) as IpDevice).exec(`ip route add ${lan} via ${via}`, { write: () => {} }, () => {});
  }
  const transmissions: { transfer: WireTransfer; trace?: WireVisualTrace }[] = [], original = sim.net.onWireTransfer!;
  sim.net.onWireTransfer = (transfer, context, trace) => { transmissions.push({ transfer, trace }); original(transfer, context, trace); };
  let output = '';
  new Shell(sim.net.devices.get(I.a) as IpDevice).exec('ping -c 1 192.168.20.20', { write: text => output += text }, () => {});
  const first = new Map<number, number>(), last = new Map<number, number>();
  for (let time = 0; time <= 30000; time += 20) {
    if (time) useStore.getState().tick(20);
    for (const match of renderToStaticMarkup(createElement(PacketLayer)).matchAll(/data-transfer-id="(\d+)"/g)) {
      const id = Number(match[1]); if (!first.has(id)) first.set(id, time); last.set(id, time);
    }
  }
  expect(output).toContain('64 bytes from 192.168.20.20');
  expect(useStore.getState().guidedPacket.observation.attempts[0].replied).toBe(true);
  for (const { transfer, trace } of transmissions) {
    expect(first.has(transfer.id), `real hop ${transfer.id} must remain visible`).toBe(true);
    for (const predecessor of [trace?.parentTransferId, trace?.arpRequestTransferId, trace?.resolvedArpTransferId, trace?.echoRequestTransferId]) {
      if (predecessor === undefined) continue;
      expect(first.get(transfer.id), `response/forwarding ${transfer.id} must follow ${predecessor}`).toBeGreaterThan(last.get(predecessor)!);
    }
  }
});
