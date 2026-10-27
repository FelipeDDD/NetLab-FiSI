import { afterEach, expect, it, vi } from 'vitest';
import { PACKET_ANIMATION_BASE_MS, PACKET_ANIMATION_KEY, PACKET_ANIMATION_SPEED_KEY, PACKET_ANIMATION_SPEEDS, normalizePacketAnimationSpeed, packetAnimationDuration, packetAnimationProgress, readPacketAnimationSpeed, retimePacketAnimations, savePacketAnimationSpeed, sequencePacketAnimation, type AnimatedTransfer } from './packetAnimation';
import { clampPacketWidget, readPacketAnimationPlacement, savePacketAnimationPlacement } from './packetAnimationWidget';

afterEach(() => vi.unstubAllGlobals());
const packet: AnimatedTransfer = { id: 1, linkId: 'link', fromDeviceId: 'a', toDeviceId: 'b', kind: 'icmp',
  start: 80, end: 160, visualStart: 500, visualDuration: 1000 };

it('uses independent visual duration and expires at its visual deadline', () => {
  expect(packetAnimationProgress(packet, 499)).toBeNull();
  expect(packetAnimationProgress(packet, 500)).toBe(0);
  expect(packetAnimationProgress(packet, 1000)).toBe(0.5);
  expect(packetAnimationProgress(packet, 1500)).toBeNull();
  expect(packetAnimationProgress({ ...packet, visualDuration: 200 }, 600)).toBe(0.5);
  expect(packetAnimationProgress({ ...packet, visualDuration: 2500 }, 1750)).toBe(0.5);
});

it('changes ongoing duration without jumping position, changing engine timestamps or reviving expired dots', () => {
  const expired = { ...packet, id: 2, visualStart: 0 };
  const [changed] = retimePacketAnimations([packet, expired], 1000, 2500);
  expect(packetAnimationProgress(changed, 1000)).toBe(0.5);
  expect(changed.visualDuration).toBe(2500); expect(changed.start).toBe(80); expect(changed.end).toBe(160);
  expect(retimePacketAnimations([packet, expired], 1000, 2500)).toHaveLength(1);
  expect(packet.visualDuration).toBe(1000); expect(packet.visualStart).toBe(500);
});

it('normalizes bounds and persists a local preference without requiring storage', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  expect(readPacketAnimationSpeed()).toBe(1);
  expect(PACKET_ANIMATION_BASE_MS).toEqual({ live: 200, guided: 1000 });
  expect([1, 2, 4].map(speed => packetAnimationDuration(speed))).toEqual([200, 100, 50]);
  expect(PACKET_ANIMATION_SPEEDS.map(speed => packetAnimationDuration(speed, 'guided'))).toEqual([4000, 2000, 1000, 1000 / 1.5, 500, 1000 / 3, 250]);
  expect(normalizePacketAnimationSpeed(9)).toBe(4); expect(normalizePacketAnimationSpeed(NaN)).toBe(1);
  values.set(PACKET_ANIMATION_KEY, '2000'); expect(readPacketAnimationSpeed()).toBe(0.5);
  expect(values.get(PACKET_ANIMATION_SPEED_KEY)).toBe('0.5');
  savePacketAnimationSpeed(4); expect(readPacketAnimationSpeed()).toBe(4);
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  expect(readPacketAnimationSpeed()).toBe(1); expect(() => savePacketAnimationSpeed(4)).not.toThrow();
});

it('sequences only identified predecessors and keeps branches and independent transfers concurrent', () => {
  const first = sequencePacketAnimation(packet, undefined, [], 0, 1000)!;
  const child = sequencePacketAnimation({ ...packet, id: 2 }, { parentTransferId: 1 }, [first], 80, 1000)!;
  const branch = sequencePacketAnimation({ ...packet, id: 3 }, { parentTransferId: 1 }, [first, child], 80, 1000)!;
  const unrelated = sequencePacketAnimation({ ...packet, id: 4 }, undefined, [first, child], 80, 1000)!;
  expect(child.visualStart).toBe(1000); expect(branch.visualStart).toBe(1000); expect(unrelated.visualStart).toBe(80);
  expect(packetAnimationProgress(child, 900)).toBeNull();
  const changed = retimePacketAnimations([first, child, branch], 100, 500);
  expect(packetAnimationProgress(changed[0], 100)).toBe(0.1);
  expect(changed[1].visualStart).toBe(changed[0].visualStart + 500); expect(changed[2].visualStart).toBe(changed[1].visualStart);
});

