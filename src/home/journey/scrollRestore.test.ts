import { afterEach, expect, it, vi } from 'vitest';
import { installJourneyScrollRestore } from './scrollRestore';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup(saved?: { url: string; y: number }) {
  vi.useFakeTimers();
  const events = new EventTarget();
  const state = { state: { keep: 'untouched', ...(saved ? { 'netlab:journey-scroll': saved } : {}) }, scrollRestoration: 'auto', replaceState: vi.fn((next: typeof state.state) => { state.state = next; }) };
  const scroll = vi.fn(), frames = new Map<number, FrameRequestCallback>(); let id = 0;
  vi.stubGlobal('window', Object.assign(events, { setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args) }));
  vi.stubGlobal('history', state); vi.stubGlobal('location', { href: 'https://example.test/' });
  vi.stubGlobal('scrollY', 420); vi.stubGlobal('scrollTo', scroll);
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  return { events, state, scroll, frames };
}
it('restores only the current history entry and debounces saves without adding history entries', () => {
  const { events, state, scroll } = setup({ url: 'https://example.test/', y: 840 });
  const release = installJourneyScrollRestore(); expect(scroll).toHaveBeenCalledWith(0, 840);
  expect(state.scrollRestoration).toBe('manual');
  for (let i = 0; i < 20; i++) events.dispatchEvent(new Event('scroll'));
  expect(state.replaceState).not.toHaveBeenCalled(); vi.advanceTimersByTime(120);
  expect(state.replaceState).toHaveBeenCalledTimes(1); expect(state.state.keep).toBe('untouched');
  release(); expect(state.scrollRestoration).toBe('auto');
});
it('ignores invalid or unrelated positions and releases callbacks/listeners on unmount', async () => {
  const { events, state, scroll, frames } = setup({ url: 'https://example.test/other', y: 200 });
  const release = installJourneyScrollRestore(); expect(scroll).not.toHaveBeenCalled();
  events.dispatchEvent(new Event('scroll')); release(); await Promise.resolve(); vi.runAllTimers();
  events.dispatchEvent(new Event('pagehide')); expect(state.replaceState).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
});
it('does not pull the user back after interacting before fonts finish loading', async () => {
  const { events, scroll, frames } = setup({ url: 'https://example.test/', y: 840 });
  const release = installJourneyScrollRestore(); scroll.mockClear(); events.dispatchEvent(new Event('wheel'));
  await Promise.resolve(); for (const callback of frames.values()) callback(16);
  expect(scroll).not.toHaveBeenCalled(); release();
});
