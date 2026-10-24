import { expect, it } from 'vitest';
import { nextStarDelay, starFlight } from './shootingStar';
import { particleOptions } from './backgroundParticles';

it('keeps intervals occasional and flights short with a fine bounded trail', () => {
  expect(nextStarDelay(() => 0)).toBe(15000); expect(nextStarDelay(() => 1)).toBe(30000);
  for (const value of [0, .5, 1]) for (const [w,h] of [[390,700],[1400,900],[1920,1080]]) {
    const f = starFlight(w,h,() => value);
    expect(f.trail).toBeGreaterThanOrEqual(50); expect(f.trail).toBeLessThanOrEqual(100);
    expect(f.duration).toBeGreaterThanOrEqual(800); expect(f.duration).toBeLessThanOrEqual(1500);
    expect(f.angle).toBeGreaterThan(0); expect(f.angle).toBeLessThan(90);
    expect(f.x+f.dx+f.trail).toBeLessThan(w); expect(f.y+f.dy).toBeLessThan(h);
  }
});
it('uses only five ambient dots for Shooting Star and boosts existing presets moderately', () => {
  const options = particleOptions('shooting');
  expect((options.particles as any).number.value).toBe(5);
  for (const [preset, speed, opacity] of [['emerald',.07,.25],['fireflies',.035,.3],['teal',.09,.2]] as const) {
    const p = particleOptions(preset).particles as any;
    expect(p.move.speed).toBeCloseTo(speed*1.25);
    expect(p.opacity.value.max).toBeCloseTo(opacity*1.4);
  }
});
