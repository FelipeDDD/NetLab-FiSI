import type { TranslationKey } from '../i18n';

/** Published IDs only. Adding a group never publishes an internal draft. */
export const EXERCISE_MENU_GROUPS: { id: string; label: TranslationKey; exercises: string[] }[] = [
  { id: 'ipv4', label: 'exercises.groupIpv4', exercises: ['pilot-e06-v1', 'pilot-e09-v1'] },
  { id: 'routing', label: 'exercises.groupRouting', exercises: ['fisi-office-warehouse-routing', 'pilot-e08-v1', 'pilot-d02-v1'] },
  { id: 'services', label: 'exercises.groupServices', exercises: ['fisi-service-portal'] },
];
