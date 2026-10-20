import { expect, it } from 'vitest';
import { topologyHistoryDirection } from './topologyShortcuts';
const key = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, defaultPrevented: false };
const element = (protectedControl = false) => ({ closest: () => protectedControl ? {} : null }) as unknown as Element;

it('recognizes Ctrl/Cmd Undo and Shift Redo only when the event is available', () => {
  expect(topologyHistoryDirection(key, element(), element())).toBe('undo');
  expect(topologyHistoryDirection({ ...key, key: 'Z', shiftKey: true }, element(), element())).toBe('redo');
  expect(topologyHistoryDirection({ ...key, ctrlKey: false, metaKey: true }, element(), element())).toBe('undo');
  for (const override of [{ defaultPrevented: true }, { isComposing: true }, { altKey: true }, { ctrlKey: false }, { key: 'a' }]) {
    expect(topologyHistoryDirection({ ...key, ...override }, element(), element())).toBeNull();
  }
});

it('protects both the event origin and actual focused control (including portaled fields and xterm)', () => {
  expect(topologyHistoryDirection(key, element(true), element())).toBeNull();
  expect(topologyHistoryDirection(key, element(), element(true))).toBeNull();
  expect(topologyHistoryDirection(key, null, element(true))).toBeNull();
});
