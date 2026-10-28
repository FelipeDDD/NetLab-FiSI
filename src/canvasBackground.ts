import { create } from 'zustand';
import { normalizeAnimation, type BackgroundAnimation } from './backgroundParticles';

export const CANVAS_BACKGROUNDS = {
  original: { label: 'Original', image: null },
  verde1: { label: 'Verde 1', image: 'background-verde1.png' },
  verde2: { label: 'Verde 2', image: 'background-verde2.png' },
  bg1: { label: 'Cyan Circuit', image: 'background-cyan-circuit.png' },
  bg2: { label: 'Blue Circuit', image: 'background-blue-circuit.png' },
  bg3: { label: 'Slate Circuit', image: 'background-slate-circuit.png' },
  'gray1': { label: 'Carbon Circuit', image: 'background-gray-circuit1.png' },
  'gray3': { label: 'Titanium Circuit', image: 'background-gray-circuit3.png' },
  'graphite-clean': { label: 'Graphite Clean', image: 'background-graphite-clean.png' },
  'azure1': { label: 'Azure Circuit', image: 'background-azure-circuit.png' },
} as const;
type BackgroundChoice = keyof typeof CANVAS_BACKGROUNDS;
function isBackgroundChoice(value: unknown): value is BackgroundChoice {
  return typeof value === 'string' && Object.hasOwn(CANVAS_BACKGROUNDS, value);
}
export type CanvasBackground = { choice: BackgroundChoice; intensity: number; dots: boolean; animation: BackgroundAnimation };
export const BACKGROUND_KEY = 'netlab:canvas-background:v1';
export const DEFAULT_BACKGROUND: CanvasBackground = { choice: 'bg2', intensity: 100, dots: true, animation: 'off' };
export function normalizeBackground(value: Partial<CanvasBackground> | null): CanvasBackground {
  return {
    choice: isBackgroundChoice(value?.choice) ? value.choice : DEFAULT_BACKGROUND.choice,
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
  return isBackgroundChoice(choice) ? { ...saved, choice } : saved;
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
