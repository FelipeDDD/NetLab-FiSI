import { expect, it } from 'vitest';
import type { WireFrameContext, WireTransfer } from './engine/network';
import { advanceGuidedPacket, finishGuidedCollection, MAX_GUIDED_HOPS, observeGuidedPacket, observeGuidedPingProgress, replayGuidedPacket, stepGuidedPacket, validateGuidedPacket, waitForGuidedPacket, type GuidedPacketState } from './guidedPacket';

const context = (seq = 1, id = 7, reply = false): WireFrameContext => ({
  fromDeviceName: 'PC', toDeviceName: 'Switch', fromInterface: 'eth0', toInterface: 'eth1',
  frame: { srcMac: 'aa', dstMac: 'bb', payload: { kind: 'ipv4', src: 1, dst: 2, ttl: 64,
    l4: { kind: 'icmp', msg: { type: reply ? 'echo-reply' : 'echo-request', id, seq } } } },
});
const transfer = (id: number, start = 0, fromDeviceId = 'a', toDeviceId = 'sw'): WireTransfer => ({
  id, start, end: start + 80, linkId: `link-${id}`, fromDeviceId, toDeviceId, kind: 'icmp',
});
function observations(missing: number[] = []) {
  let state = waitForGuidedPacket();
  for (let seq = 1; seq <= 4; seq++) {
    const id = (seq - 1) * 4 + 1, start = (seq - 1) * 1000;
    state = observeGuidedPacket(state, transfer(id, start), context(seq), undefined, false);
    state = observeGuidedPacket(state, transfer(id + 1, start + 80, 'sw', 'b'), context(seq), { parentTransferId: id }, true);
    if (missing.includes(seq)) continue;
    state = observeGuidedPacket(state, transfer(id + 2, start + 160, 'b', 'sw'), context(seq, 7, true), { echoRequestTransferId: id + 1 }, false);
    state = observeGuidedPacket(state, transfer(id + 3, start + 240, 'sw', 'a'), context(seq, 7, true), { parentTransferId: id + 2, echoRequestTransferId: id + 1 }, true);
  }
  return state;
}
const path = () => finishGuidedCollection(observations(), 3320);

it('finishes missing attempts at their real outcomes and ignores other ping sessions', () => {
  let state = observations([2, 4]);
  expect(observeGuidedPingProgress(state, { deviceId: 'other', icmpId: 7, type: 'finished' }, 3000)).toBe(state);
  expect(observeGuidedPingProgress(state, { deviceId: 'a', icmpId: 8, type: 'finished' }, 3000)).toBe(state);
  state = observeGuidedPingProgress(state, { deviceId: 'a', icmpId: 7, seq: 2, type: 'settled' }, 3000);
  expect(state.status).toBe('collecting');
  state = observeGuidedPingProgress(state, { deviceId: 'a', icmpId: 7, seq: 4, type: 'settled' }, 5000);
  expect(state.status).toBe('playing'); expect(state.attempts.map((attempt) => attempt.replied)).toEqual([true, false, true, false]);
});

it('finishes fewer than four attempts on source finish, but preserves known pending wire transfers', () => {
  const all = observations();
  const partial = { ...all, attempts: all.attempts.slice(0, 2), observed: all.observed.filter((hop) => hop.ping <= 2) };
  expect(finishGuidedCollection(partial, 1320)).toBe(partial);
  const finished = observeGuidedPingProgress(partial, { deviceId: 'a', icmpId: 7, type: 'finished' }, 1320);
  expect(finished.status).toBe('playing'); expect(finished.attempts).toHaveLength(2);
  expect(observeGuidedPingProgress(partial, { deviceId: 'a', icmpId: 7, type: 'finished' }, 1319).status).toBe('collecting');
});

it('observes a pending request continuation before closing at its delivery boundary, even past the safety window', () => {
  const captured = observations([4]);
  let state: GuidedPacketState = { ...captured, observed: captured.observed.map((hop) => hop.id === 14 ? { ...hop, end: 12000 } : hop) };
  state = observeGuidedPingProgress(state, { type: 'settled', deviceId: 'a', icmpId: 7, seq: 4 }, 5000);
  expect(finishGuidedCollection(state, 10000).status).toBe('collecting');
  state = observeGuidedPacket(state, transfer(15, 12000, 'b', 'sw'), context(4, 7, true), { echoRequestTransferId: 14 }, false);
  expect(finishGuidedCollection(state, 12000).status).toBe('collecting');
  state = observeGuidedPacket(state, transfer(16, 12080, 'sw', 'a'), context(4, 7, true), { parentTransferId: 15, echoRequestTransferId: 14 }, true);
  expect(finishGuidedCollection(state, 12159).status).toBe('collecting');
  expect(finishGuidedCollection(state, 12160)).toMatchObject({ status: 'playing', hops: expect.arrayContaining([expect.objectContaining({ id: 16 })]) });
});

