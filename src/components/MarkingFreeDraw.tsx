import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Panel, useReactFlow, ViewportPortal } from '@xyflow/react';
import { rectangleBetween, validAreaRect, type AreaPoint, type AreaRect } from '../markingGeometry';
import { useStore } from '../store';

/** An explicit temporary tool; the normal React Flow selection never creates areas. */
export function MarkingFreeDraw() {
  const drawing = useStore(s => s.drawingMarking), pending = useStore(s => s.pendingMarkingRect);
  const busy = useStore(s => !!s.quickPing || !!s.reconnectingCable);
  const { screenToFlowPosition } = useReactFlow();
  const surface = useRef<HTMLDivElement>(null), start = useRef<AreaPoint | null>(null);
  const [draft, setDraft] = useState<AreaRect | null>(null);
  useEffect(() => { start.current = null; setDraft(null); if (drawing) surface.current?.focus({ preventScroll: true }); }, [drawing]);
  useEffect(() => { if (drawing && busy) useStore.getState().setPendingMarkingRect(null); }, [drawing, busy]);
  useEffect(() => {
    if (!drawing && !pending) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing) useStore.getState().setPendingMarkingRect(null); };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [drawing, pending]);
  if (!drawing || busy) return null;
  const world = (e: ReactPointerEvent) => screenToFlowPosition({ x: e.clientX, y: e.clientY });
  return <>
    <div ref={surface} tabIndex={-1} className="marking-draw-surface nodrag nopan" aria-label="Neue Fläche zeichnen"
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        start.current = world(e); setDraft(null);
      }}
      onPointerMove={e => { if (start.current) { e.preventDefault(); e.stopPropagation(); setDraft(rectangleBetween(start.current, world(e))); } }}
      onPointerUp={e => {
        if (!start.current || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); const rect = rectangleBetween(start.current, world(e));
        start.current = null; setDraft(null);
        if (validAreaRect(rect)) useStore.getState().setPendingMarkingRect(rect);
      }}
      onPointerCancel={() => useStore.getState().setPendingMarkingRect(null)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} />
    <Panel position="top-center" className="marking-geometry-status nodrag nopan nowheel">
      Neue Fläche zeichnen · Rechteck ziehen · Esc zum Abbrechen
      <button type="button" className="mini-btn" onClick={() => useStore.getState().setPendingMarkingRect(null)}>Abbrechen</button>
    </Panel>
    {draft && <ViewportPortal><svg className="marking-geometry-controls"><rect {...draft} className="marking-draw-preview" /></svg></ViewportPortal>}
  </>;
}
