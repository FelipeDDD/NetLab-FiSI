import { expect, it } from 'vitest';
import type { CapturedPacket, PacketCaptureState } from './packetCapture';
import { emptyPacketLiveView, newPacketCount, packetCaptureWasReset, packetLivePage, receivedPacketCount, suspendPacketLive } from './packetLiveView';

const records = Array.from({ length: 1250 }, (_, i) => ({ id: i + 1 }) as CapturedPacket);
const capture = (count: number): PacketCaptureState => ({
  status: 'capturing', linkId: null, records: records.slice(Math.max(0, count - 1000), count), discarded: Math.max(0, count - 1000),
});

it.each([0, 1, 49, 50, 51, 100, 101, 150, 151])('follows the latest page at %i records without changing the 50-row limit', (count) => {
  const { start, rows } = packetLivePage(capture(count), emptyPacketLiveView());
  expect(start).toBe(count === 0 ? 0 : Math.floor((count - 1) / 50) * 50);
  expect(rows.length).toBeLessThanOrEqual(50);
  expect(rows.at(-1)).toBe(count === 0 ? undefined : records[count - 1]);
});

it('suspends on the current page, keeps its object anchor and counts only subsequent arrivals', () => {
  let state = capture(133);
  const view = suspendPacketLive(state, emptyPacketLiveView());
  expect(view.following).toBe(false);
  expect(view.anchor).toBe(records[100]);
  state = capture(160);
  expect(packetLivePage(state, view)).toEqual({ start: 100, rows: records.slice(100, 150) });
  expect(newPacketCount(state, view)).toBe(27);
  // Selecting another row or scrolling does not acknowledge those arrivals.
  expect(suspendPacketLive(state, view)).toBe(view);
  const previousPage = { ...view, anchor: records[50] };
  expect(packetLivePage(state, previousPage).rows[0]).toBe(records[50]);
  expect(newPacketCount(state, previousPage)).toBe(27);
  expect(packetLivePage(state, { ...view, following: true }).rows).toEqual(records.slice(150, 160));
  expect(newPacketCount(state, { ...view, following: true })).toBe(0);
});

it('continues following and counting beyond 1000 records, including batches larger than a page', () => {
  const frozen = suspendPacketLive(capture(1000), emptyPacketLiveView());
  const state = capture(1125);
  expect(receivedPacketCount(state)).toBe(1125);
  expect(newPacketCount(state, frozen)).toBe(125);
  expect(packetLivePage(state, frozen)).toEqual({ start: 825, rows: records.slice(950, 1000) });
  expect(packetLivePage(state, emptyPacketLiveView())).toEqual({ start: 950, rows: records.slice(1075, 1125) });
  expect(packetCaptureWasReset(capture(1000), state)).toBe(false);
  expect(packetLivePage(capture(1250), { ...frozen, anchor: records[0] }).start).toBe(0);
});

it('preserves follow/suspended state and unseen counts across capture pause/resume', () => {
  const view = suspendPacketLive(capture(50), emptyPacketLiveView());
  const pendingFlush = { ...capture(55), status: 'paused' as const };
  expect(newPacketCount(pendingFlush, view)).toBe(5);
  expect(packetCaptureWasReset(capture(50), pendingFlush)).toBe(false);
  const resumed = capture(60);
  expect(newPacketCount(resumed, view)).toBe(10);
  expect(packetLivePage(resumed, view).start).toBe(0);
  expect(packetLivePage(resumed, emptyPacketLiveView()).start).toBe(50);
});

it('recognizes clear/new capture/topology reset independently of pause and stop', () => {
  const before = capture(1125);
  expect(packetCaptureWasReset(before, capture(0))).toBe(true);
  expect(packetCaptureWasReset(before, capture(2))).toBe(true);
  expect(packetCaptureWasReset(before, { ...before, status: 'stopped' })).toBe(false);
  expect(newPacketCount(capture(0), emptyPacketLiveView())).toBe(0);
});
