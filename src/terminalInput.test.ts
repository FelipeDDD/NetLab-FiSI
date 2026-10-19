import { describe, expect, it } from 'vitest';
import { normalizeTerminalPaste, removeLastCodePoint } from './terminalInput';

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
