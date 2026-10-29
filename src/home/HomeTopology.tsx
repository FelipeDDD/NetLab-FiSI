import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

const devices = [
  { id: 'router', x: 260, y: 75, label: 'r1', path: 'M-23 0h46M0-17v34m-16-9-7-8 7-8m32 0 7 8-7 8M-8-9l8-8 8 8M-8 9l8 8 8-8' },
  { id: 'switch', x: 260, y: 205, label: 'sw1', path: 'M-26-12h52v24h-52zM-18-4v8m9-8v8m9-8v8m9-8v8m9-8v8' },
  { id: 'host', x: 100, y: 345, label: 'pc1', path: 'M-22-18h44v28h-44zM0 10v10m-13 0h26' },
  { id: 'host', x: 260, y: 345, label: 'pc2', path: 'M-22-18h44v28h-44zM0 10v10m-13 0h26' },
  { id: 'server', x: 420, y: 345, label: 'srv1', path: 'M-16-23h32v46h-32zM-16-8h32m-32 15h32M-8-16h4m-4 15h4m-4 15h4' },
] as const;
export function HomeTopology() {
  const { t } = useTranslation();
  const [selected, select] = useState(0), [animation, animate] = useState(0), [playing, setPlaying] = useState(false);
  useEffect(() => {
    const stop = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', stop);
    return () => document.removeEventListener('visibilitychange', stop);
  }, []);
  return <section className="home-topology" aria-label={t('home.illustration')}>
    <div className="home-diagram-heading"><span>{t('home.illustrationTag')}</span><span aria-hidden="true">01 / LAN</span></div>
    <svg viewBox="0 0 520 420" role="group" aria-label={t('home.diagramTitle')}>
      <defs><pattern id="home-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" /></pattern></defs>
      <rect width="520" height="420" fill="url(#home-dots)" className="home-diagram-grid" />
      <g className="home-wires" fill="none"><path d="M260 100V180M260 230V250Q260 265 245 265H115Q100 265 100 280V320M260 230V320M260 230V250Q260 265 275 265H405Q420 265 420 280V320" /></g>
      {playing && <circle key={animation} r="4" className="home-signal" onAnimationEnd={() => setPlaying(false)} />}
      {devices.map((device, index) => <g key={device.label} transform={`translate(${device.x} ${device.y})`}>
        <g role="button" tabIndex={0} aria-label={`${t(`home.${device.id}`)} ${device.label}`} aria-pressed={selected === index}
          className={'home-diagram-device' + (selected === index ? ' is-selected' : '')}
          onClick={() => select(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index); } }}>
          <rect x="-39" y="-32" width="78" height="64" rx="14" /><path d={device.path} fill="none" />
        </g><text y="51" textAnchor="middle">{device.label}</text>
      </g>)}
    </svg>
    <div className="home-diagram-footer"><div aria-live="polite"><strong>{t(`home.${devices[selected].id}`)}</strong><p>{t(`home.${devices[selected].id}Hint`)}</p></div>
      <button className="home-icon-button" title={t('home.animate')} aria-label={t('home.animate')} onClick={() => { animate(v => v + 1); setPlaying(true); }}>↗</button>
    </div>
    <p className="home-diagram-instruction">{t('home.diagramHint')}</p>
  </section>;
}
