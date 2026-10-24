import type { ISourceOptions } from '@tsparticles/engine';

export const BACKGROUND_ANIMATIONS = { off: 'Off', emerald: 'Emerald Dust', fireflies: 'Fireflies', teal: 'Teal Drift', shooting: 'Shooting Star' } as const;
export type BackgroundAnimation = keyof typeof BACKGROUND_ANIMATIONS;
export function normalizeAnimation(value: unknown): BackgroundAnimation {
  return value === 'emerald' || value === 'fireflies' || value === 'teal' || value === 'shooting' ? value : 'off';
}
export function particleOptions(preset: Exclude<BackgroundAnimation, 'off'>): ISourceOptions {
  const fireflies = preset === 'fireflies', teal = preset === 'teal', shooting = preset === 'shooting';
  return {
    fullScreen: { enable: false }, fpsLimit: 30, detectRetina: false,
    pauseOnBlur: true, pauseOnOutsideViewport: true, autoPlay: false,
    particles: {
      number: { value: shooting ? 5 : fireflies ? 10 : teal ? 18 : 24, density: { enable: false } },
      shape: { type: 'circle' },
      paint: { color: { value: fireflies ? '#74D7A6' : teal ? '#329D98' : '#55B68C' } },
      size: { value: fireflies ? { min: 1, max: 3 } : { min: 0.5, max: 1.5 } },
      opacity: { value: fireflies ? { min: 0.112, max: 0.42 } : teal ? { min: 0.14, max: 0.28 } : { min: 0.14, max: 0.35 },
        animation: { enable: fireflies, speed: 0.15, sync: false } },
      move: { enable: true, speed: fireflies ? 0.04375 : teal ? 0.1125 : 0.0875,
        direction: teal ? 'right' : 'none', straight: teal, random: !teal,
        outModes: { default: 'out' } },
    },
  };
}
