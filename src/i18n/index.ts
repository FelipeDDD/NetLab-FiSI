import { create } from 'zustand';
import common from './catalogs/common';
import home from './catalogs/home';
import navigation from './catalogs/navigation';
import exercises from './catalogs/exercises';
import workspace from './catalogs/workspace';
import journey from './catalogs/journey';
import practice from './catalogs/practice';

export const LANGUAGES = { de: 'Deutsch', en: 'English', 'pt-BR': 'Português (Brasil)' } as const;
export type Language = keyof typeof LANGUAGES;
export const LANGUAGE_KEY = 'netlab:language:v1';
export const catalogs = { common, home, navigation, exercises, workspace, journey, practice };
type Domain = keyof typeof catalogs;
export type TranslationKey = { [D in Domain]: `${D}.${keyof typeof catalogs[D]['en'] & string}` }[Domain];
export function normalizeLanguage(value: unknown): Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value) ? value as Language : 'de';
}
export function readLanguage(): Language {
  try { return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY)); } catch { return 'de'; }
}
/** English is the source/fallback catalog; German is the compatibility default.
 * Interpolation is plain React text, never HTML. Technical values are untouched. */
export function translate(language: Language, key: TranslationKey, values: Record<string, string | number> = {}): string {
  const [domain, name] = key.split('.') as [Domain, string];
  const table = catalogs[domain] as Record<Language, Record<string, string>>;
  const message = table[language]?.[name] || table.en[name];
  return message.replace(/\{(\w+)\}/g, (token, field: string) => Object.hasOwn(values, field) ? String(values[field]) : token);
}
export const useLanguage = create<{ language: Language; setLanguage(value: Language): void }>(set => ({
  language: readLanguage(),
  setLanguage(value) {
    const language = normalizeLanguage(value);
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* usable for this visit */ }
    set({ language });
  },
}));
export function useTranslation() {
  const language = useLanguage(s => s.language);
  return { language, t: (key: TranslationKey, values?: Record<string, string | number>) => translate(language, key, values) };
}
export function installLanguageDocument() {
  const apply = () => { document.documentElement.lang = useLanguage.getState().language; };
  apply(); const release = useLanguage.subscribe(apply);
  const receive = (event: StorageEvent) => {
    if (event.key === LANGUAGE_KEY) useLanguage.setState({ language: normalizeLanguage(event.newValue) });
  };
  window.addEventListener('storage', receive);
  return () => { release(); window.removeEventListener('storage', receive); };
}
