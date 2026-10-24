import { useEffect, useRef, useState } from 'react';
import type { Container } from '@tsparticles/engine';
import { useCanvasBackground } from '../canvasBackground';
import { particleOptions } from '../backgroundParticles';
import { ShootingStar } from './ShootingStar';

let engineReady: Promise<typeof import('@tsparticles/engine')['tsParticles']> | undefined;
function loadEngine() {
  return engineReady ??= Promise.all([import('@tsparticles/engine'), import('@tsparticles/basic')])
    .then(async ([{ tsParticles }, { loadBasic }]) => { await loadBasic(tsParticles); return tsParticles; })
    .catch(error => { engineReady = undefined; throw error; });
}

export function BackgroundParticles() {
  const preset = useCanvasBackground(s => s.preference.animation);
  const host = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    setFailed(false);
    if (preset === 'off' || reduced || !host.current) return;
    let cancelled = false;
    let container: Container | undefined;
    const element = host.current;
    const visibility = () => { if (document.hidden) container?.pause(); else container?.play(); };
    document.addEventListener('visibilitychange', visibility);
    void loadEngine().then(async engine => {
      if (cancelled) return;
      const loaded = await engine.load({ element, options: particleOptions(preset) });
      if (cancelled) { loaded?.destroy(); return; }
      container = loaded; visibility();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; document.removeEventListener('visibilitychange', visibility); container?.destroy(); };
  }, [preset, reduced]);
  if (preset === 'off' || reduced) return null;
  return <div className="background-particles-clip" aria-hidden="true">
    <div ref={host} className={`background-particles${preset === 'fireflies' ? ' is-fireflies' : ''}`}
      data-preset={preset} data-load-failed={failed || undefined} />
    {preset === 'shooting' && <ShootingStar />}
  </div>;
}
