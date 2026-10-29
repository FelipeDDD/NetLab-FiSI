import { LANGUAGES, useLanguage, useTranslation, type Language } from './index';

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage(), { t } = useTranslation();
  return <label className="language-selector"><span>{t('common.language')}</span>
    <select value={language} onChange={event => setLanguage(event.target.value as Language)}>
      {Object.entries(LANGUAGES).map(([id, name]) => <option key={id} value={id} lang={id}>{name}</option>)}
    </select>
  </label>;
}
