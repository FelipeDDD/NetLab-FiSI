import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Panel, useReactFlow, useViewport, ViewportPortal } from '@xyflow/react';
import { useStore } from '../store';
import { automaticMarkingBounds, MARKING_COLORS, markingBounds, offsetsFromBounds } from '../areaMarkings';
import { containsPoint, rectangleBetween, touchesArea, validAreaRect, type AreaPoint, type AreaRect, type MarkingExtension } from '../markingGeometry';
import { FloatingPopover } from './FloatingPopover';

export interface MarkingMenuPoint { x: number; y: number; ids: string[] }
export function markingsAtPoint(point: AreaPoint, zoom: number): string[] {
  const { areaMarkings, nodes } = useStore.getState();
  return areaMarkings.filter(area => {
    const base = markingBounds(area, nodes, zoom);
    return !!base && [base, ...area.extensions ?? []].some(r => containsPoint(r, point));
  }).reverse().map(area => area.id);
}

type Gesture = { start: AreaPoint; before: MarkingExtension[]; extensionId?: string; corner?: 'nw' | 'ne' | 'sw' | 'se'; rect?: AreaRect; automaticBase?: AreaRect; freeBase?: boolean };

/** All normal backgrounds remain inert. Only this explicit, temporary editor
 * catches gestures; previews never enter the document or the undo stack. */
