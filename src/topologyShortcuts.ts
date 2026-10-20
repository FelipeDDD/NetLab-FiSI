type HistoryKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>;
export function protectsTopologyKeys(element: Element | null): boolean {
  return !!element?.closest('.terminal-dock, .xterm, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-floating-popover]');
}
export function topologyHistoryDirection(event: HistoryKey, target: Element | null, active: Element | null): 'undo' | 'redo' | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return null;
  if (protectsTopologyKeys(target) || protectsTopologyKeys(active)) return null;
  return event.shiftKey ? 'redo' : 'undo';
}
