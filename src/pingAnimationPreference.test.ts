import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PING_ANIMATION_PREFERENCE_KEY as KEY, preferredPingAnimationSpeed, readPingAnimationPreference, usePingAnimationPreference } from './pingAnimationPreference';
import { useStore } from './store';
import { staticVerificationPresentation } from './tutorials/staticRoutingVerification';

vi.mock('./terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
const initial = usePingAnimationPreference.getState();
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  usePingAnimationPreference.setState({ remember: false, speed: .25 });
});
afterEach(() => { usePingAnimationPreference.setState(initial); useStore.getState().setPacketAnimationSpeed(.25); vi.unstubAllGlobals(); });

it('requires explicit opt-in and rejects malformed preferences and legacy speeds', () => {
  values.set('netlab:packet-animation-speed:v1', '2');
  expect(readPingAnimationPreference()).toEqual({ remember: false, speed: .25 });
  for (const value of ['{', '{}', '{"remember":true,"speed":4}', '{"remember":"true","speed":1}']) {
    values.set(KEY, value); expect(readPingAnimationPreference()).toEqual({ remember: false, speed: .25 });
  }
});
it('saves only chosen manual speeds, persists opt-out and restores the ordinary default', () => {
  const preference = usePingAnimationPreference.getState();
  preference.setManualSpeed(.5); expect(values.has(KEY)).toBe(false);
  preference.setRemember(true); expect(readPingAnimationPreference()).toEqual({ remember: true, speed: .5 });
  preference.setManualSpeed(1); expect(readPingAnimationPreference()).toEqual({ remember: true, speed: 1 }); expect(preferredPingAnimationSpeed()).toBe(1);
  preference.setRemember(false); expect(readPingAnimationPreference()).toEqual({ remember: false, speed: 1 }); expect(preferredPingAnimationSpeed()).toBe(.25);
  preference.setManualSpeed(2); expect(preferredPingAnimationSpeed()).toBe(.25);
  preference.setRemember(true); expect(readPingAnimationPreference()).toEqual({ remember: true, speed: 2 });
});
it('chapter 4 temporary 2× and restoration never write the manual preference, including opt-in during an override', () => {
  const preference = usePingAnimationPreference.getState();
  preference.setManualSpeed(.5); useStore.getState().setPacketAnimationSpeed(.5);
  const restore = staticVerificationPresentation.begin(); expect(useStore.getState().packetAnimationSpeed).toBe(2);
  preference.setRemember(true); expect(readPingAnimationPreference()).toEqual({ remember: true, speed: .5 });
  const before = values.get(KEY); restore();
  expect(useStore.getState().packetAnimationSpeed).toBe(.5); expect(values.get(KEY)).toBe(before);
  const cancel = staticVerificationPresentation.begin(); cancel(); expect(values.get(KEY)).toBe(before);
  useStore.getState().setPacketAnimationSpeed(1); expect(values.get(KEY)).toBe(before);
});
it('remains usable when browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } });
  expect(readPingAnimationPreference()).toEqual({ remember: false, speed: .25 });
  expect(() => { usePingAnimationPreference.getState().setRemember(true); usePingAnimationPreference.getState().setManualSpeed(1); }).not.toThrow();
  expect(preferredPingAnimationSpeed()).toBe(1);
});
