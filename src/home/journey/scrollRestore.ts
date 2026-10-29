const KEY = 'netlab:journey-scroll';

/** Lazy content is not present during native scroll restoration. Remember only
 * this history entry's viewport; never write preferences or project storage. */
export function installJourneyScrollRestore() {
  const saved = history.state?.[KEY];
  const valid = saved && saved.url === location.href && Number.isFinite(saved.y) && saved.y >= 0;
  const previousRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  let frame = 0, timer = 0, active = true, interacted = false;
  const restore = () => {
    if (valid && active && !interacted) scrollTo(0, saved.y);
  };
  const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); };
  const interaction = () => { interacted = true; cancelAnimationFrame(frame); };
  const save = () => { clearTimeout(timer); history.replaceState({ ...history.state, [KEY]: { url: location.href, y: scrollY } }, ''); };
  const scrolled = () => { clearTimeout(timer); timer = window.setTimeout(save, 120); };
  const hide = () => { save(); history.scrollRestoration = previousRestoration; };
  const show = () => { history.scrollRestoration = 'manual'; queue(); };
  window.addEventListener('scroll', scrolled, { passive: true });
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  window.addEventListener('wheel', interaction, { passive: true });
  window.addEventListener('pointerdown', interaction, { passive: true });
  window.addEventListener('keydown', interaction);
  restore(); queue();
  document.fonts.ready.then(() => { if (active) queue(); });
  return () => {
    active = false; cancelAnimationFrame(frame); clearTimeout(timer);
    history.scrollRestoration = previousRestoration;
    window.removeEventListener('scroll', scrolled);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
    window.removeEventListener('wheel', interaction); window.removeEventListener('pointerdown', interaction); window.removeEventListener('keydown', interaction);
  };
}