it('selects one device/ICMP session and pairs replies by exact request identity, never by addresses or timing', () => {
  const waiting = waitForGuidedPacket();
  expect(observeGuidedPacket(waiting, transfer(1), context(), { parentTransferId: 99 }, false)).toBe(waiting);
  expect(observeGuidedPacket(waiting, transfer(1), context(1, 7, true), undefined, true)).toBe(waiting);
  const selected = observeGuidedPacket(waiting, transfer(1), context(), undefined, false);
  expect(observeGuidedPacket(selected, transfer(2, 10, 'another-pc'), context(), undefined, false)).toBe(selected);
  expect(observeGuidedPacket(selected, transfer(3), context(2, 8), undefined, false)).toBe(selected);
  expect(observeGuidedPacket(selected, transfer(4), context(1, 7, true), { echoRequestTransferId: 999 }, true)).toBe(selected);
  const captured = observations();
  expect(finishGuidedCollection(captured, 3319)).toBe(captured);
  const playing = path();
  expect(playing.attempts.map((a) => [a.seq, a.replied])).toEqual([[1, true], [2, true], [3, true], [4, true]]);
  expect(playing.hops.map((hop) => `${hop.ping}:${hop.direction}`)).toEqual([1, 2, 3, 4].flatMap((i) => [`${i}:request`, `${i}:request`, `${i}:reply`, `${i}:reply`]));
  expect(new Set(playing.hops.map((h) => h.id)).size).toBe(16); expect(playing.observed).toEqual([]);
  expect(playing.hops[0]).not.toHaveProperty('frame'); expect(playing.hops[0].fromDeviceName).toBe('PC');
  expect(observeGuidedPacket(captured, transfer(99, 4000), context(5), undefined, false)).toBe(captured);
});

it('plays and replays the four real round trips, pauses, changes speed and holds the final endpoint', () => {
  const playing = path(), middle = advanceGuidedPacket(playing, 500, 1000);
  expect(middle.index).toBe(0); expect(middle.progress).toBe(0.5);
  const faster = advanceGuidedPacket(middle, 250, 500);
  expect(faster.index).toBe(1); expect(faster.progress).toBe(0);
  const paused = { ...middle, status: 'paused' as const };
  expect(advanceGuidedPacket(paused, 10000, 1000)).toBe(paused);
  const stepped = stepGuidedPacket(paused);
  expect(stepped.index).toBe(1); expect(stepped.progress).toBe(0); expect(stepped.status).toBe('paused');
  const finished = advanceGuidedPacket(playing, 16000, 1000);
  expect(finished.status).toBe('finished'); expect(finished.progress).toBe(1);
  expect(finished.hops[finished.index]).toMatchObject({ ping: 4, direction: 'reply', toDeviceId: 'a' });
  expect(advanceGuidedPacket(finished, 100000, 1000)).toBe(finished);
  expect(observeGuidedPacket(finished, transfer(99), context(5), undefined, true)).toBe(finished);
  expect(replayGuidedPacket(finished)).toMatchObject({ status: 'playing', index: 0, progress: 0, hops: playing.hops });
});

it('marks missing replies and keeps all four actual attempts without manufacturing return paths', () => {
  const missing = observations([2, 4]);
  expect(finishGuidedCollection(missing, 7999)).toBe(missing);
  const playing = finishGuidedCollection(missing, 8000);
  expect(playing.attempts.map((a) => a.replied)).toEqual([true, false, true, false]);
  expect(playing.hops).toHaveLength(12);
  expect(playing.hops.filter((h) => h.direction === 'reply').map((h) => h.ping)).toEqual([1, 1, 3, 3]);
  const unreachable = finishGuidedCollection(observations([1, 2, 3, 4]), 8000);
  expect(unreachable.attempts).toHaveLength(4); expect(unreachable.hops.every((h) => h.direction === 'request')).toBe(true);
  expect(advanceGuidedPacket(unreachable, 100000, 1000).status).toBe('finished');
});

it('bounds collection, reports absent transmissions and never guesses a flooded incomplete branch', () => {
  expect(finishGuidedCollection(waitForGuidedPacket(100), 10100)).toMatchObject({ status: 'incomplete', hops: [], observed: [] });
  let state = observeGuidedPacket(waitForGuidedPacket(), transfer(1), context(), undefined, false);
  const partial = finishGuidedCollection(state, 10000);
  expect(partial.attempts).toHaveLength(1); expect(partial.message).toContain('Remaining requests were not observed');
  expect(observeGuidedPacket(state, transfer(5), context(), { parentTransferId: 999 }, true)).toBe(state);
  let flooded = observeGuidedPacket(state, transfer(2), context(), { parentTransferId: 1 }, false);
  flooded = observeGuidedPacket(flooded, transfer(3), context(), { parentTransferId: 1 }, false);
  expect(finishGuidedCollection(flooded, 10000).hops.map((h) => h.id)).toEqual([1]);
  for (let id = 2; id <= MAX_GUIDED_HOPS; id++) state = observeGuidedPacket(state, transfer(id, 10), context(), { parentTransferId: id - 1 }, false);
  expect(state.observed).toHaveLength(MAX_GUIDED_HOPS);
  state = observeGuidedPacket(state, transfer(257, 10), context(), { parentTransferId: 256 }, true);
  expect(state).toMatchObject({ status: 'incomplete', observed: [], hops: [] });
});

it('clears removed sequences and cannot revive them through playback controls', () => {
  const original = path();
  expect(validateGuidedPacket(original, () => true)).toBe(original);
  const invalid = validateGuidedPacket(original, (hop) => hop.linkId !== 'link-2');
  expect(invalid).toMatchObject({ status: 'incomplete', hops: [], observed: [] });
  expect(replayGuidedPacket(invalid)).toBe(invalid); expect(stepGuidedPacket(invalid)).toBe(invalid);
});
