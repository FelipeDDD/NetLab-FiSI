import { useLayoutEffect } from 'react';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { useTranslation } from '../../i18n';
import { applyUiTheme, useUiTheme } from '../../uiTheme';
import { editorHref } from '../navigation';
import { PacketScenes } from './PacketScenes';
import { ScrollJourney } from './ScrollJourney';
import { TerminalShowcase } from './TerminalShowcase';
import './journey.css';
import { installJourneyScrollRestore } from './scrollRestore';

export default function ThematicHome() {
  const { t } = useTranslation();
  const demo = new URLSearchParams(location.search).get('demo');
  const alternateHeadline = new URLSearchParams(location.search).get('headline') === 'break-fix';
  const headline = t(alternateHeadline ? 'journey.titleAlternative' : 'journey.title');
  useLayoutEffect(installJourneyScrollRestore, []);
  // Presentation override only: never persist the experiment over the editor's preference.
  useLayoutEffect(() => {
    applyUiTheme('graphite-dark');
    return () => applyUiTheme(useUiTheme.getState().theme);
  }, []);
  return <div className="home-page journey-page">
    <a className="home-skip" href="#home-main">{t('home.skip')}</a>
    <header className="home-header">
      <a className="home-brand" href="./">NetLab<span>FiSI</span></a>
      <nav aria-label={t('navigation.main')} className="home-header-controls">
        <LanguageSelector />
        <a className="home-continue" href="./">{t('journey.classic')} ↗</a>
      </nav>
    </header>
    <nav className="journey-variants" aria-label={t('journey.experimental')}>
      {([['', 'combined'], ['scroll', 'scrollOnly'], ['slides', 'slidesOnly']] as const).map(([value, key]) => <a key={key} aria-current={(demo || '') === value ? 'page' : undefined} href={`?experience=journey${value ? `&demo=${value}` : ''}`}>{t(`journey.${key}`)}</a>)}
    </nav>
    <main id="home-main">
      <section className={`home-hero journey-hero${demo === 'scroll' ? ' journey-hero-compact' : ''}`}>
        <div className="home-hero-copy">
          <p className="home-eyebrow"><span aria-hidden="true"/>{t('journey.experimental')}</p>
          <h1>{headline.split('. ').map((part, i, parts) => <span key={i}>{part.endsWith('.') ? part : part + '.'}{i < parts.length - 1 ? ' ' : ''}</span>)}</h1><p className="home-intro">{t('journey.intro')}</p>
          <div className="home-actions"><a className="home-button home-button-primary" href={editorHref({ action: 'new' })}>{t('journey.startProject')} ↗</a><a className="home-button" href={editorHref()}>{t('journey.continueLearning')}</a></div>
          <div className="journey-entry-links"><a href={editorHref({ action: 'load' })}>{t('journey.browseProjects')} →</a><a href={editorHref({ action: 'exercises' })}>{t('journey.exploreExercises')} →</a></div>
        </div>
        {demo !== 'scroll' && <PacketScenes />}
      </section>
      <TerminalShowcase />
      {demo !== 'slides' && <ScrollJourney />}
      <section className="home-labs journey-finish"><div><h2>{t('journey.finalTitle')}</h2><p>{t('journey.finalBody')}</p></div><a className="home-button" href={editorHref({ action: 'labs' })}>{t('home.labs')} →</a></section>
    </main>
    <footer className="home-footer"><strong>NetLab – FiSI / {t('home.footer')}</strong><p>{t('home.about')}</p><a href="./">{t('journey.classic')} ↗</a></footer>
  </div>;
}
