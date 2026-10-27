import { describe, expect, it } from 'vitest';
import { commandCursorPosition, currentCommandRange, inputStartRow, type LineBuffer } from './terminalLine';

type Cell = string | { chars: string; width: number };
function buffer(rows: { cells: Cell[]; wrapped?: boolean }[], cursorX: number, cursorY: number, baseY = 0): LineBuffer {
  return {
    cursorX, cursorY, baseY,
    getLine: (row: number) => rows[row] && ({
      isWrapped: !!rows[row].wrapped,
      getCell: (col: number) => {
        const cell = rows[row].cells[col];
        if (cell === undefined) return undefined;
        return {
          getChars: () => typeof cell === 'string' ? cell : cell.chars,
          getWidth: () => typeof cell === 'string' ? 1 : cell.width,
        };
      },
    }),
  } as unknown as LineBuffer;
}

describe('current command selection coordinates', () => {
  it('locates an editing cursor across wraps from the rendered suffix, leaving right-margin wrap alone', () => {
    const b = buffer([{ cells: ['$',' ','a','b'] }, { cells: ['c','d'], wrapped: true }], 2, 1);
    expect(commandCursorPosition(b, 4, 'abcd', 0)).toEqual({ column: 2, row: 0 });
    expect(commandCursorPosition(b, 4, 'abcd', 2)).toEqual({ column: 0, row: 1 });
    expect(commandCursorPosition(b, 4, 'abcd', 4)).toBeNull();
  });
  it('excludes the prompt and previous output, including at the right margin', () => {
    const b = buffer([{ cells: Array.from('old output') }, { cells: Array.from('pc:~$ ping') }], 10, 1);
    expect(currentCommandRange(b, 10, 'ping')).toEqual({ column: 6, row: 1, length: 4 });
    expect(inputStartRow(b)).toBe(1);
  });

  it('uses cells rather than code units for wide and combining Unicode', () => {
    const cells: Cell[] = ['$',' ', 'e\u0301', { chars: '東', width: 2 }, { chars: '', width: 0 },
      { chars: '🌐', width: 2 }, { chars: '', width: 0 }];
    expect(currentCommandRange(buffer([{ cells }], 7, 0), 10, 'e\u0301東🌐'))
      .toEqual({ column: 2, row: 0, length: 5 });
  });

  it('includes visual wraps and padding before a wide glyph', () => {
    const b = buffer([
      { cells: ['$',' ','a',''] },
      { cells: [{ chars: '東', width: 2 }, { chars: '', width: 0 }, 'b','c'], wrapped: true },
      { cells: ['d'], wrapped: true },
    ], 1, 2);
    expect(currentCommandRange(b, 4, 'a東bcd')).toEqual({ column: 2, row: 0, length: 7 });
    expect(inputStartRow(b)).toBe(0);
  });

  it('uses absolute buffer rows after scrolling', () => {
    const b = buffer([
      { cells: Array.from('past') }, { cells: Array.from('past') },
      { cells: ['$',' ','a','b'] }, { cells: ['c','d'], wrapped: true },
    ], 2, 1, 2);
    expect(currentCommandRange(b, 4, 'abcd')).toEqual({ column: 2, row: 2, length: 4 });
    expect(inputStartRow(b)).toBe(2);
  });

  it('does not select history when there is no editable command or cells do not match', () => {
    const b = buffer([{ cells: Array.from('$ old') }], 5, 0);
    expect(currentCommandRange(b, 10, '')).toBeNull();
    expect(currentCommandRange(b, 10, 'new')).toBeNull();
    expect(currentCommandRange(b, 10, 'too long old')).toBeNull();
    expect(currentCommandRange(b, 0, 'old')).toBeNull();
  });
});
