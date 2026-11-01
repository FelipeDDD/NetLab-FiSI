import { LANGUAGES, useLanguage, useTranslation, type Language } from './index';

export function LanguageSelector({compact=false,id}: {compact?:boolean;id?:string}={}) {
  const { language, setLanguage } = useLanguage(), { t } = useTranslation();
  return <label className={'language-selector'+(compact?' language-selector--compact':'')}><span className={compact?'sr-only':undefined}>{t('common.language')}</span>
    <select id={id} title={t('common.language')} value={language} onChange={event => setLanguage(event.target.value as Language)}>
      {Object.entries(LANGUAGES).map(([id, name]) => <option key={id} value={id} lang={id} aria-label={name}>{compact?id==='pt-BR'?'PT-BR':id.toUpperCase():name}</option>)}
    </select>
  </label>;
}
