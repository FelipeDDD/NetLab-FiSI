import { expect, it } from 'vitest';
import { normalizeAnimation, particleOptions } from './backgroundParticles';
import { normalizeBackground } from './canvasBackground';

it('keeps existing saved backgrounds animation-free and rejects unknown presets', () => {
  expect(normalizeBackground({ choice: 'verde2', intensity: 50 }).animation).toBe('off');
  expect(normalizeAnimation('unknown')).toBe('off');
  for (const preset of ['emerald', 'fireflies', 'teal', 'shooting'] as const) expect(normalizeBackground({ animation: preset }).animation).toBe(preset);
});
it.each(['emerald', 'fireflies', 'teal'] as const)('%s limits work and excludes mouse/connection effects', preset => {
  const options = particleOptions(preset);
  expect(options.fpsLimit).toBe(30); expect(options.detectRetina).toBe(false);
  expect(options.pauseOnBlur).toBe(true); expect(options.autoPlay).toBe(false);
  expect(options.fullScreen).toEqual({ enable: false });
  const particles = options.particles as Record<string, any>;
  expect(particles.number.value).toBeLessThanOrEqual(25);
  expect(particles.number.density.enable).toBe(false);
  expect(particles.move.speed).toBeLessThan(0.12);
  expect(particles.links).toBeUndefined(); expect(options.interactivity).toBeUndefined();
  expect(particles.opacity.animation.enable).toBe(preset === 'fireflies');
});
