import type { Terminal } from '@xterm/xterm';

export type LineBuffer = Terminal['buffer']['active'];

export function inputStartRow(buffer: LineBuffer): number {
  let row = buffer.baseY + buffer.cursorY;
  while (row > 0 && buffer.getLine(row)?.isWrapped) row--;
  return row;
}

// Count rendered cells backwards from the editing cursor. This handles wide
// glyphs, combining marks, wrap padding and reflow without guessing wcwidth.
export function currentCommandRange(buffer: LineBuffer, cols: number, command: string) {
  if (!command || cols < 1) return null;
  const end = (buffer.baseY + buffer.cursorY) * cols + buffer.cursorX;
  let start = end;
  let remaining = command.length;
  while (start > 0 && remaining > 0) {
    start--;
    const cell = buffer.getLine(Math.floor(start / cols))?.getCell(start % cols);
    if (!cell) return null;
    if (cell.getWidth() === 0 || !cell.getChars()) continue;
    const chars = cell.getChars();
    if (!command.slice(0, remaining).endsWith(chars)) return null;
    remaining -= chars.length;
  }
  if (remaining !== 0) return null;
  return { column: start % cols, row: Math.floor(start / cols), length: end - start };
}

// Called after painting the complete input, with the xterm cursor at its end.
// Walk the rendered suffix rather than estimating wcwidth or prompt length.
export function commandCursorPosition(buffer: LineBuffer, cols: number, command: string, cursor: number) {
  if (cursor === command.length) return null; // Keep xterm's pending right-margin wrap.
  const suffix = currentCommandRange(buffer, cols, command.slice(cursor));
  return suffix && { column: suffix.column, row: suffix.row };
}
