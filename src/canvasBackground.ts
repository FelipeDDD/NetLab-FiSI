import { create } from 'zustand';
import { normalizeAnimation, type BackgroundAnimation } from './backgroundParticles';

export type CanvasBackground = { choice: 'original' | 'verde1' | 'verde2'; intensity: number; dots: boolean; animation: BackgroundAnimation };
export const BACKGROUND_KEY = 'netlab:canvas-background:v1';
export const DEFAULT_BACKGROUND: CanvasBackground = { choice: 'original', intensity: 100, dots: true, animation: 'off' };
export function normalizeBackground(value: Partial<CanvasBackground> | null): CanvasBackground {
  return {
    choice: value?.choice === 'verde1' || value?.choice === 'verde2' ? value.choice : 'original',
    intensity: typeof value?.intensity === 'number' && Number.isFinite(value.intensity)
      ? Math.max(0, Math.min(100, Math.round(value.intensity))) : 100,
    dots: typeof value?.dots === 'boolean' ? value.dots : true,
    animation: normalizeAnimation(value?.animation),
  };
}
export function readBackground(search = ''): CanvasBackground {
  let saved = DEFAULT_BACKGROUND;
  try { saved = normalizeBackground(JSON.parse(localStorage.getItem(BACKGROUND_KEY) ?? 'null')); } catch { /* local preferences optional */ }
  const choice = new URLSearchParams(search).get('background');
  // URL overrides the initial choice without writing the test value to storage.
  return choice === 'original' || choice === 'verde1' || choice === 'verde2' ? { ...saved, choice } : saved;
}
export const useCanvasBackground = create<{
  preference: CanvasBackground; update: (patch: Partial<CanvasBackground>) => void;
}>(set => ({
  preference: readBackground(typeof window === 'undefined' ? '' : window.location.search),
  update: patch => set(state => {
    const preference = normalizeBackground({ ...state.preference, ...patch });
    try { localStorage.setItem(BACKGROUND_KEY, JSON.stringify(preference)); } catch { /* usable without storage */ }
    return { preference };
  }),
}));
