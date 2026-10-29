import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { UI_THEMES, useUiTheme, type UiTheme } from '../uiTheme';
import { readRecentPlans } from './recentPlans';
import { editorHref } from './navigation';
import { HomeTopology } from './HomeTopology';
import type { ProjectMetadata, RepositoryResult } from '../projects/types';

export function Home() {
  const { t, language } = useTranslation(), { theme, setTheme } = useUiTheme();
  const [plans, setPlans] = useState<RepositoryResult<ProjectMetadata[]> | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setPlans(null);
    void readRecentPlans().then(value => { if (active) setPlans(value); });
    return () => { active = false; };
  }, [retry]);
  return <div className="home-page">
    <a className="home-skip" href="#home-main">{t('home.skip')}</a>
    <header className="home-header">
      <a className="home-brand" href="./" aria-label="NetLab-FiSI"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M6 7l18 16M6 23L24 7" stroke="currentColor" strokeWidth="1.5"/>{[[6,7],[24,7],[6,23],[24,23]].map(([x,y])=><rect key={`${x}-${y}`} x={x-3} y={y-3} width="6" height="6" rx="1.5" fill="currentColor"/>)}</svg>NetLab<span>FiSI</span></a>
      <nav aria-label={t('navigation.main')} className="home-header-controls">
        <LanguageSelector />
        <label className="home-theme"><span>{t('common.theme')}</span><select value={theme} onChange={event => setTheme(event.target.value as UiTheme)}>{Object.entries(UI_THEMES).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}</select></label>
        <a className="home-continue" href={editorHref()}>{t('home.continue')} <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <main id="home-main">
      <section className="home-hero">
        <div className="home-hero-copy"><p className="home-eyebrow"><span aria-hidden="true" />{t('home.eyebrow')}</p>
          <h1>{t('home.title')}</h1><p className="home-intro">{t('home.intro')}</p>
          <div className="home-actions"><a className="home-button home-button-primary" href={editorHref({ action: 'new' })}>{t('home.new')} <span aria-hidden="true">↗</span></a>
            <a className="home-button" href={editorHref({ action: 'load' })}>{t('home.open')}</a>
          </div>
          <a className="home-exercises" href={editorHref({ action: 'exercises' })}>{t('home.exercises')} <span aria-hidden="true">→</span></a>
          <p className="home-local-note">{t('home.localNote')}</p>
        </div><HomeTopology />
      </section>
      <section className="home-recents" aria-labelledby="recent-heading">
        <div className="home-section-heading"><div><h2 id="recent-heading">{t('home.recent')}</h2><p>{t('home.recentHint')}</p></div><a href={editorHref({ action: 'load' })}>{t('home.allPlans')} <span aria-hidden="true">↗</span></a></div>
        {!plans ? <p role="status">{t('common.loading')}</p> : !plans.ok ? <div role="status" className="home-empty"><p>{t('home.storageError')}</p><button className="home-button" onClick={() => setRetry(v => v + 1)}>{t('common.retry')}</button></div>
          : !plans.value.length ? <div className="home-empty"><span className="home-empty-symbol" aria-hidden="true">＋</span><div><strong>{t('home.emptyTitle')}</strong><p>{t('home.empty')}</p></div></div>
          : <><div className="home-plan-grid">{plans.value.slice(0, 3).map(plan => <a className="home-plan" key={plan.id} href={editorHref({ action: 'plan', id: plan.id })}>
            <span className="home-plan-symbol" aria-hidden="true">▱</span><strong>{plan.name}</strong><small>{t('home.updated', { date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(plan.updatedAt) })}</small><span className="home-plan-arrow" aria-hidden="true">↗</span>
          </a>)}</div><p className="home-count">{t(new Intl.PluralRules(language).select(plans.value.length) === 'one' ? 'home.recentOne' : 'home.recentOther', { count: plans.value.length })} · {t('common.local')}</p></>}
      </section>
      <section className="home-features" aria-labelledby="features-heading"><h2 id="features-heading">{t('home.features')}</h2>
        <div className="home-feature-grid">{(['simulation', 'terminals', 'capture', 'routing', 'learning', 'editor'] as const).map((feature, i) => <article key={feature}>
          <span className="home-feature-number" aria-hidden="true">0{i + 1}</span><h3>{t(`home.${feature}`)}</h3><p>{t(`home.${feature}Text`)}</p>
        </article>)}</div>
      </section>
      <section className="home-labs"><div><h2>{t('home.labsTitle')}</h2><p>{t('home.labsText')}</p></div><a className="home-button" href={editorHref({ action: 'labs' })}>{t('home.labs')} <span aria-hidden="true">→</span></a></section>
    </main>
    <footer className="home-footer"><strong>NetLab – FiSI <span> / </span>{t('home.footer')}</strong><p>{t('home.about')}</p><p className="home-coverage">{t('home.coverage')}</p></footer>
  </div>;
}