export function MarkingGeometryEditor({ menu, closeMenu }: { menu: MarkingMenuPoint | null; closeMenu(): void }) {
  const mode = useStore(s => s.markingGeometry), areas = useStore(s => s.areaMarkings), nodes = useStore(s => s.nodes);
  const generation = useStore(s => s.topologyGeneration), busy = useStore(s => !!s.quickPing || !!s.reconnectingCable);
  const { zoom } = useViewport(), { screenToFlowPosition } = useReactFlow();
  const anchor = useRef<HTMLSpanElement>(null), surface = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [baseSelected, setBaseSelected] = useState(false);
  const [draft, setDraft] = useState<AreaRect | null>(null), [message, setMessage] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null), staged = useRef<MarkingExtension[] | null>(null);
  const area = areas.find(a => a.id === mode?.areaId), base = area && markingBounds(area, nodes, zoom);
  const candidates = areas.filter(a => menu?.ids.includes(a.id));
  const target = candidates.find(a => a.id === choice) ?? candidates.at(-1);
  const extensions = area?.extensions ?? [], selectedExtension = extensions.find(e => e.id === selected);
  const cancel = () => { gesture.current = null; staged.current = null; setDraft(null); useStore.getState().setMarkingGeometry(null); };
  useEffect(() => { closeMenu(); setChoice(null); }, [generation]);
  useEffect(() => { gesture.current = null; staged.current = null; setDraft(null); setMessage(null); setSelected(null); setBaseSelected(false); surface.current?.focus({ preventScroll: true }); }, [mode]);
  useEffect(() => { if (mode && (!area || busy)) cancel(); }, [mode, area, busy]);
  useEffect(() => {
    if (!mode) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [mode]);
  useEffect(() => () => { useStore.setState({ markingExtensionPreview: null }); }, []);
  const world = (e: ReactPointerEvent) => screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const start = (e: ReactPointerEvent<HTMLElement | SVGElement>, extension?: MarkingExtension, corner?: Gesture['corner'], main?: AreaRect) => {
    if (e.button !== 0 || !area) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { start: world(e), before: structuredClone(extensions), extensionId: extension?.id, corner, rect: main ?? extension,
      ...(main ? { automaticBase: area.geometry === 'free' ? area.bounds : automaticMarkingBounds(area, nodes)!, freeBase: area.geometry === 'free' } : {}) };
    setBaseSelected(!!main);
    if (main) setSelected(null);
    if (extension) setSelected(extension.id);
    setMessage(null);
  };
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current; if (!g || !area) return;
    e.preventDefault(); e.stopPropagation(); const point = world(e);
    let rect = rectangleBetween(g.start, point);
    if (g.rect) {
      const dx = point.x - g.start.x, dy = point.y - g.start.y;
      if (!g.corner) rect = { ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy };
      else {
        const left = g.corner.includes('w'), top = g.corner.includes('n');
        rect = { x: left ? Math.min(g.rect.x + dx, g.rect.x + g.rect.width - 12) : g.rect.x,
          y: top ? Math.min(g.rect.y + dy, g.rect.y + g.rect.height - 12) : g.rect.y,
          width: left ? Math.max(12, g.rect.width - dx) : Math.max(12, g.rect.width + dx),
          height: top ? Math.max(12, g.rect.height - dy) : Math.max(12, g.rect.height + dy) };
      }
    }
    setDraft(rect);
    if (g.automaticBase) {
      useStore.setState({ markingExtensionPreview: { areaId: area.id, extensions,
        ...(g.freeBase ? { bounds: rect } : { baseOffsets: offsetsFromBounds(g.automaticBase, rect) }) } });
      return;
    }
    const next = g.extensionId ? g.before.map(r => r.id === g.extensionId ? { ...r, ...rect } : r)
      : [...g.before, { ...rect, id: 'extension-preview' }];
    staged.current = validAreaRect(rect) ? next : null;
    useStore.setState({ markingExtensionPreview: staged.current ? { areaId: area.id, extensions: next } : null });
  };
  const finish = (e: ReactPointerEvent) => {
    const g = gesture.current; if (!g || !area) return;
    move(e); const next = staged.current, preview = useStore.getState().markingExtensionPreview, baseOffsets = preview?.baseOffsets;
    gesture.current = null; staged.current = null;
    useStore.setState({ markingExtensionPreview: null }); setDraft(null);
    if (g.freeBase && preview?.bounds) useStore.getState().setFreeMarkingBounds(area.id, preview.bounds);
    else if (g.automaticBase && baseOffsets) useStore.getState().setMarkingBaseOffsets(area.id, baseOffsets);
    else if (g.extensionId && next) useStore.getState().setMarkingExtensions(area.id, next);
    else if (next && useStore.getState().addMarkingExtension(area.id, next.at(-1)!, zoom)) cancel();
    else setMessage('Teilfläche zu klein oder ohne Verbindung. An einer vorhandenen Fläche ansetzen.');
  };
  const abortGesture = () => { gesture.current = null; staged.current = null; setDraft(null); useStore.setState({ markingExtensionPreview: null }); };
  const begin = (kind: 'draw' | 'edit') => { if (target) { useStore.getState().setMarkingGeometry(target.id, kind); closeMenu(); } };
  return <>
    {menu && target && !busy && <>
      {createPortal(<span ref={anchor} aria-hidden="true" className="marking-menu-anchor" style={{ left: menu.x, top: menu.y }} />, document.body)}
      <FloatingPopover anchor={anchor} id="marking-context-menu" label="Bereich" width={250} onClose={closeMenu}>
        <div className="marking-context-content">
          {candidates.length > 1 ? <label>Überlappende Bereiche<select aria-label="Bereich am Klickpunkt" value={target.id} onChange={e => setChoice(e.target.value)}>
            {candidates.map(a => <option key={a.id} value={a.id}>{a.name || 'Unbenannter Bereich'} · {MARKING_COLORS[a.color].label}</option>)}
          </select></label> : <strong><span className="marking-sample" style={{ background: MARKING_COLORS[target.color].value }} />{target.name || 'Unbenannter Bereich'}</strong>}
          <button type="button" className="btn" onClick={() => begin('draw')}>Teilfläche hinzufügen</button>
          <button type="button" className="btn" onClick={() => { useStore.getState().selectMarking(target.id); closeMenu(); }}>Bereich bearbeiten</button>
          <button type="button" className="btn" onClick={() => begin('edit')}>Teilflächen bearbeiten</button>
        </div>
      </FloatingPopover>
    </>}
    {mode && area && <>
      {mode.mode === 'draw' && <div ref={surface} tabIndex={-1} className="marking-draw-surface nodrag nopan" aria-label="Teilfläche zeichnen"
        onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={abortGesture} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} />}
      <Panel position="top-center" className="marking-geometry-status nodrag nopan nowheel">
        <span>{area.name || 'Bereich'} · {mode.mode === 'draw' ? 'Rechteck ziehen' : 'Hauptfläche / Teilfläche wählen · Ecken ziehen'}</span>
        {mode.mode === 'edit' && <button type="button" className="mini-btn" disabled={!selectedExtension} onClick={() => { useStore.getState().setMarkingExtensions(area.id, extensions.filter(r => r.id !== selected)); setSelected(null); }}>Teilfläche entfernen</button>}
        <button type="button" className="mini-btn" onClick={cancel}>Fertig (Esc)</button>
        {message && <small role="status">{message}</small>}
      </Panel>
      <ViewportPortal><svg className="marking-geometry-controls">
        {mode.mode === 'edit' && base && (() => {
          const r = draft && gesture.current?.automaticBase ? draft : base;
          const selectBase = () => { setBaseSelected(true); setSelected(null); };
          return <g data-base-area={area.id} data-extension-selected={baseSelected || undefined}>
            <rect {...r} rx="3" className="marking-extension-control marking-base-control nodrag nopan" tabIndex={0}
              role="button" aria-label="Hauptfläche auswählen"
              onPointerDown={e => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); selectBase(); } }}
              onFocus={selectBase} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectBase(); } }} />
            {baseSelected && (['nw', 'ne', 'sw', 'se'] as const).map(corner => <rect key={corner}
              x={r.x + (corner.includes('e') ? r.width : 0) - 4 / zoom} y={r.y + (corner.includes('s') ? r.height : 0) - 4 / zoom}
              width={8 / zoom} height={8 / zoom} className={`marking-resize-handle nodrag nopan ${corner}`} data-base-corner={corner}
              tabIndex={0} role="button" aria-label={`Hauptfläche ${corner} vergrößern / verkleinern`}
              onPointerDown={e => start(e, undefined, corner, base)} onPointerMove={move} onPointerUp={finish} onPointerCancel={abortGesture}
              onKeyDown={e => {
                if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
                e.preventDefault(); e.stopPropagation(); const step = (e.shiftKey ? 10 : 1) / zoom;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                const left = corner.includes('w'), top = corner.includes('n');
                const adjusted = { x: left ? Math.min(base.x + dx, base.x + base.width - 12) : base.x,
                  y: top ? Math.min(base.y + dy, base.y + base.height - 12) : base.y,
                  width: Math.max(12, base.width + (left ? -dx : dx)), height: Math.max(12, base.height + (top ? -dy : dy)) };
                if (area.geometry === 'free') useStore.getState().setFreeMarkingBounds(area.id, adjusted);
                else useStore.getState().setMarkingBaseOffsets(area.id, offsetsFromBounds(automaticMarkingBounds(area, nodes)!, adjusted));
              }} />)}
          </g>;
        })()}
        {mode.mode === 'edit' && extensions.map(extension => {
          const r = draft && gesture.current?.extensionId === extension.id ? draft : extension;
          return <g key={extension.id} data-extension-id={extension.id} data-extension-selected={selected === extension.id || undefined}>
            <rect {...r} rx="3" className="marking-extension-control nodrag nopan" tabIndex={0} role="button" aria-label={`Teilfläche ${extensions.indexOf(extension) + 1} verschieben`}
              onPointerDown={e => start(e, extension)} onPointerMove={move} onPointerUp={finish} onPointerCancel={abortGesture}
              onFocus={() => { setSelected(extension.id); setBaseSelected(false); }} onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelected(extension.id); setBaseSelected(false); }
                if (/^Arrow/.test(e.key)) { e.preventDefault(); e.stopPropagation(); const step = (e.shiftKey ? 10 : 1) / zoom;
                  const x = extension.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
                  const y = extension.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
                  useStore.getState().setMarkingExtensions(area.id, extensions.map(r => r.id === extension.id ? { ...r, x, y } : r)); }
              }} />
            {selected === extension.id && (['nw', 'ne', 'sw', 'se'] as const).map(corner => <rect key={corner}
              x={r.x + (corner.includes('e') ? r.width : 0) - 4 / zoom} y={r.y + (corner.includes('s') ? r.height : 0) - 4 / zoom}
              width={8 / zoom} height={8 / zoom} className={`marking-resize-handle nodrag nopan ${corner}`} data-corner={corner}
              onPointerDown={e => start(e, extension, corner)} onPointerMove={move} onPointerUp={finish} onPointerCancel={abortGesture} />)}
          </g>;
        })}
        {mode.mode === 'draw' && draft && <rect {...draft} className="marking-draw-preview" data-connected={!!base && [base, ...extensions].some(r => touchesArea(draft, r))} />}
      </svg></ViewportPortal>
    </>}
  </>;
}
