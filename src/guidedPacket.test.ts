import { expect, it } from 'vitest';
import type { WireFrameContext, WireTransfer } from './engine/network';
import { advanceGuidedPacket, emptyGuidedPacket, updateGuidedObservation, followGuidedPacket, guidedReplayHops,
  MAX_GUIDED_HOPS, MAX_GUIDED_QUEUE, observeGuidedPacket, observeGuidedPingProgress, replayGuidedPacket,
  stepGuidedPacket, toggleGuidedPlayback, validateGuidedPacket, type GuidedPacketState } from './guidedPacket';
const context = (seq = 1, reply = false): WireFrameContext => ({
  fromDeviceName: 'PC', toDeviceName: 'Switch', fromInterface: 'eth0', toInterface: 'eth1',
  frame: { srcMac: 'aa', dstMac: 'bb', payload: { kind: 'ipv4', src: 1, dst: 2, ttl: 64,
    l4: { kind: 'icmp', msg: { type: reply ? 'echo-reply' : 'echo-request', id: 7, seq } } } },
});
const transfer = (id: number, fromDeviceId = 'a', toDeviceId = 'sw'): WireTransfer => ({
  id, start: 0, end: 80, linkId: `link-${id}`, fromDeviceId, toDeviceId, kind: 'icmp',
});
const start = (state = emptyGuidedPacket(), deviceId = 'a', icmpId = 7) =>
  observeGuidedPingProgress(state, { type: 'started', deviceId, icmpId }, 0);
const attempt = (state: GuidedPacketState, seq = 1) =>
  observeGuidedPingProgress(state, { type: 'attempt', deviceId: 'a', icmpId: 7, seq, local: false, deadline: 2000 }, 0);
function path() {
  let state = attempt(start());
  state = observeGuidedPacket(state, transfer(1), context(), undefined, false);
  state = observeGuidedPacket(state, transfer(2, 'sw', 'b'), context(), { parentTransferId: 1 }, true);
  state = observeGuidedPacket(state, transfer(3, 'b', 'sw'), context(1, true), { echoRequestTransferId: 2 }, false);
  return observeGuidedPacket(state, transfer(4, 'sw', 'a'), context(1, true), { parentTransferId: 3 }, true);
}

const arpContext = (reply = false): WireFrameContext => ({ ...context(), frame: { srcMac: 'aa', dstMac: 'bb',
  payload: { kind: 'arp', op: reply ? 'reply' : 'request', senderIp: 1, senderMac: 'aa', targetIp: 2, targetMac: reply ? 'bb' : null } } });
const arpOrigin = { deviceId: 'a', icmpId: 7, seq: 1, direction: 'request' as const };

it('includes exactly related ARP request/reply hops before ICMP, with individual Step and immutable Replay', () => {
  let state = attempt(start());
  state = observeGuidedPacket(state, { ...transfer(1), kind: 'arp' }, arpContext(), { arpPing: arpOrigin }, false);
  state = observeGuidedPacket(state, { ...transfer(2, 'sw', 'b'), kind: 'arp' }, arpContext(), { parentTransferId: 1, arpPing: arpOrigin }, false);
  state = observeGuidedPacket(state, { ...transfer(3, 'b', 'sw'), kind: 'arp' }, arpContext(true), { arpRequestTransferId: 2, arpPing: arpOrigin }, false);
  state = observeGuidedPacket(state, { ...transfer(4, 'sw', 'a'), kind: 'arp' }, arpContext(true), { parentTransferId: 3, arpPing: arpOrigin }, false);
  state = observeGuidedPacket(state, transfer(5), context(), undefined, false);
  state = observeGuidedPacket(state, transfer(6, 'sw', 'b'), context(), { parentTransferId: 5 }, true);
  state = observeGuidedPacket(state, transfer(7, 'b', 'sw'), context(1, true), { echoRequestTransferId: 6 }, false);
  state = observeGuidedPacket(state, transfer(8, 'sw', 'a'), context(1, true), { parentTransferId: 7 }, true);
  expect(guidedReplayHops(state.observation).map(h => h.arp ?? h.direction)).toEqual(['request', 'request', 'reply', 'reply', 'request', 'request', 'reply', 'reply']);
  const replay = replayGuidedPacket(state);
  expect(replay.playback.hops.map(h => h.kind)).toEqual(['arp', 'arp', 'arp', 'arp', 'icmp', 'icmp', 'icmp', 'icmp']);
  const step = stepGuidedPacket(replay); expect(step.playback).toMatchObject({ index: 1, progress: 0, status: 'paused' });
  expect(step.observation).toBe(state.observation);
});

