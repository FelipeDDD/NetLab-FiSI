export type TerminalDirection = -1 | 1;

/** Physical key left of 1, independent of character/dead-key layout. Focus guards stay at the caller. */
export function terminalDockShortcut(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'defaultPrevented' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'>): boolean {
  return event.code === 'Backquote' && !event.repeat && !event.defaultPrevented && !event.isComposing &&
    !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
}

export function terminalEscapeToEditor(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'>): boolean {
  return event.key === 'Escape' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && !event.isComposing;
}

export function terminalNavigationDirection(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'>): TerminalDirection | null {
  if (event.isComposing || event.metaKey) return null;
  if (event.ctrlKey && !event.altKey && event.key === 'Tab') return event.shiftKey ? -1 : 1;
  if (event.ctrlKey && !event.altKey && !event.shiftKey) {
    if (event.key === 'PageDown') return 1;
    if (event.key === 'PageUp') return -1;
  }
  if (event.altKey && event.shiftKey && !event.ctrlKey) {
    if (event.key === 'ArrowRight') return 1;
    if (event.key === 'ArrowLeft') return -1;
  }
  return null;
}

// The caller supplies the list/scope. Future panels can use their own tab list
// without coupling terminal sessions to a particular panel layout.
export function adjacentTerminal(ids: readonly string[], current: string | null, direction: TerminalDirection): string | null {
  if (!ids.length) return null;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index < 0) return direction === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(index + direction + ids.length) % ids.length];
}
