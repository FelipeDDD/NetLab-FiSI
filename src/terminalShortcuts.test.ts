import { describe, expect, it } from 'vitest';
import { adjacentTerminal, terminalEscapeToEditor, terminalNavigationDirection } from './terminalShortcuts';

const event = { key: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false };

describe('terminal navigation keys', () => {
  it('recognizes plain Escape without intercepting modified/composing input', () => {
    expect(terminalEscapeToEditor({ ...event, key: 'Escape' })).toBe(true);
    for (const modifier of ['ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'isComposing']) {
      expect(terminalEscapeToEditor({ ...event, key: 'Escape', [modifier]: true })).toBe(false);
    }
    expect(terminalEscapeToEditor({ ...event, key: 'Enter' })).toBe(false);
  });
  it.each([
    [{ key: 'Tab', ctrlKey: true }, 1],
    [{ key: 'Tab', ctrlKey: true, shiftKey: true }, -1],
    [{ key: 'ArrowRight', altKey: true, shiftKey: true }, 1],
    [{ key: 'ArrowLeft', altKey: true, shiftKey: true }, -1],
  ] as const)('recognizes %j', (keys, direction) => {
    expect(terminalNavigationDirection({ ...event, ...keys })).toBe(direction);
  });

  it.each([
    { key: 'Tab' }, { key: 'Tab', shiftKey: true },
    { key: 'Tab', ctrlKey: true, altKey: true },
    { key: 'Tab', ctrlKey: true, metaKey: true },
    { key: 'Tab', ctrlKey: true, isComposing: true },
    { key: 'ArrowRight', altKey: true },
    { key: 'ArrowLeft', shiftKey: true },
    { key: 'ArrowLeft', altKey: true, shiftKey: true, ctrlKey: true },
    { key: 'ArrowUp', altKey: true, shiftKey: true },
  ])('leaves other keys and modifiers alone: %j', (keys) => {
    expect(terminalNavigationDirection({ ...event, ...keys })).toBeNull();
  });
});

describe('terminal order within a supplied scope', () => {
  it('wraps in either direction', () => {
    expect(adjacentTerminal(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(adjacentTerminal(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(adjacentTerminal(['a', 'b', 'c'], 'b', 1)).toBe('c');
    expect(adjacentTerminal(['a', 'b', 'c'], 'b', -1)).toBe('a');
  });

  it('handles empty, single and missing active sessions', () => {
    expect(adjacentTerminal([], null, 1)).toBeNull();
    expect(adjacentTerminal(['a'], 'a', -1)).toBe('a');
    expect(adjacentTerminal(['a', 'b'], null, 1)).toBe('a');
    expect(adjacentTerminal(['a', 'b'], 'missing', -1)).toBe('b');
  });

  it('uses only the supplied list, without changing its order', () => {
    const scope = Object.freeze(['b', 'd']);
    expect(adjacentTerminal(scope, 'b', 1)).toBe('d');
    expect(adjacentTerminal(scope, 'd', 1)).toBe('b');
    expect(scope).toEqual(['b', 'd']);
  });
});
