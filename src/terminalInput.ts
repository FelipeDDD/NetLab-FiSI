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
