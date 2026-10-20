import { afterEach, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { capturePresentationSelection, restorePresentationSelection } from './terminalPresentationSelection';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const command = 'Olá 東京 🌐', full = 'host:~$ ' + command;
  let cols = 40, input = () => {};
  const term = {
    get cols() { return cols; },
    element: { isConnected: true },
    getSelection: () => command,
    getSelectionPosition: () => ({ start: { x: 8, y: 0 } }),
    select: vi.fn(),
    write: vi.fn((_text: string, callback: () => void) => callback()),
    onData: (callback: () => void) => { input = callback; return { dispose: vi.fn() }; },
    buffer: { get active() {
      type Cell = { getChars(): string; getWidth(): number };
      const rows: Cell[][] = [[]];
      for (const char of Array.from(full)) {
        const width = ['東', '京', '🌐'].includes(char) ? 2 : 1;
        let row = rows[rows.length - 1];
        if (row.length + width > cols) { rows.push([]); row = rows[rows.length - 1]; }
        row.push({ getChars: () => char, getWidth: () => width });
        if (width === 2) row.push({ getChars: () => '', getWidth: () => 0 });
      }
      return { length: rows.length, getLine: (row: number) => rows[row] && ({ isWrapped: row > 0, getCell: (col: number) => rows[row][col] }) };
    } },
  } as unknown as Terminal;
  return { term, resize: () => { cols = 13; }, type: () => input(), paint: () => { while (frames.length) frames.shift()!(0); } };
}

it('restores a Unicode selection after a move reflows wide cells and wrap padding', () => {
  const f = fixture();
  capturePresentationSelection(f.term);
  f.resize();
  restorePresentationSelection(f.term);
  f.paint();
  expect(f.term.select).toHaveBeenCalledWith(8, 0, 12);
});

it('does not restore a stale selection after new input or a disposed presentation', () => {
  const f = fixture();
  capturePresentationSelection(f.term); restorePresentationSelection(f.term); f.type(); f.paint();
  expect(f.term.select).not.toHaveBeenCalled();
  capturePresentationSelection(f.term); restorePresentationSelection(f.term);
  Object.defineProperty(f.term.element, 'isConnected', { value: false });
  f.paint();
  expect(f.term.select).not.toHaveBeenCalled();
});

it('retains a selection across continuous splitter reflows until release, cancelling on new input', () => {
  const f = fixture();
  const release = capturePresentationSelection(f.term, true);
  for (let i = 0; i < 3; i++) {
    f.resize(); restorePresentationSelection(f.term); f.paint();
    expect(f.term.select).toHaveBeenCalledTimes(i + 1);
  }
  release(); f.paint();
  expect(f.term.select).toHaveBeenCalledTimes(4);
  restorePresentationSelection(f.term); f.paint();
  expect(f.term.select).toHaveBeenCalledTimes(4);
  const cancel = capturePresentationSelection(f.term, true);
  f.type(); cancel(); restorePresentationSelection(f.term); f.paint();
  expect(f.term.select).toHaveBeenCalledTimes(4);
});
