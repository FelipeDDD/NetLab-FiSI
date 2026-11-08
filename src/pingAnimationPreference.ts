import { create } from 'zustand';
import { DEFAULT_PING_ANIMATION_SPEED, PING_ANIMATION_SPEEDS } from './packetAnimation';

export const PING_ANIMATION_PREFERENCE_KEY = 'netlab:ping-animation-preference:v1';
type Preference = { remember: boolean; speed: number };
const validSpeed = (speed: unknown): speed is number => PING_ANIMATION_SPEEDS.some(value => value === speed);
export function readPingAnimationPreference(): Preference {
  try {
    const value = JSON.parse(localStorage.getItem(PING_ANIMATION_PREFERENCE_KEY) ?? 'null');
    if (typeof value?.remember === 'boolean' && validSpeed(value.speed)) return { remember: value.remember, speed: value.speed };
  } catch { /* Optional local preference; no legacy speed implies opt-in. */ }
  return { remember: false, speed: DEFAULT_PING_ANIMATION_SPEED };
}
function save(preference: Preference) {
  try { localStorage.setItem(PING_ANIMATION_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Control remains usable for this visit. */ }
}
const saved = readPingAnimationPreference();
/** Only explicit user actions write this preference. Runtime speed is separate. */
export const usePingAnimationPreference = create<Preference & {
  setRemember(value: boolean): void;
  setManualSpeed(value: number): void;
}>(set => ({
  remember: saved.remember, speed: saved.remember ? saved.speed : DEFAULT_PING_ANIMATION_SPEED,
  setRemember(remember) {
    set(state => { const next = { remember, speed: state.speed }; save(next); return next; });
  },
  setManualSpeed(speed) {
    if (!validSpeed(speed)) return;
    set(state => { const next = { remember: state.remember, speed }; if (state.remember) save(next); return next; });
  },
}));
export function preferredPingAnimationSpeed() {
  const preference = usePingAnimationPreference.getState();
  return preference.remember ? preference.speed : DEFAULT_PING_ANIMATION_SPEED;
}
