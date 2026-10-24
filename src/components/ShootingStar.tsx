import { useEffect, useRef } from 'react';
import { nextStarDelay, starFlight } from '../shootingStar';

// One brief compositor animation per interval; no permanent JS animation loop.
export function ShootingStar() {
  const star = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let animation: Animation | undefined;
    const stop = () => { clearTimeout(timer); animation?.cancel(); animation = undefined; };
    const schedule = () => { timer = setTimeout(launch, nextStarDelay()); };
    const launch = () => {
      if (document.hidden || motion.matches || !star.current) return;
      animation?.cancel();
      const f = starFlight(window.innerWidth, window.innerHeight);
      const element = star.current;
      element.style.left = `${f.x}px`; element.style.top = `${f.y}px`; element.style.width = `${f.trail}px`;
      animation = element.animate([
        { transform: `translate(0, 0) rotate(${f.angle}deg)`, opacity: 0 },
        { transform: `translate(${f.dx * .2}px, ${f.dy * .2}px) rotate(${f.angle}deg)`, opacity: .55, offset: .2 },
        { transform: `translate(${f.dx * .7}px, ${f.dy * .7}px) rotate(${f.angle}deg)`, opacity: .45, offset: .7 },
        { transform: `translate(${f.dx}px, ${f.dy}px) rotate(${f.angle}deg)`, opacity: 0 },
      ], { duration: f.duration, easing: 'linear' });
      schedule();
    };
    const visibility = () => { stop(); if (!document.hidden && !motion.matches) schedule(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', visibility);
    motion.addEventListener('change', visibility);
    visibility();
    return () => { stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', visibility); motion.removeEventListener('change', visibility); };
  }, []);
  return <div className="background-particles shooting-star-layer"><div ref={star} className="shooting-star" /></div>;
}
