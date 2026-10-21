import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FloatingPopover } from './FloatingPopover';

export function InfoTooltip({ label, title = label, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const hover = useRef(false), focus = useRef(false), pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const clear = () => { if (timer.current !== undefined) clearTimeout(timer.current); timer.current = undefined; };
  const close = () => { clear(); pinned.current = false; setOpen(false); };
  const show = () => { clear(); setOpen(true); };
  const leave = () => {
    clear();
    // Keep the tooltip readable while crossing the gap to its portal surface.
    timer.current = setTimeout(() => {
      if (!hover.current && !focus.current && !pinned.current) setOpen(false);
    }, 150);
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open]);
  return <>
    <button ref={anchor} type="button" className="diagnostic-info" aria-label={label}
      aria-expanded={open} aria-describedby={open ? id : undefined} aria-controls={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') { hover.current = true; show(); } }}
      onPointerLeave={() => { hover.current = false; leave(); }}
      onFocus={() => { focus.current = true; show(); }}
      onBlur={() => { focus.current = false; leave(); }}
      onClick={() => { if (pinned.current) close(); else { pinned.current = true; show(); } }}>ⓘ</button>
    {open && <FloatingPopover anchor={anchor} id={id} label={title} width={280}
      role="tooltip" initialFocus="none" className="diagnostic-info-popup" onClose={close}
      onPointerEnter={() => { hover.current = true; clear(); }} onPointerLeave={() => { hover.current = false; leave(); }}>
      {children}
    </FloatingPopover>}
  </>;
}
