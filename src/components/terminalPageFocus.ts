/** Temporary page-focus policy; never touches terminal sessions or command input. */
export function attachTerminalPageFocus(dock: HTMLElement, release: () => void, focusEditor: () => void) {
  const doc = dock.ownerDocument, win = doc.defaultView;
  if (!win) return () => {};
  const terminalFocused = () => !!doc.activeElement && dock.contains(doc.activeElement) &&
    !!doc.activeElement.closest('.xterm');
  let lastTerminal = terminalFocused(), away = false, pending = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const leave = () => {
    if (away) return; // blur and hidden describe the same departure.
    pending = terminalFocused() || lastTerminal;
    away = true;
  };
  const resume = () => {
    clearTimeout(timer);
    // Let native focus restoration finish before moving it out of xterm.
    timer = setTimeout(() => {
      if (disposed || doc.hidden || !doc.hasFocus() || !away) return;
      away = false;
      const move = pending;
      pending = false;
      lastTerminal = false;
      if (!move) return;
      release();
      const active = doc.activeElement;
      // A deliberate click/focus on another control during return wins.
      if (!active || active === doc.body || active === doc.documentElement || terminalFocused()) focusEditor();
    }, 0);
  };
  const visibility = () => { if (doc.hidden) leave(); else resume(); };
  const focusIn = () => { if (!away) lastTerminal = terminalFocused(); };
  const focusOut = () => {
    // Element blur may precede window blur. Retain ownership until we know this
    // was an ordinary focus move within the still-focused page.
    queueMicrotask(() => {
      if (!disposed && !away && doc.hasFocus()) lastTerminal = terminalFocused();
    });
  };
  win.addEventListener('blur', leave);
  win.addEventListener('focus', resume);
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('focusin', focusIn);
  doc.addEventListener('focusout', focusOut);
  return () => {
    disposed = true;
    clearTimeout(timer);
    win.removeEventListener('blur', leave);
    win.removeEventListener('focus', resume);
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('focusin', focusIn);
    doc.removeEventListener('focusout', focusOut);
  };
}
