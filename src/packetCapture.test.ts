import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CAPTURE_BATCH_MS, MAX_CAPTURE_RECORDS, MAX_CAPTURE_TEXT_LENGTH, PacketCapture } from './packetCapture';
import { Network, type WireFrameContext, type WireTransfer } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import { parseCidr, parseIp } from './engine/ip';
import type { EthernetFrame } from './engine/types';

const transfer = (id = 1): WireTransfer => ({ id, linkId: 'link', fromDeviceId: 'a', toDeviceId: 'b', kind: 'arp', start: id, end: id + 80 });
const arp = (): EthernetFrame => ({ srcMac: 'aa', dstMac: 'ff', payload: {
  kind: 'arp', op: 'request', senderIp: 1, senderMac: 'aa', targetIp: 2, targetMac: null,
} });
const context = (frame = arp()): WireFrameContext => ({ frame, fromInterface: 'eth2', toInterface: 'eth1', fromDeviceName: 'PC', toDeviceName: 'Router' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });

it('batches ARP/IPv4 snapshots on wall time and owns independent nested data', () => {
  const publish = vi.fn(), capture = new PacketCapture(publish), t = transfer(), ctx = context();
  const frame: EthernetFrame = { srcMac: 'aa', dstMac: 'ff', payload: {
    kind: 'ipv4', src: 1, dst: 2, ttl: 64,
    l4: { kind: 'udp', srcPort: 520, dstPort: 520, app: { kind: 'rip', routes: [{ dest: 123, prefix: 24, metric: 1 }] } },
  } };
  capture.start(); publish.mockClear();
  capture.observe(t, ctx); capture.observe({ ...transfer(2), kind: 'udp' }, context(frame));
  t.start = 900; ctx.fromDeviceName = 'Renamed';
  if (ctx.frame.payload.kind === 'arp') ctx.frame.payload.targetIp = 999;
  if (frame.payload.kind === 'ipv4' && frame.payload.l4.kind === 'udp' && frame.payload.l4.app?.kind === 'rip') frame.payload.l4.app.routes[0].metric = 16;
  expect(capture.state.records).toEqual([]); expect(publish).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(CAPTURE_BATCH_MS - 1); expect(publish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(publish).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  expect(capture.state.records[0]).toMatchObject({ start: 1, fromDeviceName: 'PC', frame: { payload: { targetIp: 2 } } });
  expect(capture.state.records[1].frame).toMatchObject({ payload: { l4: { app: { routes: [{ metric: 1 }] } } } });
  expect(capture.state.records[1].frame).not.toBe(frame);
});

it('does not clone or schedule work when stopped, paused, or observing a different link', () => {
  const capture = new PacketCapture(vi.fn()), clone = vi.spyOn(globalThis, 'structuredClone');
  capture.observe(transfer(), context()); capture.start('other'); capture.observe(transfer(), context());
  capture.pause(); capture.observe({ ...transfer(), linkId: 'other' }, context());
  expect(clone).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  capture.resume(); capture.observe({ ...transfer(), linkId: 'other' }, context());
  expect(clone).toHaveBeenCalledOnce(); capture.pause(); expect(vi.getTimerCount()).toBe(0);
  expect(capture.state.records).toHaveLength(1); expect(capture.state.linkId).toBe('other');
});

it('bounds pending and published retention and counts both kinds of eviction exactly', () => {
  const capture = new PacketCapture(vi.fn()); capture.start();
  for (let id = 0; id < 1_500; id++) capture.observe(transfer(id), context());
  expect(vi.getTimerCount()).toBe(1); vi.advanceTimersByTime(CAPTURE_BATCH_MS);
  expect(capture.state.records).toHaveLength(MAX_CAPTURE_RECORDS); expect(capture.state.discarded).toBe(500);
  expect(capture.state.records[0].id).toBe(500); expect(capture.state.records.at(-1)!.id).toBe(1499);
  for (let id = 1_500; id < 2_750; id++) capture.observe(transfer(id), context());
  vi.advanceTimersByTime(CAPTURE_BATCH_MS);
  expect(capture.state.records).toHaveLength(MAX_CAPTURE_RECORDS); expect(capture.state.discarded).toBe(1_750);
  expect(capture.state.records[0].id).toBe(1750); expect(capture.state.records.at(-1)!.id).toBe(2749);
  capture.clear(); expect(capture.state.discarded).toBe(0); expect(capture.state.records).toEqual([]);
});

it('flushes on pause/stop, clears pending work, and rejects a callback from an earlier trace', () => {
  const publish = vi.fn(), capture = new PacketCapture(publish), schedule = vi.spyOn(globalThis, 'setTimeout');
  capture.start('link'); capture.observe(transfer(), context());
  capture.pause(); expect(capture.state.status).toBe('paused'); expect(capture.state.records).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  capture.resume(); capture.observe(transfer(2), context());
  const stale = schedule.mock.calls.at(-1)![0] as () => void;
  capture.clear(); const cleared = capture.state; publish.mockClear(); stale();
  vi.advanceTimersByTime(CAPTURE_BATCH_MS);
  expect(capture.state).toBe(cleared); expect(publish).not.toHaveBeenCalled();
  expect(capture.state).toMatchObject({ status: 'capturing', linkId: 'link', records: [] });
  capture.observe(transfer(3), context()); capture.stop();
  expect(capture.state.status).toBe('stopped'); expect(capture.state.records[0].id).toBe(3); expect(vi.getTimerCount()).toBe(0);
  capture.resume(); expect(capture.state.status).toBe('stopped');
  capture.start(); expect(capture.state.records).toEqual([]); expect(capture.state.linkId).toBeNull();
  capture.observe(transfer(), context()); capture.reset();
  expect(capture.state).toEqual({ status: 'stopped', linkId: null, records: [], discarded: 0 }); expect(vi.getTimerCount()).toBe(0);
});

it('limits HTTP text without changing the original or splitting Unicode, and identifies the truncated field', () => {
  const capture = new PacketCapture(vi.fn()), body = 'a'.repeat(MAX_CAPTURE_TEXT_LENGTH - 1) + '🌐 rest';
  const frame: EthernetFrame = { srcMac: 'aa', dstMac: 'bb', payload: { kind: 'ipv4', src: 1, dst: 2, ttl: 64,
    l4: { kind: 'tcp', srcPort: 80, dstPort: 40000, syn: false, ack: true, rst: false, fin: false,
      app: { kind: 'http-response', status: 200, reason: 'OK', body } } } };
  capture.start(); capture.observe({ ...transfer(), kind: 'tcp' }, context(frame)); capture.pause();
  const record = capture.state.records[0];
  expect(record.frame).toMatchObject({ payload: { l4: { app: { body: body.slice(0, MAX_CAPTURE_TEXT_LENGTH - 1) } } } });
  expect(record.truncatedFields).toEqual([{ path: 'frame.payload.l4.app.body', originalLength: body.length, capturedLength: MAX_CAPTURE_TEXT_LENGTH - 1 }]);
  expect(frame.payload).toMatchObject({ l4: { app: { body } } });
});

function switchedPair() {
  const net = new Network(), a = createDevice(net, 'host') as IpDevice, sw = createDevice(net, 'switch'), b = createDevice(net, 'host') as IpDevice;
  const left = net.connect(a.id, sw.id), right = net.connect(sw.id, b.id);
  a.interfaces[0].ip = parseCidr('10.0.0.1/24'); b.interfaces[0].ip = parseCidr('10.0.0.2/24');
  return { net, a, b, sw, left, right };
}

it('observes multiple links without duplicate send/receive entries and preserves removed endpoints', () => {
  const { net, a, b, sw, left, right } = switchedPair(), capture = new PacketCapture(vi.fn());
  net.onWireTransfer = (t, ctx) => capture.observe(t, ctx); capture.start();
  a.sendEcho(parseIp('10.0.0.2')!, 1, 1); net.scheduler.advanceTo(1_000); capture.pause();
  expect(capture.state.records).toHaveLength(8); expect(new Set(capture.state.records.map((r) => r.id)).size).toBe(8);
  expect(capture.state.records.filter((r) => r.linkId === left.id)).toHaveLength(4);
  expect(capture.state.records.filter((r) => r.linkId === right.id)).toHaveLength(4);
  expect(capture.state.records[1]).toMatchObject({ fromDeviceId: sw.id, fromInterface: 'eth1', toDeviceId: b.id, toInterface: 'eth0' });
  const trace = structuredClone(capture.state.records); net.removeDevice(sw.id); a.name = 'New name';
  expect(capture.state.records).toEqual(trace);
});

it('keeps ping delivery working if snapshot cloning or publication fails', () => {
  const { net, a } = switchedPair(), capture = new PacketCapture(() => { throw new Error('subscriber failed'); });
  net.onWireTransfer = (t, ctx) => capture.observe(t, ctx);
  capture.start(); const replies = vi.fn(); a.onIcmp(1, replies);
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => { throw new Error('clone failed'); });
  a.sendEcho(parseIp('10.0.0.2')!, 1, 1); net.scheduler.advanceTo(1_000);
  expect(replies).toHaveBeenCalledWith(expect.objectContaining({ type: 'reply', seq: 1 }));
  expect(capture.state.records).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  clone.mockRestore(); a.sendEcho(parseIp('10.0.0.2')!, 1, 2); net.scheduler.advanceTo(2_000);
  expect(() => vi.advanceTimersByTime(CAPTURE_BATCH_MS)).not.toThrow(); expect(capture.state.records).toHaveLength(4);
});
