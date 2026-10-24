import { create } from 'zustand';
export type CoverageMode = 'auto' | 'always' | 'hidden';
export { wifiRadius, WIFI_RANGE } from './engine/wirelessRange';
export const normalizeCoverage = (value: unknown): CoverageMode => value === 'always' || value === 'hidden' ? value : 'auto';
function read(): CoverageMode {
  try { return normalizeCoverage(localStorage.getItem('netlab:wifi-coverage:v1')); } catch { return 'auto'; }
}
export const useWifiCoverage = create<{ mode: CoverageMode; hovered: string | null; setMode: (mode: CoverageMode) => void; hover: (id: string | null) => void }>(set => ({
  mode: read(), hovered: null,
  setMode: mode => { const value = normalizeCoverage(mode); try { localStorage.setItem('netlab:wifi-coverage:v1', value); } catch { /* optional preference */ } set({ mode: value }); },
  hover: hovered => set({ hovered }),
}));
