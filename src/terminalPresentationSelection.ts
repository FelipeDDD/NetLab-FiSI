import type { Terminal } from '@xterm/xterm';

function searchableBuffer(term: Terminal) {
  let text = '';
  const cells: { row: number; column: number; width: number }[] = [];
  const buffer = term.buffer.active;
  for (let row = 0; row < buffer.length; row++) {
    const line = buffer.getLine(row);
    if (!line) continue;
    let last = term.cols - 1;
    while (last >= 0 && !line.getCell(last)?.getChars()) last--;
    for (let column = 0; column <= last; column++) {
      const cell = line.getCell(column);
      if (!cell || cell.getWidth() === 0) continue;
      const chars = cell.getChars() || ' ';
      text += chars;
      for (let i = 0; i < chars.length; i++) cells.push({ row, column, width: cell.getWidth() });
    }
    if (row + 1 < buffer.length && !buffer.getLine(row + 1)?.isWrapped) {
      text += '\n'; cells.push({ row, column: term.cols - 1, width: 1 });
    }
  }
  return { text, cells };
}
function occurrences(text: string, selected: string) {
  const result: number[] = [];
  for (let offset = text.indexOf(selected); offset !== -1; offset = text.indexOf(selected, offset + selected.length)) result.push(offset);
  return result;
}
const pending = new WeakMap<Terminal, { selected: string; fromEnd: number; queued: boolean; held: boolean; stop(): void }>();

// A view move can change columns. Capture semantic text rather than physical
// rows, which xterm invalidates during reflow. No command input is generated.
export function capturePresentationSelection(term: Terminal, held = false): () => void {
  pending.get(term)?.stop(); pending.delete(term);
  const selected = term.getSelection();
  if (!selected) return () => {};
  const { text, cells } = searchableBuffer(term);
  const position = term.getSelectionPosition();
  const start = cells.findIndex((cell) => cell.row === position?.start.y && cell.column === position?.start.x);
  const matches = occurrences(text, selected);
  const index = matches.indexOf(start);
  const input = term.onData(() => { pending.get(term)?.stop(); pending.delete(term); });
  const snapshot = { selected, fromEnd: index < 0 ? 0 : matches.length - index - 1, queued: false, held, stop: () => input.dispose() };
  pending.set(term, snapshot);
  // A splitter produces multiple reflows. Keep the same semantic selection
  // until pointer release, then restore once more and release the listener.
  return () => {
    if (pending.get(term) !== snapshot) return;
    snapshot.held = false;
    restorePresentationSelection(term);
  };
}

export function restorePresentationSelection(term: Terminal) {
  const snapshot = pending.get(term);
  if (!snapshot || snapshot.queued) return;
  snapshot.queued = true;
  // Let FitAddon and the serialized editable-line repaint finish first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (pending.get(term) !== snapshot) return;
    if (!term.element?.isConnected) { pending.delete(term); snapshot.stop(); return; }
    term.write('', () => {
      if (pending.get(term) !== snapshot) return;
      snapshot.queued = false;
      if (!snapshot.held) { pending.delete(term); snapshot.stop(); }
      const { text, cells } = searchableBuffer(term);
      const matches = occurrences(text, snapshot.selected);
      const offset = matches[matches.length - 1 - snapshot.fromEnd];
      if (offset === undefined) return;
      const start = cells[offset], end = cells[offset + snapshot.selected.length - 1];
      if (start && end) term.select(start.column, start.row, (end.row - start.row) * term.cols + end.column + end.width - start.column);
    });
  }));
}
