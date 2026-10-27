import { describe, expect, it } from 'vitest';
import { inputBoundary, normalizeTerminalPaste, PASTE_END, PASTE_START, removeLastCodePoint, terminalInputDecoder } from './terminalInput';

describe('safe terminal paste text', () => {
  it.each([
    ['192.168.1.10', '192.168.1.10'],
    ['ping -c 1 10.0.0.1', 'ping -c 1 10.0.0.1'],
    ['Olá — Grüße 🌐 東京 e\u0301', 'Olá — Grüße 🌐 東京 e\u0301'],
    ['hostname\nhelp\n', 'hostname help '],
    ['hostname\r\nhelp\r\n', 'hostname help '],
    ['hostname\rhelp\r', 'hostname help '],
    ['\r', ' '],
    ['\n', ' '],
    ['ip\taddr\u2028hostname\u2029help', 'ip addr hostname help'],
    ['host\x00\x03\x07\x16\x1b\x7f\x9fname', 'hostname'],
  ])('normalizes %j without executable control characters', (text, expected) => {
    expect(normalizeTerminalPaste(text)).toBe(expected);
  });

  it('deletes a complete non-BMP code point', () => {
    expect(removeLastCodePoint('Olá 🌐')).toBe('Olá ');
    expect(removeLastCodePoint('東京')).toBe('東');
    expect(removeLastCodePoint('')).toBe('');
  });
});

describe('input framing and Unicode edit boundaries', () => {
  it('keeps split escape sequences and pasted controls atomic without losing following input', () => {
    const decode = terminalInputDecoder();
    expect(decode('a\x1b[')).toEqual(['a']);
    expect(decode('D\x1b[3~\x1bOHb')).toEqual(['\x1b[D', '\x1b[3~', '\x1bOH', 'b']);
    expect(decode(PASTE_START + 'one\n\x1b[D')).toEqual([]);
    expect(decode('two' + PASTE_END + '\r')).toEqual([PASTE_START + 'one\n\x1b[Dtwo' + PASTE_END, '\r']);
    expect(decode('\x1b[1;5D')).toEqual(['\x1b[1;5D']);
    expect(decode('\x1b\x03')).toEqual(['\x1b', '\x03']);
    expect(decode('\ud800x\udc00')).toEqual(['\ufffd', 'x', '\ufffd']);
  });

  it('steps over graphemes without splitting combining accents, surrogate pairs or joined emoji', () => {
    const parts = ['a', 'e\u0301', '東', '🌐', '👩‍💻', 'z'];
    const text = parts.join('');
    let cursor = 0;
    for (const part of parts) {
      const next = inputBoundary(text, cursor, 1);
      expect(text.slice(cursor, next)).toBe(part);
      expect(inputBoundary(text, next, -1)).toBe(cursor);
      cursor = next;
    }
    expect(inputBoundary(text, 0, -1)).toBe(0);
    expect(inputBoundary(text, text.length, 1)).toBe(text.length);
    expect(terminalInputDecoder()('\ud83c')).toEqual([]);
  });
});
