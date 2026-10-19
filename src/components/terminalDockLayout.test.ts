import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTerminalSession, clampDockHeight, DEFAULT_DOCK_HEIGHT, DOCK_HEIGHT_KEY, dockHeightBounds, observeTerminalSize, readDockHeight, saveDockHeight } from './terminalDockLayout';
import type { Session } from '../terminals';

afterEach(() => vi.unstubAllGlobals());

describe('terminal presentation attachment', () => {
  it('opens once and moves the existing DOM element without replacing its buffer or disposing', () => {
    const buffer = { history: ['hostname', 'pc1'], input: 'ping ' };
    const element = { parentElement: null as unknown };
    const host = () => ({ appendChild: vi.fn((node: typeof element) => { node.parentElement = nodeHost; }) });
    let nodeHost: unknown;
    const first = host();
    const second = host();
    const open = vi.fn((parent: unknown) => { element.parentElement = parent; });
    const dispose = vi.fn();
    const session = { opened: false, term: { element, buffer, open, dispose } } as unknown as Session;
    attachTerminalSession(session, first as unknown as HTMLElement);
    attachTerminalSession(session, first as unknown as HTMLElement);
    nodeHost = second;
    attachTerminalSession(session, second as unknown as HTMLElement);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(first);
    expect(first.appendChild).not.toHaveBeenCalled();
    expect(second.appendChild).toHaveBeenCalledOnce();
    expect(second.appendChild).toHaveBeenCalledWith(element);
    expect(element.parentElement).toBe(second);
    expect(session.term.buffer).toBe(buffer);
    expect(dispose).not.toHaveBeenCalled();
  });
});

describe('terminal dock height', () => {
  it('clamps height and reserves topology space below the toolbar', () => {
    expect(dockHeightBounds(900)).toEqual({ min: 160, max: 551 });
    expect(clampDockHeight(280, 900)).toBe(280);
    expect(clampDockHeight(12, 900)).toBe(160);
    expect(clampDockHeight(900, 900)).toBe(551);
    expect(clampDockHeight(9999, 2000)).toBe(600);
    expect(clampDockHeight(280.4, 900)).toBe(280);
  });

  it.each([200, 320, 480, 600, 900, 2000])('keeps a usable topology on a %ipx viewport', (viewport) => {
    const { min, max } = dockHeightBounds(viewport);
    expect(min).toBeLessThanOrEqual(max);
    expect(max).toBeLessThanOrEqual(viewport - 52 - Math.min(160, (viewport - 52) / 2));
    expect(clampDockHeight(10_000, viewport)).toBe(max);
    expect(clampDockHeight(1, viewport)).toBe(min);
  });

  it('adapts an existing preference to a smaller viewport without overwriting it', () => {
    vi.stubGlobal('localStorage', { getItem: () => '480', setItem: vi.fn() });
    expect(clampDockHeight(readDockHeight(), 320)).toBe(134);
    expect(clampDockHeight(readDockHeight(), 1000)).toBe(480);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it.each([null, '', ' ', 'garbage', '-1', '0', 'Infinity', 'NaN'])('ignores invalid saved preference %s', (saved) => {
    vi.stubGlobal('localStorage', { getItem: () => saved });
    expect(readDockHeight()).toBe(DEFAULT_DOCK_HEIGHT);
  });

  it('persists the preferred height independently of topology autosave', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    saveDockHeight(360);
    expect(values).toEqual(new Map([[DOCK_HEIGHT_KEY, '360']]));
    expect(readDockHeight()).toBe(360);
  });

  it('continues without storage access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    });
    expect(readDockHeight()).toBe(DEFAULT_DOCK_HEIGHT);
    expect(() => saveDockHeight(360)).not.toThrow();
  });
});

describe('fitting the visible terminal', () => {
  function observe(width = 800, height = 240) {
    let notify!: () => void;
    const disconnect = vi.fn();
    const observed = vi.fn();
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++next, callback);
      return next;
    });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notify = callback; }
      observe = observed;
      disconnect = disconnect;
    });
    const host = { clientWidth: width, clientHeight: height } as HTMLElement;
    const fit = vi.fn();
    const stop = observeTerminalSize(host, fit);
    const paint = () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const frame of pending) frame(0);
    };
    return { host, fit, stop, notify, paint, frames, observed, disconnect };
  }

  it('fits on opening and coalesces repeated resize notifications per frame', () => {
    const o = observe();
    expect(o.observed).toHaveBeenCalledWith(o.host);
    o.notify();
    o.notify();
    expect(o.frames.size).toBe(1);
    o.paint();
    expect(o.fit).toHaveBeenCalledTimes(1);
    o.notify();
    o.paint();
    expect(o.fit).toHaveBeenCalledTimes(2);
    o.stop();
  });

  it.each([[0, 240], [800, 0]])('does not fit hidden/zero sized panes (%i x %i)', (width, height) => {
    const o = observe(width, height);
    o.paint();
    expect(o.fit).not.toHaveBeenCalled();
    o.stop();
  });

  it('cancels pending fits and ignores notifications after unmount/hide', () => {
    const o = observe();
    o.stop();
    expect(o.disconnect).toHaveBeenCalledTimes(1);
    expect(o.frames.size).toBe(0);
    o.notify();
    o.paint();
    expect(o.fit).not.toHaveBeenCalled();
  });
});
