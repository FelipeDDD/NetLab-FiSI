import { expect, it } from 'vitest';
import { normalizeCoverage, useWifiCoverage, wifiRadius } from './wifiCoverage';
it('defaults to auto and accepts only the three visual modes', () => {
  expect(normalizeCoverage(null)).toBe('auto'); expect(normalizeCoverage('invalid')).toBe('auto');
  for (const mode of ['auto', 'always', 'hidden'] as const) { useWifiCoverage.getState().setMode(mode); expect(useWifiCoverage.getState().mode).toBe(mode); }
  expect(wifiRadius(250)).toBeGreaterThan(0);
});