it.each([1, 2, 4])('orders each request, reply and forwarding hop at %s× without serializing independent pings', speed => {
  const duration = packetAnimationDuration(speed);
  const first = sequencePacketAnimation(packet, undefined, [], 0, duration);
  const last = sequencePacketAnimation({ ...packet, id: 2 }, { parentTransferId: 1 }, [first], 20, duration);
  const reply = sequencePacketAnimation({ ...packet, id: 3 }, { echoRequestTransferId: 2 }, [first, last], 40, duration);
  const next = sequencePacketAnimation({ ...packet, id: 4 }, { parentTransferId: 3, echoRequestTransferId: 2 }, [first, last, reply], 45, duration);
  const independent = sequencePacketAnimation({ ...packet, id: 5 }, undefined, [first, last, reply, next], 40, duration);
  const independentReply = sequencePacketAnimation({ ...packet, id: 6 }, { echoRequestTransferId: 5 }, [first, last, reply, next, independent], 45, duration);
  expect(last.visualStart).toBe(duration); expect(reply.visualStart).toBe(duration * 2); expect(next.visualStart).toBe(duration * 3);
  expect(reply.parentTransferId).toBe(2); expect(next.parentTransferId).toBe(3);
  expect(independent.visualStart).toBe(40); expect(independentReply.visualStart).toBe(40 + duration);
  expect(reply.start).toBe(packet.start); expect(reply.end).toBe(packet.end);
});

it('uses exact ARP request IDs and falls back safely when dependency metadata is missing', () => {
  const request = sequencePacketAnimation({ ...packet, kind: 'arp' }, undefined, [], 0, 200);
  const reply = sequencePacketAnimation({ ...packet, id: 2, kind: 'arp' }, { arpRequestTransferId: 1 }, [request], 80, 200);
  expect(reply.visualStart).toBe(200); expect(reply.parentTransferId).toBe(1);
  const missing = sequencePacketAnimation({ ...packet, id: 3 }, { echoRequestTransferId: 999 }, [request, reply], 100, 200);
  expect(missing.visualStart).toBe(100); expect(missing.parentTransferId).toBeUndefined();
});

it.each([50, 250])('retimes request/reply dependencies at clock %s without position jumps or reviving completed hops', clock => {
  const a = sequencePacketAnimation(packet, undefined, [], 0, 200);
  const b = sequencePacketAnimation({ ...packet, id: 2 }, { parentTransferId: 1 }, [a], 0, 200);
  const c = sequencePacketAnimation({ ...packet, id: 3 }, { echoRequestTransferId: 2 }, [a, b], 0, 200);
  const d = sequencePacketAnimation({ ...packet, id: 4 }, { parentTransferId: 3 }, [a, b, c], 0, 200);
  const chain = [a, b, c, d], active = chain.find(p => packetAnimationProgress(p, clock) !== null)!;
  for (const duration of [50, 100, 800]) {
    const result = retimePacketAnimations(chain, clock, duration);
    expect(packetAnimationProgress(result.find(p => p.id === active.id)!, clock)).toBe(packetAnimationProgress(active, clock));
    expect(result).toHaveLength(clock < 200 ? 4 : 3);
    for (const child of result) {
      const parent = result.find(p => p.id === child.parentTransferId);
      if (parent) expect(child.visualStart).toBe(parent.visualStart + parent.visualDuration);
      expect(child.start).toBe(packet.start); expect(child.end).toBe(packet.end);
    }
  }
});

it('keeps every eligible animation beyond the former count and backlog limits', () => {
  const chain: AnimatedTransfer[] = [];
  for (let id = 1; id <= 200; id++) chain.push(sequencePacketAnimation({ ...packet, id }, id > 1 ? { parentTransferId: id - 1 } : undefined, chain, 0, 200));
  expect(chain).toHaveLength(200); expect(chain.at(-1)!.visualStart).toBe(39_800);
  const slowed = retimePacketAnimations(chain, 0, 800);
  expect(slowed).toHaveLength(200); expect(slowed.at(-1)!.visualStart).toBe(159_200);
  expect(retimePacketAnimations(chain, 40_000, 200)).toEqual([]);
});

it('persists widget placement, respects viewport bounds and accepts a future initial placement', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  expect(readPacketAnimationPlacement()).toEqual({ mode: 'toolbar' });
  expect(readPacketAnimationPlacement({ mode: 'floating', x: 10, y: 20 })).toEqual({ mode: 'floating', x: 10, y: 20 });
  const position = clampPacketWidget({ x: 900, y: -20 }, { width: 800, height: 600 }, { width: 200, height: 48 });
  expect(position).toEqual({ mode: 'floating', x: 600, y: 0 });
  savePacketAnimationPlacement(position); expect(readPacketAnimationPlacement()).toEqual(position);
  savePacketAnimationPlacement({ mode: 'toolbar' }); expect(readPacketAnimationPlacement()).toEqual({ mode: 'toolbar' });
});
