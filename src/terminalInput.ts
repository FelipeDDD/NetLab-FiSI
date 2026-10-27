export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';

// This shell edits one command at a time. Pasted newlines are whitespace,
// never Enter, and control bytes must not become commands or terminal escapes.
export function normalizeTerminalPaste(text: string): string {
  return text
    .replace(/\r\n|[\r\n\u2028\u2029]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

export function removeLastCodePoint(text: string): string {
  return Array.from(text).slice(0, -1).join('');
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Offsets stay in UTF-16 for slicing, but edits never split a surrogate pair,
// combining sequence or emoji cluster. Display width belongs to xterm.
export function inputBoundary(text: string, cursor: number, direction: -1 | 1): number {
  for (const { index, segment } of graphemes.segment(text)) {
    const end = index + segment.length;
    if (direction === -1 && end >= cursor) return index;
    if (direction === 1 && end > cursor) return end;
  }
  return direction === -1 ? 0 : text.length;
}

// xterm normally emits one key/paste at a time. Keep framing intact even when
// input arrives in several chunks or several keys arrive in one onData call.
export function terminalInputDecoder(): (data: string) => string[] {
  let pending = '';
  return data => {
    pending += data;
    const tokens: string[] = [];
    while (pending) {
      let token: string;
      if (pending.startsWith(PASTE_START)) {
        const end = pending.indexOf(PASTE_END, PASTE_START.length);
        if (end < 0) break;
        token = pending.slice(0, end + PASTE_END.length);
      } else if (pending[0] === '\x1b') {
        if (pending.length === 1) break;
        if (pending[1] === '[') {
          const sequence = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(pending);
          if (!sequence && /^\x1b\[[0-?]*[ -/]*$/.test(pending) && pending.length < 64) break;
          token = sequence?.[0] ?? pending.slice(0, 2);
        } else if (pending[1] === 'O') {
          if (pending.length < 3) break;
          token = pending.slice(0, 3);
        } else token = pending.charCodeAt(1) < 32 ? '\x1b' : pending.slice(0, 2);
      } else {
        const code = pending.codePointAt(0)!;
        if (code >= 0xd800 && code <= 0xdbff && pending.length === 1) break;
        token = code >= 0xd800 && code <= 0xdfff ? '\ufffd' : String.fromCodePoint(code);
      }
      tokens.push(token);
      pending = pending.slice(token.length);
    }
    return tokens;
  };
}
