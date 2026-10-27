import { expect, it } from 'vitest';
import { deviceActionLayout } from './deviceActions';

it('keeps the current layout until an explicit experimental URL choice is made', () => {
  expect(deviceActionLayout('')).toBe('current');
  expect(deviceActionLayout('?background=verde2')).toBe('current');
  expect(deviceActionLayout('?deviceActions=unexpected')).toBe('current');
  expect(deviceActionLayout('?deviceActions=current')).toBe('current');
});
it('selects each visual variant without coupling it to theme/background/topology preferences', () => {
  expect(deviceActionLayout('?deviceActions=a&background=verde2')).toBe('a');
  expect(deviceActionLayout('?background=original&deviceActions=b')).toBe('b');
});
