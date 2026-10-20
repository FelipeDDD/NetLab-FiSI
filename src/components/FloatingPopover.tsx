import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { floatingPosition } from './floatingPosition';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';

export function FloatingPopover({ anchor, children, onClose, id, label, role = 'dialog', width = 300, initialFocus = 'first', preferredSide = 'auto', className = '' }: {
  anchor: RefObject<HTMLElement>;
  children: ReactNode;
  onClose: () => void;
  id: string;
  label: string;
  role?: 'menu' | 'dialog';
  width?: number;
  initialFocus?: 'first' | 'last';
  preferredSide?: 'auto' | 'above';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const focused = useRef(false);
  close.current = onClose;
  const [position, setPosition] = useState<ReturnType<typeof floatingPosition> | null>(null);

  useLayoutEffect(() => {
    const popup = ref.current;
    const trigger = anchor.current;
    if (!popup || !trigger) return;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      if (rect.right <= 0 || rect.left >= window.innerWidth || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        close.current();
        return;
      }
      // scrollHeight includes padding but not borders (or a horizontal scrollbar).
      const contentHeight = popup.scrollHeight + popup.offsetHeight - popup.clientHeight;
      const next = floatingPosition(rect, { width: window.innerWidth, height: window.innerHeight }, width, contentHeight, preferredSide);
      setPosition((previous) => previous && Object.entries(next).every(([key, value]) => previous[key as keyof typeof next] === value) ? previous : next);
    };
    update();
    const outside = (event: Event) => {
      const node = event.target as Node;
      if (!popup.contains(node) && !trigger.contains(node)) close.current();
    };
    const observer = new ResizeObserver(update);
    observer.observe(popup);
    observer.observe(trigger);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
    };
  }, [anchor, width, initialFocus, preferredSide]);

  useLayoutEffect(() => {
    if (!position || focused.current) return;
    focused.current = true;
    const items = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    ((initialFocus === 'last' ? items?.[items.length - 1] : items?.[0]) ?? ref.current)?.focus({ preventScroll: true });
  }, [position, initialFocus]);

  return createPortal(
    <div ref={ref} id={id} role={role} tabIndex={-1} aria-label={label} className={`floating-popover ${className}`}
      data-floating-popover="" style={position ?? { visibility: 'hidden', top: 0, left: 0, width }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close.current();
          anchor.current?.focus({ preventScroll: true });
          return;
        }
        const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'Tab' && (role === 'menu' || (event.shiftKey ? index === 0 : index === items.length - 1))) {
          // Let native Tab proceed from the trigger's position in document order.
          close.current();
          anchor.current?.focus({ preventScroll: true });
          return;
        }
        if (role !== 'menu' || event.altKey || event.ctrlKey || event.metaKey) return;
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length
          : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        items[next]?.focus();
      }}>
      {children}
    </div>, document.body,
  );
}
