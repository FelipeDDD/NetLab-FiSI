import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { boundFloatingPanel, type PanelPoint } from './floatingPanelPosition';

/** Pointer capture and bounds only; does not write positions to application state. */
export function useFloatingPanelDrag() {
  const element = useRef<HTMLElement>(null);
  const moved = useRef(false);
  const drag = useRef<{ id: number; pointer: PanelPoint; origin: PanelPoint; target: HTMLElement }>();
  const [position, setPosition] = useState<PanelPoint>();
  const [dragging, setDragging] = useState(false);
  const geometry = () => {
    const panel = element.current!, parent = panel.offsetParent as HTMLElement;
    const rect = parent.getBoundingClientRect();
    return { width: Math.max(0, Math.min(parent.clientWidth, innerWidth - rect.left)), height: Math.max(0, Math.min(parent.clientHeight, innerHeight - rect.top)), size: { width: panel.offsetWidth, height: panel.offsetHeight } };
  };
  const bound = (point: PanelPoint) => { const area = geometry(); return boundFloatingPanel(point, area, area.size); };
  const finish = () => {
    const current = drag.current; drag.current = undefined;
    if (current?.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
    setDragging(false);
  };
  useLayoutEffect(() => {
    const panel = element.current!, parent = panel.offsetParent as HTMLElement;
    const update = () => setPosition(old => {
      const area = geometry();
      const next = boundFloatingPanel(moved.current && old ? old : { x: (area.width - area.size.width) / 2, y: area.height - area.size.height - 56 }, area, area.size);
      return old?.x === next.x && old.y === next.y ? old : next;
    });
    const observer = new ResizeObserver(update);
    observer.observe(panel); observer.observe(parent); update();
    window.addEventListener('resize', update); window.addEventListener('blur', finish);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('blur', finish); finish(); };
  }, []);
  const handle = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('button,input,select,a')) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
      // A dock/initial-layout ResizeObserver can still run between pointerdown
      // and the first move. Keep the grabbed header at its current position.
      moved.current = true;
      const panel = element.current!;
      drag.current = { id: event.pointerId, pointer: { x: event.clientX, y: event.clientY }, origin: { x: panel.offsetLeft, y: panel.offsetTop }, target: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = drag.current; if (!current || current.id !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); moved.current = true;
      setPosition(bound({ x: current.origin.x + event.clientX - current.pointer.x, y: current.origin.y + event.clientY - current.pointer.y }));
    },
    onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish,
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      const step = event.shiftKey ? 20 : 5, dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation(); moved.current = true;
      const panel = element.current!; setPosition(bound({ x: panel.offsetLeft + dx, y: panel.offsetTop + dy }));
    },
  };
  return { element, position, dragging, handle };
}
