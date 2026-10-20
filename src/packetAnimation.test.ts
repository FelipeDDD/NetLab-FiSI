import { afterEach, expect, it, vi } from 'vitest';
import { PACKET_ANIMATION_KEY, PACKET_ANIMATION_SPEED_KEY, PACKET_ANIMATION_SPEEDS, MAX_VISUAL_QUEUE_MS, normalizePacketAnimationSpeed, packetAnimationDuration, packetAnimationProgress, readPacketAnimationSpeed, retimePacketAnimations, savePacketAnimationSpeed, sequencePacketAnimation, type AnimatedTransfer } from './packetAnimation';
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
  expect(PACKET_ANIMATION_SPEEDS.map(packetAnimationDuration)).toEqual([4000, 2000, 1000, 1000 / 1.5, 500, 1000 / 3, 250]);
  expect(normalizePacketAnimationSpeed(9)).toBe(4); expect(normalizePacketAnimationSpeed(NaN)).toBe(1);
  values.set(PACKET_ANIMATION_KEY, '2000'); expect(readPacketAnimationSpeed()).toBe(0.5);
  expect(values.get(PACKET_ANIMATION_SPEED_KEY)).toBe('0.5');
  savePacketAnimationSpeed(4); expect(readPacketAnimationSpeed()).toBe(4);
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  expect(readPacketAnimationSpeed()).toBe(1); expect(() => savePacketAnimationSpeed(4)).not.toThrow();
});

it('sequences only identified predecessors, keeps branches concurrent and bounds queued visual work', () => {
  const first = sequencePacketAnimation(packet, undefined, [], 0, 1000)!;
  const child = sequencePacketAnimation({ ...packet, id: 2 }, { parentTransferId: 1 }, [first], 80, 1000)!;
  const branch = sequencePacketAnimation({ ...packet, id: 3 }, { parentTransferId: 1 }, [first, child], 80, 1000)!;
  const unrelated = sequencePacketAnimation({ ...packet, id: 4 }, undefined, [first, child], 80, 1000)!;
  expect(child.visualStart).toBe(1000); expect(branch.visualStart).toBe(1000); expect(unrelated.visualStart).toBe(80);
  expect(packetAnimationProgress(child, 900)).toBeNull();
  const changed = retimePacketAnimations([first, child, branch], 100, 500);
  expect(packetAnimationProgress(changed[0], 100)).toBe(0.1);
  expect(changed[1].visualStart).toBe(changed[0].visualStart + 500); expect(changed[2].visualStart).toBe(changed[1].visualStart);
  expect(sequencePacketAnimation(packet, { parentTransferId: 1 }, [{ ...first, visualStart: MAX_VISUAL_QUEUE_MS }], 0, 1000)).toBeNull();
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
