import type { useTranslation } from '../i18n';

/** Presentation labels only; stored colours, names and geometry remain unchanged. */
export const MARKING_COLOR_KEYS = {
  blue: 'navigation.markingBlue', teal: 'navigation.markingTeal', green: 'navigation.markingGreen',
  amber: 'navigation.markingOchre', violet: 'navigation.markingViolet', rose: 'navigation.markingRose',
} as const;
export const MARKING_CORNER_KEYS = {
  nw: 'navigation.markingNorthWest', ne: 'navigation.markingNorthEast',
  sw: 'navigation.markingSouthWest', se: 'navigation.markingSouthEast',
} as const;
export const markingDeviceCount = (count: number, t: ReturnType<typeof useTranslation>['t']) =>
  t(count === 1 ? 'navigation.markingDeviceOne' : 'navigation.markingDeviceMany', { count });
