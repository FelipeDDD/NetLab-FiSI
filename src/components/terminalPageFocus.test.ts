import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { attachTerminalPageFocus } from './terminalPageFocus';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  const terminal: { closest: () => object | null } = { closest: () => ({}) };
  const input = { closest: () => null }, body = { closest: () => null };
  const doc = Object.assign(new EventTarget(), {
    hidden: false, focused: true, activeElement: terminal, body, documentElement: {},
    hasFocus: (): boolean => doc.focused, defaultView: new EventTarget(),
  });
  const dock = { ownerDocument: doc, contains: (e: unknown) => e === terminal };
  const release = vi.fn(), focus = vi.fn(() => { doc.activeElement = body; });
  const stop = attachTerminalPageFocus(dock as unknown as HTMLElement, release, focus);
  const event = (type: string, window = false) => (window ? doc.defaultView : doc).dispatchEvent(new Event(type));
  const leave = (hidden = true) => {
    doc.focused = false; event('blur', true);
    if (hidden) { doc.hidden = true; event('visibilitychange'); }
  };
  const back = () => {
    doc.hidden = false; event('visibilitychange'); doc.focused = true; event('focus', true);
    vi.runAllTimers();
  };
  return { doc, terminal, input, body, release, focus, event, leave, back, stop };
}
it.each([true, false])('returns from a tab/window once, with hidden=%s', hidden => {
  const f = fixture(); f.leave(hidden); f.back();
  expect(f.release).toHaveBeenCalledTimes(1);
  expect(f.focus).toHaveBeenCalledTimes(1);
  f.event('focus', true); f.event('visibilitychange'); vi.runAllTimers();
  expect(f.focus).toHaveBeenCalledTimes(1);
  f.stop();
});
it('retains terminal ownership when element blur precedes window blur', async () => {
  const f = fixture();
  f.doc.activeElement = f.body; f.doc.focused = false; f.event('focusout');
  await Promise.resolve(); f.leave(); f.back();
  expect(f.focus).toHaveBeenCalledTimes(1); f.stop();
});
it('waits for visible AND focused, regardless of event order', () => {
  const f = fixture(); f.leave();
  f.doc.focused = true; f.event('focus', true); vi.runAllTimers();
  expect(f.focus).not.toHaveBeenCalled();
  f.doc.hidden = false; f.event('visibilitychange'); vi.runAllTimers();
  expect(f.focus).toHaveBeenCalledTimes(1); f.stop();
});
it.each(['input', 'body'] as const)('preserves non-terminal focus (%s) at departure', async target => {
  const f = fixture(); f.doc.activeElement = f[target]; f.event('focusout'); f.event('focusin');
  await Promise.resolve(); f.leave(); f.back();
  expect(f.release).not.toHaveBeenCalled(); expect(f.focus).not.toHaveBeenCalled(); f.stop();
});
it('lets an intentional input focus during return win over the editor', () => {
  const f = fixture(); f.leave(); f.doc.activeElement = f.input; f.back();
  expect(f.release).toHaveBeenCalledOnce(); expect(f.focus).not.toHaveBeenCalled(); f.stop();
});
it('handles another departure after clicking back into the terminal', () => {
  const f = fixture(); f.leave(); f.back();
  f.doc.activeElement = f.terminal; f.event('focusin'); f.leave(false); f.back();
  expect(f.focus).toHaveBeenCalledTimes(2); f.stop();
});
it('cancels a pending return on unmount', () => {
  const f = fixture(); f.leave(); f.doc.hidden = false; f.doc.focused = true;
  f.event('focus', true); f.stop(); vi.runAllTimers(); f.event('focus', true); vi.runAllTimers();
  expect(f.release).not.toHaveBeenCalled(); expect(f.focus).not.toHaveBeenCalled();
});
