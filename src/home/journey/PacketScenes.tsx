import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { Packet, positionPacket } from './Packet';
import { JourneyArtwork, artworkPlacement, type JourneyDevice } from './JourneyArtwork';
import { paintArrival } from './arrival';
import { DataDocument, paintDataPreview } from './DataPreview';
import { cameraForX, clamp, HERO_PATH, JOURNEY_DURATION_MS, SCENE_PROGRESS, sceneForX, SEEK_DURATION_MS, smoothStep, travelProgress, pathFractionAtX, HERO_REPLY_PROGRESS, HERO_TIMING } from './geometry';

type View = { scene: number; playing: boolean; seeking: boolean; reply: boolean; reduced: boolean; ended: boolean; assets: 'loading' | 'ready' | 'failed' };
type Command = { kind: 'toggle' } | { kind: 'replay' } | { kind: 'scene'; index: number };
const devices: { kind: JourneyDevice; x: number; y: number; width: number; name: string }[] = [
  { kind: 'host', x: 140, y: 170, width: 140, name: 'pc1' },
  { kind: 'switch', x: 670, y: 170, width: 160, name: 'sw1' },
  { kind: 'router', x: 820, y: 100, width: 130, name: 'r1' },
  { kind: 'server', x: 1370, y: 170, width: 80, name: 'srv1' },
];
const initial: View = { scene: 0, playing: false, seeking: false, reply: false, reduced: false, ended: false, assets: 'loading' };
const deviceLabels = { host: 'journey.deviceComputer', switch: 'journey.deviceSwitch', router: 'journey.deviceRouter', server: 'journey.deviceServer' } as const;
function ControlIcon({ kind }: { kind: 'previous' | 'next' | 'play' | 'pause' | 'replay' }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'previous' && <path d="m14 6-6 6 6 6" />}
    {kind === 'next' && <path d="m10 6 6 6-6 6" />}
    {kind === 'play' && <path d="m8 5 11 7-11 7Z" fill="currentColor" fillOpacity=".12" />}
    {kind === 'pause' && <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>}
    {kind === 'replay' && <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>}
  </svg>;
}
export function PacketScenes() {
  const { t } = useTranslation();
  const dataPreview = new URLSearchParams(location.search).get('dataPreview') === '1';
  const sourceData = useRef<SVGGElement>(null), destinationData = useRef<SVGGElement>(null);
  const root = useRef<HTMLElement>(null), path = useRef<SVGPathElement>(null), camera = useRef<SVGGElement>(null), packet = useRef<SVGGElement>(null);
  const command = useRef<(action: Command) => void>(() => {});
  const [view, setView] = useState(initial);
  useEffect(() => {
    const element = root.current!, route = path.current!, length = route.getTotalLength();
    const stops = [0, pathFractionAtX(route, 670), pathFractionAtX(route, 820), 1];
    const artwork = [...element.querySelectorAll('[data-hero-device]')];
    let visualProgress = 0;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let progress = 0, playing = false, inside = false, reduced = motion.matches, frame = 0, last = 0, disposed = false;
    let seek: { from: number; to: number; elapsed: number; resume: boolean; paused: boolean; fromDistance: number; toDistance: number } | null = null;
    let published = '', assets: View['assets'] = 'loading', autoEligible = !reduced, cycles = 0;
    element.style.setProperty('--journey-arrival-duration', HERO_TIMING.arrivalMs + 'ms');
    const paint = () => {
      visualProgress = seek ? seek.fromDistance + (seek.toDistance - seek.fromDistance) * smoothStep(seek.elapsed / SEEK_DURATION_MS) : travelProgress(progress, stops);
      const point = route.getPointAtLength(length * visualProgress);
      artwork.forEach((art, i) => paintArrival(art, length * visualProgress, length * stops[i], reduced));
      element.dataset.travel = visualProgress.toFixed(6); element.dataset.assets = assets; element.dataset.cycles = String(cycles);
      positionPacket(packet.current, point);
      if (dataPreview) paintDataPreview(sourceData.current, destinationData.current, packet.current, progress, assets === 'ready' && !reduced && !seek);
      camera.current?.setAttribute('transform', `translate(${(-cameraForX(point.x)).toFixed(3)} 0)`);
      packet.current?.setAttribute('data-reply', String(progress > HERO_REPLY_PROGRESS));
      element.dataset.progress = progress.toFixed(6); element.dataset.seeking = String(!!seek);
      const value: View = { scene: sceneForX(point.x), playing: playing || (!!seek && !seek.paused), seeking: !!seek, reply: progress > HERO_REPLY_PROGRESS, reduced, ended: progress >= 1, assets };
      const signature = JSON.stringify(value);
      if (signature !== published) { published = signature; setView(value); }
    };
    const enabled = () => !disposed && !document.hidden && inside && !reduced && assets === 'ready';
    const stopFrame = () => { cancelAnimationFrame(frame); frame = 0; last = 0; element.dataset.animating = 'false'; };
    const tick = (time: number) => {
      frame = 0;
      if (!enabled()) { last = 0; return; }
      const elapsed = last ? Math.min(50, time - last) : 0; last = time;
      if (seek) {
        seek.elapsed += elapsed; progress = seek.from + (seek.to - seek.from) * smoothStep(seek.elapsed / SEEK_DURATION_MS);
        if (seek.elapsed >= SEEK_DURATION_MS) { progress = seek.to; playing = seek.resume; seek = null; }
      } else if (playing) { progress = clamp(progress + elapsed / JOURNEY_DURATION_MS); if (progress === 1) { progress = 0; cycles++; } }
      paint(); schedule();
    };
    const schedule = () => {
      if (enabled() && (playing || (seek && !seek.paused))) { if (!frame) frame = requestAnimationFrame(tick); element.dataset.animating = 'true'; }
      else stopFrame();
    };
    command.current = action => {
      autoEligible = false;
      if (action.kind === 'toggle') {
        if (seek) seek.paused = !seek.paused;
        else if (playing) playing = false;
        else if (!reduced && assets === 'ready') { if (progress >= 1) seek = { from: progress, to: 0, elapsed: 0, resume: true, paused: false, fromDistance: visualProgress, toDistance: 0 }; else playing = true; }
      } else {
        const to = action.kind === 'replay' ? 0 : SCENE_PROGRESS[clamp(action.index, 0, 2)];
        playing = false;
        if (reduced || assets !== 'ready') { progress = to; seek = null; }
        else seek = { from: progress, to, elapsed: 0, resume: action.kind === 'replay', paused: false, fromDistance: visualProgress, toDistance: travelProgress(to, stops) };
      }
      paint(); schedule();
    };
    const visibility = () => {
      stopFrame(); if (autoEligible && enabled()) { playing = true; autoEligible = false; }
      paint(); schedule();
    };
    // Decode static images without importing the editor or owning long-lived listeners.
    const sources = [...new Set([...element.querySelectorAll('image')].map(image => image.getAttribute('href')!))];
    void Promise.all(sources.map(src => { const image = new Image(); image.src = src; return image.decode(); })).then(() => {
      if (!disposed) { assets = 'ready'; visibility(); }
    }, () => { if (!disposed) { assets = 'failed'; playing = false; autoEligible = false; paint(); stopFrame(); } });
    const preference = () => { reduced = motion.matches; if (reduced) { playing = false; seek = null; autoEligible = false; } paint(); stopFrame(); schedule(); };
    const observer = new IntersectionObserver(entries => { inside = entries[0].isIntersecting; visibility(); }); observer.observe(element);
    motion.addEventListener('change', preference); document.addEventListener('visibilitychange', visibility); paint();
    return () => { disposed = true; stopFrame(); observer.disconnect(); motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); command.current = () => {}; };
  }, []);
  const titles = ['journey.scene1', 'journey.scene2', 'journey.scene3'] as const;
  const details = ['journey.detail1', 'journey.detail2', 'journey.detail3'] as const;
  return <section className="journey-scenes" data-preview={dataPreview} data-duration={JOURNEY_DURATION_MS} ref={root} aria-label={t('journey.scenes')} tabIndex={0}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); command.current({ kind: 'scene', index: event.key === 'Home' ? 0 : event.key === 'End' ? 2 : clamp(view.scene + (event.key === 'ArrowLeft' ? -1 : 1), 0, 2) });
      } else if (event.key === ' ' && event.target === event.currentTarget) { event.preventDefault(); command.current({ kind: 'toggle' }); }
    }}>
    <div className="journey-scene-top"><span>{t('journey.scenes')}</span><span>{view.scene + 1} / 3</span></div>
    <svg className="journey-panorama" viewBox="0 0 480 290" aria-hidden="true">
      <defs><pattern id="journey-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" strokeWidth=".5"/></pattern></defs>
      <g ref={camera}>
        <rect width="1440" height="290" fill="url(#journey-grid)" opacity=".18" />
        <path ref={path} d={HERO_PATH} className="journey-route" />
        <g className="journey-scene-art">
          {devices.map(device => <g key={device.name} data-hero-device={device.kind}>
            <rect className="journey-asset-placeholder" {...artworkPlacement(device.kind, device, device.width)} rx="9"/>
            <JourneyArtwork kind={device.kind} {...artworkPlacement(device.kind, device, device.width)} />
            <text x={device.x} y={device.y + 53}>{t(deviceLabels[device.kind])}</text>
          </g>)}
          <text x="280" y="125">LAN A</text><text x="1210" y="242">LAN B</text>
        </g>
        <Packet ref={packet} id="scenes" />
        {dataPreview && <><DataDocument kind="source" ref={sourceData} /><DataDocument kind="destination" ref={destinationData} /></>}
      </g>
    </svg>
    <div className="journey-scene-caption" aria-live="polite">
      <span className="journey-sr-only journey-protocol">{t(dataPreview ? (view.reply ? 'journey.dataReturn' : 'journey.dataSignal') : (view.reply ? 'journey.reply' : 'journey.request'))}</span>
      <h2>{t(titles[view.scene])}</h2><p>{t(view.reply ? 'journey.replyDetail' : details[view.scene])}</p>
    </div>
    <div className="journey-controls" role="group" aria-label={t('journey.controls')}>
      <button data-action="previous" onClick={() => command.current({ kind: 'scene', index: view.scene - 1 })} disabled={view.scene === 0} aria-label={t('journey.previous')} title={t('journey.previous')}><ControlIcon kind="previous" /></button>
      <div className="journey-scene-tabs" role="group" aria-label={t('journey.scenes')}>{titles.map((title, i) => <button key={title} aria-label={t(title)} title={t(title)} aria-pressed={view.scene === i} data-scene={i} data-progress={SCENE_PROGRESS[i].toFixed(6)}
        onClick={() => command.current({ kind: 'scene', index: i })}><span aria-hidden="true" /></button>)}</div>
      <button data-action="next" onClick={() => command.current({ kind: 'scene', index: view.scene + 1 })} disabled={view.scene === 2} aria-label={t('journey.next')} title={t('journey.next')}><ControlIcon kind="next" /></button>
      <span className="journey-controls-divider" aria-hidden="true" />
      <button className="journey-play" data-action="play" aria-label={t(view.playing ? 'journey.pause' : 'journey.play')} title={t(view.playing ? 'journey.pause' : 'journey.play')} disabled={view.reduced || view.assets !== 'ready'} onClick={() => command.current({ kind: 'toggle' })}><ControlIcon kind={view.playing ? 'pause' : 'play'} /><span>{t(view.playing ? 'journey.pause' : 'journey.play')}</span></button>
      <button data-action="replay" aria-label={t('journey.replay')} title={t('journey.replay')} onClick={() => command.current({ kind: 'replay' })}><ControlIcon kind="replay" /></button>
    </div>
    <p className={view.assets !== 'ready' ? 'journey-asset-note' : 'journey-sr-only'} role="status">{t(view.assets === 'loading' ? 'journey.assetsLoading' : view.assets === 'failed' ? 'journey.assetsFailed' : view.reduced ? 'journey.reduced' : view.seeking && view.playing ? 'journey.reposition' : view.ended ? 'journey.end' : view.playing ? 'journey.playing' : 'journey.idle')}</p>
  </section>;
}
