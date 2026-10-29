import { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { Packet, positionPacket } from './Packet';
import { alternatingScrollSegments, clamp, follow, scrollProgress, scrollSegments, type Point } from './geometry';
import { JourneyArtwork, type JourneyDevice } from './JourneyArtwork';
import { paintArrival } from './arrival';
import { EnergyBorder } from './EnergyBorder';
import { remapStationPosition, stationAt, stationMove, stationMovePosition, STATION_MOTION, type StationMove } from './stationMotion';

const sections = ['terminal', 'switch', 'routing', 'capture', 'exercise'] as const;
const devices: JourneyDevice[] = ['host', 'switch', 'router', 'server', 'host'];
export function ScrollJourney() {
  const { t, language } = useTranslation();
  const alternate = new URLSearchParams(location.search).get('stations') === 'alternate';
  const continuous = new URLSearchParams(location.search).get('scrollMotion') === 'continuous';
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), route = useRef<SVGPathElement>(null), light = useRef<SVGPathElement>(null), packet = useRef<SVGGElement>(null);
  const measureAgain = useRef(() => {});
  useEffect(() => {
    const element = root.current!, shape = route.current!, overlay = svg.current!;
    const cards = [...element.querySelectorAll<HTMLElement>('.journey-feature')];
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let points: Point[] = [], top = 0, length = 0, thresholds: number[] = [], current = 0, target = 0, frame = 0, last = 0, inside = false, disposed = false, reduced = motion.matches;
    let measureFrame = 0, measured = false;
    let destination = 0, move: StationMove | null = null;
    const paint = () => {
      if (!points.length) return;
      positionPacket(packet.current, shape.getPointAtLength(current * length));
      light.current!.style.strokeDasharray = `${length}`; light.current!.style.strokeDashoffset = `${length * (1 - current)}`;
      element.dataset.progress = current.toFixed(6);
      element.dataset.destination = String(destination); element.dataset.target = target.toFixed(6);
      cards.forEach((card, i) => {
        paintArrival(card, current * length, thresholds[i] * length, reduced);
      });
    };
    const tick = (time: number) => {
      frame = 0;
      if (disposed || document.hidden || !inside || reduced) { last = 0; return; }
      const elapsed = last ? Math.min(50, time - last) : 16; last = time;
      if (continuous) current = follow(current, target, elapsed);
      else if (move) { move.elapsed = Math.min(move.duration, move.elapsed + elapsed); current = stationMovePosition(move); if (move.elapsed === move.duration) { current = target; move = null; } }
      paint();
      if (current !== target) frame = requestAnimationFrame(tick);
      else { last = 0; element.dataset.animating = 'false'; }
    };
    const update = (immediate = false, remeasured = false) => {
      if (!points.length || disposed) return;
      element.dataset.paused = String(document.hidden || !inside);
      const previousTarget = target;
      destination = stationAt(scrollY + innerHeight * STATION_MOTION.activationLine - top, points.map(p => p.y), immediate ? undefined : destination);
      target = continuous ? scrollProgress(scrollY, top, points[0].y, points.at(-1)!.y, innerHeight) : thresholds[destination];
      if (immediate || reduced || !inside || document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; current = target; move = null; paint(); element.dataset.animating = 'false'; }
      else {
        if (!continuous && (target !== previousTarget || remeasured)) { move = current === target ? null : stationMove(current, target, length); last = 0; }
        if (!frame && current !== target) { element.dataset.animating = 'true'; frame = requestAnimationFrame(tick); }
      }
    };
    const measure = () => {
      measureFrame = 0; if (disposed) return;
      const before = thresholds;
      const box = element.getBoundingClientRect(); top = box.top + scrollY;
      // Measure the real SVG connector, including viewBox/aspect-ratio transforms.
      points = cards.map(card => { const rect = card.querySelector('[data-station-port]')!.getBoundingClientRect(); return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 }; });
      overlay.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const rows = cards.map(card => { const r = card.getBoundingClientRect(); return { top: r.top - box.top, bottom: r.bottom - box.top }; });
      const segments = alternate && matchMedia('(min-width: 801px)').matches ? alternatingScrollSegments(points, rows) : scrollSegments(points);
      const d = segments[0] + segments.slice(1).map(s => s.replace(/^M[^LCQ]+/, '')).join('');
      shape.setAttribute('d', d); light.current!.setAttribute('d', d); length = shape.getTotalLength();
      // Cache arc-length thresholds once per real layout change, not per frame.
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path'); let traversed = 0;
      thresholds = [0, ...segments.map(segment => { probe.setAttribute('d', segment); traversed += probe.getTotalLength(); return clamp(traversed / length); })];
      cards.forEach((card, i) => { card.dataset.threshold = String(thresholds[i]); });
      element.dataset.measurements = String(Number(element.dataset.measurements ?? 0) + 1);
      if (measured && !continuous) current = remapStationPosition(current, before, thresholds);
      update(!measured || continuous, true); measured = true;
    };
    const queueMeasure = () => { if (!measureFrame && !disposed) measureFrame = requestAnimationFrame(measure); };
    measureAgain.current = queueMeasure;
    const resize = new ResizeObserver(queueMeasure); resize.observe(element); cards.forEach(card => resize.observe(card));
    const intersection = new IntersectionObserver(entries => { inside = entries[0].isIntersecting; update(!inside); }); intersection.observe(element);
    const scroll = () => update(!measured);
    const visibility = () => update(document.hidden);
    const preference = () => { reduced = motion.matches; update(true); };
    window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', queueMeasure);
    document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', preference);
    document.fonts.ready.then(() => { if (!disposed) queueMeasure(); }); queueMeasure();
    return () => { disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(measureFrame); resize.disconnect(); intersection.disconnect(); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', queueMeasure); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', preference); measureAgain.current = () => {}; };
  }, []);
  useEffect(() => { measureAgain.current(); }, [language]);
  return <section className={`journey-scroll${alternate ? ' journey-scroll-alternate' : ''}`} aria-labelledby="journey-scroll-title">
    <header><p className="home-eyebrow">{t('journey.inside')}</p><h2 id="journey-scroll-title">{t('journey.scrollTitle')}</h2><p>{t('journey.scrollHint')}</p></header>
    <div className="journey-stations" data-motion={continuous ? 'continuous' : 'stations'} ref={root}>
      <svg ref={svg} className="journey-scroll-svg" aria-hidden="true"><path ref={route} className="journey-route"/><path ref={light} className="journey-route-lit"/><Packet ref={packet} id="scroll"/></svg>
      {sections.map((section, i) => <article key={section} className="journey-feature" data-section={section} data-reached="false">
        <div className="journey-equipment"><JourneyArtwork kind={devices[i]} /></div>
        <div className="journey-station-panel">{(section === 'switch' || section === 'exercise') && <EnergyBorder />}<span className="journey-feature-index">0{i + 1}</span>
        <h3>{t(`journey.${section}Title`)}</h3><p>{t(`journey.${section}Body`)}</p>
        <div className="journey-example"><span>{t(`journey.${section}Label`)}</span>
          {section === 'terminal' && <div className="journey-terminal"><code>PC → Switch</code><div className="journey-reveal"><small>{t('journey.firstConnection')}</small><code>eth0 · IPv4</code></div></div>}
          {section === 'capture' && <div className="journey-capture"><div>{t('journey.protocol')} <span>{t('journey.sourceDestination')}</span></div><div className="journey-reveal"><code>ICMP</code><span>pc1 → srv1</span></div></div>}
          {section === 'switch' && <div className="journey-switch-example"><div className="journey-port-bank" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(n => <i key={n}/>)}</div></div>}
          {section === 'routing' && <div className="journey-routing-example"><code>192.168.1.0/24</code><span className="journey-reveal">↓ {t('journey.routingSample')}</span><code>192.168.2.0/24</code></div>}
          {section === 'exercise' && <div className="journey-question"><p>{t('journey.exerciseSample')}</p><strong className="journey-reveal">✓ {t('journey.answerSample')}</strong></div>}
        </div></div>
      </article>)}
    </div>
  </section>;
}
