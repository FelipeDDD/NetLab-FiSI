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
  const headline = t('journey.title');
  useLayoutEffect(installJourneyScrollRestore, []);
  // Homepage appearance only: never replace the editor's saved theme preference.
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
      </nav>
    </header>
    <main id="home-main">
      <section className="home-hero journey-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow"><span aria-hidden="true"/>{t('journey.eyebrow')}</p>
          <h1>{headline.split('. ').map((part, i, parts) => <span key={i}>{part.endsWith('.') ? part : part + '.'}{i < parts.length - 1 ? ' ' : ''}</span>)}</h1><p className="home-intro">{t('journey.intro')}</p>
          <div className="home-actions"><a className="home-button home-button-primary" href={editorHref({ action: 'new' })}>{t('journey.startProject')} ↗</a><a className="home-button" href={editorHref()}>{t('journey.continueLearning')}</a></div>
          <div className="journey-entry-links"><a href={editorHref({ action: 'load' })}>{t('journey.browseProjects')} →</a><a href={editorHref({ action: 'exercises' })}>{t('journey.exploreExercises')} →</a></div>
        </div>
        <PacketScenes />
      </section>
      <TerminalShowcase />
      <ScrollJourney />
      <section className="home-labs journey-finish"><div><h2>{t('journey.finalTitle')}</h2><p>{t('journey.finalBody')}</p></div><a className="home-button" href={editorHref({ action: 'labs' })}>{t('home.labs')} →</a></section>
    </main>
    <footer className="home-footer"><strong>NetLab – FiSI / {t('home.footer')}</strong><p>{t('home.about')}</p></footer>
  </div>;
}
