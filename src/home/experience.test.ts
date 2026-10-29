import { expect, it } from 'vitest';
import { homeExperience } from './experience';

it('opens the full approved journey with alternate stations and DATA by default', () => {
  expect(homeExperience('')).toEqual({ classic: false, demo: null, alternateStations: true, dataPreview: true });
});
it('preserves the old journey URL and ignores unrelated parameters', () => {
  expect(homeExperience('?experience=journey&stations=alternate&dataPreview=1')).toEqual(homeExperience(''));
  expect(homeExperience('?home=new&background=verde2')).toEqual(homeExperience(''));
});
it('keeps the classic fallback and individual prototypes explicitly accessible', () => {
  expect(homeExperience('?experience=classic').classic).toBe(true);
  expect(homeExperience('?demo=scroll').demo).toBe('scroll');
  expect(homeExperience('?experience=journey&demo=slides').demo).toBe('slides');
  expect(homeExperience('?demo=unknown').demo).toBeNull();
});
it('retains explicit comparison overrides without changing the defaults', () => {
  expect(homeExperience('?stations=original&dataPreview=0')).toMatchObject({ alternateStations: false, dataPreview: false });
  expect(homeExperience('')).toMatchObject({ alternateStations: true, dataPreview: true });
});