it('never infers ARP ownership from matching IPs, ICMP IDs or arrival times', () => {
  const state = attempt(start()), arp = { ...transfer(1), kind: 'arp' as const };
  expect(observeGuidedPacket(state, arp, arpContext(), undefined, false)).toBe(state);
  expect(observeGuidedPacket(state, arp, arpContext(), { arpPing: { ...arpOrigin, deviceId: 'other-host' } }, false)).toBe(state);
  expect(observeGuidedPacket(state, arp, arpContext(), { arpPing: { ...arpOrigin, icmpId: 8 } }, false)).toBe(state);
  expect(observeGuidedPacket(state, arp, arpContext(true), { arpPing: arpOrigin, arpRequestTransferId: 999 }, false)).toBe(state);
  const focused = start(state, 'new-host', 7);
  expect(observeGuidedPacket(focused, arp, arpContext(), { arpPing: arpOrigin }, false)).toBe(focused);
});
it('starts on the first actual transmission and keeps observation independent of playback', () => {
  let state = attempt(start());
  expect(state.playback.hops).toEqual([]);
  state = observeGuidedPacket(state, transfer(1), context(), undefined, false);
  expect(state.playback).toMatchObject({ status: 'playing', hops: [expect.objectContaining({ id: 1 })] });
  state = toggleGuidedPlayback(state);
  state = observeGuidedPacket(state, transfer(2, 'sw', 'b'), context(), { parentTransferId: 1 }, true);
  expect(state.playback.status).toBe('paused'); expect(state.observation.observed).toHaveLength(2);
  expect(updateGuidedObservation(state, 10000).observation.status).toBe('observing');
});
it('the newest command takes focus before wire traffic; old attempts, replies and finish cannot take it back', () => {
  const state = start(replayGuidedPacket(path()), 'new', 7); // Same ICMP id on a different host.
  expect(state.playback.hops).toEqual([]); expect(state.playback.kind).toBe('follow');
  expect(observeGuidedPingProgress(state, { type: 'finished', deviceId: 'a', icmpId: 7 }, 100)).toBe(state);
  expect(attempt(state, 2)).toBe(state);
  expect(observeGuidedPacket(state, transfer(9), context(), undefined, true)).toBe(state);
  expect(observeGuidedPacket(state, transfer(10, 'b', 'a'), context(1, true), { echoRequestTransferId: 2 }, true)).toBe(state);
  expect(start(state, 'new', 8).observation.session).toEqual({ deviceId: 'new', icmpId: 8 });
});
it('replay freezes real correlated paths while observing new attempts from the focused session', () => {
  let state = replayGuidedPacket(path()); const replay = state.playback;
  expect(replay.hops.map(h => h.direction)).toEqual(['request', 'request', 'reply', 'reply']);
  state = attempt(state, 2);
  state = observeGuidedPacket(state, transfer(5), context(2), undefined, false);
  expect(state.playback).toBe(replay); expect(state.observation.observed).toHaveLength(5);
  state = followGuidedPacket(state);
  expect(state.playback.hops).toEqual([]);
  state = observeGuidedPacket(state, transfer(6, 'sw', 'b'), context(2), { parentTransferId: 5 }, true);
  expect(state.playback.hops.map(h => h.id)).toEqual([6]);
});
it('replay/step/pause/speed operate on the cursor without changing observations', () => {
  const state = replayGuidedPacket(path());
  const half = advanceGuidedPacket(state, 500, 1000);
  expect(half.playback.progress).toBe(.5);
  expect(advanceGuidedPacket(half, 250, 500).playback.index).toBe(1);
  const paused = toggleGuidedPlayback(half);
  expect(advanceGuidedPacket(paused, 5000, 1000)).toBe(paused);
  expect(stepGuidedPacket(paused).playback).toMatchObject({ index: 1, progress: 0, status: 'paused' });
  const finished = advanceGuidedPacket(state, 4000, 1000);
  expect(finished.playback.status).toBe('finished'); expect(toggleGuidedPlayback(finished)).toBe(finished);
  expect(finished.observation).toBe(state.observation);
  expect(replayGuidedPacket(finished).playback).toMatchObject({ status: 'playing', index: 0 });
});
it('waits for further hops without permanently finishing a continuous session', () => {
  let state = advanceGuidedPacket(path(), 4000, 1000);
  expect(state.playback.status).toBe('waiting');
  state = attempt(state, 2);
  state = observeGuidedPacket(state, transfer(5), context(2), undefined, false);
  expect(state.playback).toMatchObject({ status: 'playing', index: 0, progress: 0 });
  expect(state.playback.hops.map(h => h.id)).toEqual([5]);
});
it('bounds a paused backlog and keeps a rolling four-attempt observation for continuous pings', () => {
  let state = toggleGuidedPlayback(path());
  for (let seq = 2; seq <= 1000; seq++) {
    state = attempt(state, seq);
    state = observeGuidedPacket(state, transfer(seq + 4), context(seq), undefined, false);
  }
  expect(state.observation.attempts.map(a => a.seq)).toEqual([997, 998, 999, 1000]);
  expect(state.observation.observed).toHaveLength(4);
  expect(state.playback.hops).toHaveLength(MAX_GUIDED_QUEUE); expect(state.playback.skipped).toBeGreaterThan(0);
  expect(guidedReplayHops(state.observation).map(h => h.ping)).toEqual([997, 998, 999, 1000]);
});
it('bounds an individual flooding path and never invents an ambiguous replay branch', () => {
  let state = attempt(start()); state = observeGuidedPacket(state, transfer(1), context(), undefined, false);
  state = observeGuidedPacket(state, transfer(2, 'sw', 'b'), context(), { parentTransferId: 1 }, false);
  state = observeGuidedPacket(state, transfer(3, 'sw', 'c'), context(), { parentTransferId: 1 }, false);
  expect(guidedReplayHops(state.observation).map(h => h.id)).toEqual([1]);
  for (let id = 4; id <= MAX_GUIDED_HOPS + 1; id++) state = observeGuidedPacket(state, transfer(id), context(), { parentTransferId: 1 }, false);
  expect(state.observation.observed).toHaveLength(MAX_GUIDED_HOPS); expect(state.observation.truncated).toBe(true);
});
it('does not turn local ping or failure before transmission into empty replay; waits for known in-flight hops', () => {
  let local = observeGuidedPingProgress(start(), { type: 'attempt', deviceId: 'a', icmpId: 7, seq: 1, local: true, deadline: 2000 }, 0);
  local = observeGuidedPingProgress(local, { type: 'finished', deviceId: 'a', icmpId: 7 }, 2);
  expect(local.observation.message).toContain('Local ping'); expect(replayGuidedPacket(local)).toBe(local);
  let state = observeGuidedPingProgress(path(), { type: 'finished', deviceId: 'a', icmpId: 7 }, 79);
  expect(state.observation.status).toBe('observing');
  state = updateGuidedObservation(state, 80); expect(state.observation.status).toBe('complete');
  expect(state.observation.attempts[0].replied).toBe(true);
  expect(start(state).observation.status).toBe('observing');
});
it('invalidates removed paths without letting old events resurrect them; a new command still works', () => {
  const original = path(); expect(validateGuidedPacket(original, () => true)).toBe(original);
  const invalid = validateGuidedPacket(original, h => h.id !== 2);
  expect(invalid.observation.status).toBe('incomplete'); expect(invalid.playback.hops).toEqual([]);
  expect(attempt(invalid, 2)).toBe(invalid); expect(replayGuidedPacket(invalid)).toBe(invalid);
  expect(start(invalid, 'a', 8).observation.session?.icmpId).toBe(8);
});
