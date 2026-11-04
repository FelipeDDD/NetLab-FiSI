import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addReference, boundReference, placeReference, referenceKey, referenceSection, type ReferenceTarget } from '../floatingReferences';
import { useTranslation } from '../i18n';
import { ReferenceOperationContent, ReferenceNotes } from './ReferenceOperationContent';
import './terminalCommandReference.css';

type PinResult = ReturnType<typeof addReference>['status'];
const ReferenceContext = createContext<{ pin(target: ReferenceTarget): PinResult; count: number } | null>(null);
export const useFloatingReferences = () => useContext(ReferenceContext);

/** Visit-only UI state: independent of terminal sessions and project persistence. */
export function FloatingReferencesProvider({ children }: { children: ReactNode }) {
  const current = useRef<readonly ReferenceTarget[]>([]);
  const [items, setItems] = useState(current.current);
  const pin = (target: ReferenceTarget) => {
    const result = addReference(current.current, target);
    if (result.status === 'added') { current.current = result.items; setItems(result.items); }
    return result.status;
  };
  const close = (key: string) => {
    current.current = current.current.filter(target => referenceKey(target) !== key);
    setItems(current.current);
  };
  return <ReferenceContext.Provider value={{ pin, count: items.length }}>{children}
    {items.length > 0 && typeof document !== 'undefined' && createPortal(items.map(target => <FloatingReference key={referenceKey(target)} target={target}
      onClose={() => close(referenceKey(target))} />), document.body)}
  </ReferenceContext.Provider>;
}

function FloatingReference({ target, onClose }: { target: ReferenceTarget; onClose(): void }) {
  const { t } = useTranslation();
  const panel = useRef<HTMLElement>(null), header = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 8, y: 8 });
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number }>();
  const section = referenceSection(target)!;
  const key = referenceKey(target), titleId = 'floating-reference-' + key;
  const constrain = (point: { x: number; y: number }) => boundReference(point,
    { width: window.innerWidth, height: window.innerHeight }, panel.current!.getBoundingClientRect());
  useLayoutEffect(() => {
    const element = panel.current!;
    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    };
    const canvas = document.querySelector('.canvas');
    const obstacles = [...document.querySelectorAll('.inspector-shell, .exercise-panel, .terminal-dock, .palette, .app-header, .floating-reference')]
      .filter(node => node !== element && node.getClientRects().length > 0).map(rect);
    setPosition(placeReference({ width: innerWidth, height: innerHeight }, element.getBoundingClientRect(),
      canvas ? rect(canvas) : { x: 8, y: 60, width: innerWidth - 16, height: innerHeight - 68 }, obstacles));
    const fit = () => setPosition(point => constrain(point));
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    const stop = () => { drag.current = undefined; };
    window.addEventListener('resize', fit);
    window.addEventListener('blur', stop);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('blur', stop); };
  }, []);
  useEffect(() => {
    // Pinning keeps the help dialog open. Never steal its focus from the background.
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('dialog[open]')) header.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const close = () => {
    if (panel.current?.contains(document.activeElement)) document.querySelector<HTMLElement>('.canvas')?.focus({ preventScroll: true });
    onClose();
  };
  return <section ref={panel} className="floating-reference" role="region" aria-labelledby={titleId}
    data-floating-popover="" data-reference-key={key} style={{ left: position.x, top: position.y }}
    onKeyDown={event => event.stopPropagation()}>
    <div ref={header} className="floating-reference-heading" tabIndex={0} title={t('referencePins.move')}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button')) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const active = drag.current;
        if (active?.id === event.pointerId) setPosition(constrain({ x: active.startX + event.clientX - active.x, y: active.startY + event.clientY - active.y }));
      }}
      onPointerUp={event => {
        drag.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { drag.current = undefined; }} onLostPointerCapture={() => { drag.current = undefined; }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const step = event.shiftKey ? 20 : 5;
        setPosition(point => constrain({ x: point.x + delta[0] * step, y: point.y + delta[1] * step }));
      }}>
      <h3 id={titleId} lang="de">{section.entry.title} — {section.operation.title}</h3>
      <button type="button" className="btn" title={t('referencePins.close')} aria-label={t('referencePins.close')} onClick={close}>×</button>
    </div>
    <div className="reference-content" lang="de">
      <p>{section.entry.summary}</p>
      <ReferenceOperationContent operation={section.operation} />
      <ReferenceNotes notes={section.entry.notes} />
    </div>
  </section>;
}
