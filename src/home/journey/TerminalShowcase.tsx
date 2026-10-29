import { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { EnergyBorder } from './EnergyBorder';

// Curated examples verified against commands/shell.ts and commands/windows.ts.
// No command interpreter, xterm or workspace data is imported here.
export const TERMINAL_EXAMPLES = {
  linux: ['ip addr', 'ip route', 'ping -c 4 <host>'],
  windows: ['ipconfig /all', 'route print', 'tracert <host>'],
} as const;
export const TERMINAL_INTRO_MS = 3200;
export function terminalIntroPhase(elapsed: number) {
  return [600, 750, 900, 1050, 1500, 2000, 2500].filter(ms => elapsed >= ms).length;
}

export function TerminalShowcase() {
  const { t } = useTranslation(), root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current!, motion = matchMedia('(prefers-reduced-motion: reduce)');
    let elapsed = 0, last = 0, frame = 0, inside = false, started = false, complete = false, disposed = false;
    const paint = () => { element.dataset.phase = String(terminalIntroPhase(elapsed)); element.style.setProperty('--intro-phase', String(terminalIntroPhase(elapsed))); element.dataset.started = String(started); element.dataset.complete = String(complete); };
    const cancel = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const tick = (time: number) => {
      frame = 0; if (disposed || !inside || document.hidden || complete) return;
      elapsed = Math.min(TERMINAL_INTRO_MS, elapsed + (last ? Math.min(50, time - last) : 0)); last = time;
      complete = elapsed === TERMINAL_INTRO_MS; paint(); if (!complete) frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancel();
      if (motion.matches) { started = complete = true; elapsed = TERMINAL_INTRO_MS; }
      if (inside && !document.hidden) started = true;
      element.dataset.paused = String(!inside || document.hidden); paint();
      if (inside && !document.hidden && !complete) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => { inside = entries[0].isIntersecting && entries[0].intersectionRatio >= .15; update(); }, { threshold: .15 });
    observer.observe(element.querySelector('.journey-terminal-pair')!); document.addEventListener('visibilitychange', update); motion.addEventListener('change', update); update();
    return () => { disposed = true; cancel(); observer.disconnect(); document.removeEventListener('visibilitychange', update); motion.removeEventListener('change', update); };
  }, []);
  return <section className="journey-terminal-showcase" ref={root} aria-labelledby="journey-terminals-title">
    <header><p className="home-eyebrow">LINUX / WINDOWS</p><h2 id="journey-terminals-title">{t('journey.terminalsTitle')}</h2><p>{t('journey.terminalsBody')}</p></header>
    <div className="journey-terminal-pair">{(['linux', 'windows'] as const).map(os => <article className={`journey-console journey-console-${os}`} key={os}>
      <EnergyBorder />
      <div className="journey-console-bar"><span className="journey-console-dot" aria-hidden="true"/><strong>{os === 'linux' ? 'Linux' : 'Windows'}</strong></div>
      <div className="journey-console-text">
        <div className="journey-console-prompt"><span>{os === 'linux' ? 'pc1:~$' : 'C:\\>'} </span><span className="journey-typed" aria-label="help">{[...'help'].map((letter, i) => <span key={i} data-character={i + 1} aria-hidden="true">{letter}</span>)}</span></div>
        <p className="journey-console-heading">{t('journey.terminalSample')}</p>
        <ul aria-label={t('journey.terminalSample')}>{TERMINAL_EXAMPLES[os].map((command, i) => <li key={command} data-line={i + 1}><code>{command}</code></li>)}</ul>
      </div>
    </article>)}</div>
    <p className="journey-console-note">{t('journey.illustration')}</p>
  </section>;
}
