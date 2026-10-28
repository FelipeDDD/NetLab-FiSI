type HistoryKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>;
export function protectsTopologyKeys(element: Element | null): boolean {
  return !!element?.closest('.terminal-dock, .xterm, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-floating-popover]');
}
export function topologyHistoryDirection(event: HistoryKey, target: Element | null, active: Element | null): 'undo' | 'redo' | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return null;
  if (protectsTopologyKeys(target) || protectsTopologyKeys(active)) return null;
  return event.shiftKey ? 'redo' : 'undo';
}
/** Only a focused canvas receives device clipboard shortcuts; controls keep native clipboard. */
export function deviceClipboardAction(event: HistoryKey, target: Element | null, active: Element | null): 'copy' | 'paste' | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return null;
  if (protectsTopologyKeys(target) || protectsTopologyKeys(active) || target?.closest('button, [role="button"], a')) return null;
  if (!target?.closest('.react-flow') || !active?.closest('.react-flow')) return null;
  return event.key.toLowerCase()==='c' ? 'copy' : event.key.toLowerCase()==='v' ? 'paste' : null;
}
