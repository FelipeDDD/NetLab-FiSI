import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { clampInspectorWidth, inspectorKeyboardWidth, inspectorWidthBounds } from '../inspectorLayout';

// The wrapper changes only presentation: the Inspector and every draft stay mounted.
export function ResizableInspector({ hidden, onResize, onReset, children, side = 'right' }: {
  hidden: boolean; onResize: (width: number, persist: boolean) => void; onReset: () => void; children: ReactNode; side?: 'left' | 'right';
}) {
  const shell = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number; last: number; moved: boolean } | null>(null);
  const callbacks = useRef({ onResize, onReset }); callbacks.current = { onResize, onReset };
  const [resizing, setResizing] = useState(false);
  const [width, setWidth] = useState(340);
  const [viewport, setViewport] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth);
  const direction = side === 'left' ? -1 : 1;
  const finish = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null; setResizing(false);
    if (current.moved) callbacks.current.onResize(current.last, true);
  }, []);
  useLayoutEffect(() => {
    if (hidden || !shell.current) return;
    const element = shell.current;
    const update = () => setWidth(Math.round(element.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, [hidden]);
  useEffect(() => {
    const resize = () => { finish(); setViewport(window.innerWidth); };
    window.addEventListener('resize', resize); window.addEventListener('blur', finish);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('blur', finish); finish(); };
  }, [finish]);
  useEffect(() => { if (hidden) finish(); }, [hidden, finish]);
  useEffect(() => { finish(); }, [side, finish]);
  useEffect(() => {
    if (!resizing) return;
    document.body.classList.add('inspector-resizing');
    return () => document.body.classList.remove('inspector-resizing');
  }, [resizing]);
  const bounds = inspectorWidthBounds(viewport);
  return <div ref={shell} className={`inspector-shell${resizing ? ' is-resizing' : ''}`} hidden={hidden}>
    <div className="inspector-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label="Inspector-Breite ändern" aria-valuemin={bounds.min} aria-valuemax={bounds.max}
      aria-valuenow={width} aria-valuetext={`${width} Pixel`} title="Ziehen: Breite ändern · Doppelklick: 340 px · Pfeiltasten: 5 px, Shift: 20 px"
      onDoubleClick={() => { finish(); callbacks.current.onReset(); }} onBlur={finish}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        const currentWidth = shell.current?.getBoundingClientRect().width ?? width;
        const key = side === 'left' ? event.key === 'ArrowLeft' ? 'ArrowRight' : event.key === 'ArrowRight' ? 'ArrowLeft' : event.key : event.key;
        const next = inspectorKeyboardWidth(key, currentWidth, event.shiftKey, window.innerWidth);
        if (next === null) return;
        event.preventDefault(); event.stopPropagation();
        callbacks.current.onResize(clampInspectorWidth(next, window.innerWidth), true);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const currentWidth = shell.current?.getBoundingClientRect().width ?? width;
        drag.current = { pointer: event.pointerId, x: event.clientX, width: currentWidth, last: currentWidth, moved: false };
        setResizing(true);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        if (event.clientX === current.x && current.last === current.width) return;
        current.moved = true;
        current.last = clampInspectorWidth(current.width + direction * (current.x - event.clientX), window.innerWidth);
        callbacks.current.onResize(current.last, false);
      }}
      onPointerUp={event => {
        if (drag.current?.pointer !== event.pointerId) return;
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={finish} onLostPointerCapture={finish} />
    {children}
  </div>;
}
