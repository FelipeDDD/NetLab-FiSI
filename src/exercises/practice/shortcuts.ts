type SpaceEvent=Pick<KeyboardEvent,'code'|'repeat'|'defaultPrevented'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'|'isComposing'>;
export function practiceNextShortcut(e:SpaceEvent,checked:boolean,interactive:boolean):boolean {
  return checked&&!interactive&&e.code==='Space'&&!e.repeat&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!e.metaKey;
}
// Scope the listener to the practice region: canvas, xterm and other panels never trigger it.
export const PRACTICE_INTERACTIVE='input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="radio"],[role="slider"],[role="menu"],[role="listbox"],[role="dialog"],[aria-modal="true"],dialog,.xterm';
