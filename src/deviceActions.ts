export type DeviceActionLayout = 'current' | 'a' | 'b';

/** Temporary visual comparison only; no Settings or saved-topology preference. */
export function deviceActionLayout(search = typeof window === 'undefined' ? '' : window.location.search): DeviceActionLayout {
  const value = new URLSearchParams(search).get('deviceActions');
  return value === 'a' || value === 'b' ? value : 'current';
}
