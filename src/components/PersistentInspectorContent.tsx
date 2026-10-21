import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// The portal target never changes. Only its containing DOM element moves between
// slots, preserving React state, draft validation, timers and history grouping.
export function PersistentInspectorContent({ target, children }: {
  target: RefObject<HTMLDivElement>; children: ReactNode;
}) {
  const [element] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  useBrowserLayoutEffect(() => {
    if (element && target.current && element.parentElement !== target.current) target.current.appendChild(element);
  });
  useEffect(() => () => { element?.remove(); }, [element]);
  // Static rendering has no DOM slots; still include content for accessibility
  // and regression tests. The application itself uses client-side rendering.
  return element ? createPortal(children, element) : <>{children}</>;
}
