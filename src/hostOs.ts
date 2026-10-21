// Host identity is saved in the topology; the creation preference is local UI state.
export type HostOs = 'linux' | 'windows';
export type HostCreationMode = HostOs | 'mixed';
export const HOST_CREATION_KEY = 'netsim:host-creation:v1';
export const normalizeHostOs = (value: unknown): HostOs => value === 'windows' ? 'windows' : 'linux';
export const normalizeHostCreationMode = (value: unknown): HostCreationMode =>
  value === 'mixed' ? 'mixed' : normalizeHostOs(value);
export function chooseHostOs(mode: HostCreationMode, random = Math.random): HostOs {
  return mode === 'mixed' ? (random() < 0.5 ? 'linux' : 'windows') : mode;
}
export function readHostCreationMode(): HostCreationMode {
  try { return normalizeHostCreationMode(localStorage.getItem(HOST_CREATION_KEY)); } catch { return 'linux'; }
}
export function saveHostCreationMode(mode: HostCreationMode): void {
  try { localStorage.setItem(HOST_CREATION_KEY, mode); } catch { /* Optional preference. */ }
}
