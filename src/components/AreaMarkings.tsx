import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ViewportPortal, useReactFlow, useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { DEFAULT_MARKING, DEFAULT_MARKING_TEXT_SIZE, MARKING_COLORS, markingBounds, type AreaMarking, type MarkingColor, type MarkingStyle } from '../areaMarkings';
import { FloatingPopover } from './FloatingPopover';
import './areaMarkings.css';
import { unionPath } from '../markingGeometry';
import { useTranslation } from '../i18n';
import { markingDeviceCount, MARKING_COLOR_KEYS } from './markingLabels';

export function AreaMarkingsLayer() {
  const { t } = useTranslation();
  const markings = useStore(s => s.areaMarkings), nodes = useStore(s => s.nodes);
  const preview = useStore(s => s.markingPreview);
  const selectedId = useStore(s => s.selectedMarkingId);
  const geometry = useStore(s => s.markingGeometry), extensionPreview = useStore(s => s.markingExtensionPreview);
  const generation = useStore(s => s.topologyGeneration);
  const busy = useStore(s => !!s.reconnectingCable || !!s.quickPing);
  const { zoom } = useViewport();
  const { screenToFlowPosition } = useReactFlow();
  const gesture = useRef<{ id: string; pointer: number; start: { x: number; y: number }; offset: { x: number; y: number }; moved: boolean }>();
  const suppressClick = useRef(false);
  const [dragged, setDragged] = useState<{ id: string; offset: { x: number; y: number } }>();
  useEffect(() => {
    const cancel = () => { if (gesture.current) suppressClick.current = true; gesture.current = undefined; setDragged(undefined); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true); };
  }, []);
  useEffect(() => { gesture.current = undefined; setDragged(undefined); }, [generation, busy, geometry]);
  const visible = preview ? [...markings, preview] : markings;
  if (!visible.length) return null;
  return <ViewportPortal><svg className="area-markings-layer" aria-label={t('navigation.markings')}>
    {visible.map(marking => {
      const basePreview = extensionPreview?.areaId === marking.id ? extensionPreview.baseOffsets : undefined;
      const boundsPreview = extensionPreview?.areaId === marking.id ? extensionPreview.bounds : undefined;
      const box = markingBounds(boundsPreview ? { ...marking, bounds: boundsPreview } : basePreview ? { ...marking, baseOffsets: basePreview } : marking, nodes, zoom); if (!box) return null;
      const color = MARKING_COLORS[marking.color].value;
      const selected = marking.id === selectedId || marking.id === geometry?.areaId, interactive = marking !== preview && !busy && !geometry;
      const extensions = extensionPreview?.areaId === marking.id ? extensionPreview.extensions : marking.extensions;
      const shape = { fill: color, fillOpacity: marking.intensity / 100, stroke: color, strokeOpacity: selected ? 1 : .72,
        strokeWidth: selected ? 2 : 1, strokeDasharray: marking === preview ? '4 4' : undefined, vectorEffect: 'non-scaling-stroke' };
      const edit = () => useStore.getState().selectMarking(marking.id);
      const offset = dragged?.id === marking.id ? dragged.offset : marking.textOffset ?? { x: 0, y: 0 };
      const textX = box.x + 12 + offset.x, textY = box.y + 21 + offset.y;
      const size = marking.textSize ?? DEFAULT_MARKING_TEXT_SIZE;
      return <g key={marking.id} data-area-marking={marking.id} data-marking-selected={selected || undefined} data-marking-preview={marking === preview || undefined} aria-label={marking.name || t('navigation.markingUnnamed')}>
        {extensions?.length ? <path d={unionPath([box, ...extensions])} fillRule="evenodd" {...shape} /> : <rect {...box} rx="14" {...shape} />}
        {marking.name && <text x={textX} y={textY} style={{ fontSize: size }} className="area-marking-title nodrag nopan"
          role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} data-interactive={interactive || undefined}
          aria-label={interactive ? t('navigation.markingEditNamed', { name: marking.name }) : undefined}
          onPointerDown={e => {
            if (!interactive || e.shiftKey || e.button !== 0 || !e.isPrimary) return;
            e.preventDefault(); e.stopPropagation(); suppressClick.current = false;
            gesture.current = { id: marking.id, pointer: e.pointerId, start: screenToFlowPosition({ x: e.clientX, y: e.clientY }), offset: { ...marking.textOffset ?? { x: 0, y: 0 } }, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => {
            const active = gesture.current; if (!active || active.pointer !== e.pointerId || active.id !== marking.id) return;
            e.preventDefault(); e.stopPropagation();
            const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = point.x - active.start.x, dy = point.y - active.start.y;
            if (!active.moved && Math.hypot(dx, dy) * zoom < 3) return;
            active.moved = true;
            setDragged({ id: active.id, offset: { x: active.offset.x + dx, y: active.offset.y + dy } });
          }}
          onPointerUp={e => {
            const active = gesture.current; if (!active || active.pointer !== e.pointerId || active.id !== marking.id) return;
            e.stopPropagation(); gesture.current = undefined; setDragged(undefined);
            if (active.moved) {
              const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              suppressClick.current = true;
              useStore.getState().setMarkingTextOffset(active.id, { x: active.offset.x + point.x - active.start.x, y: active.offset.y + point.y - active.start.y }, active.offset);
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { gesture.current = undefined; setDragged(undefined); }}
          onLostPointerCapture={() => { gesture.current = undefined; setDragged(undefined); }}
          onClick={e => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); return; } if (interactive && !e.shiftKey) { e.stopPropagation(); edit(); } }}
          onKeyDown={e => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); edit(); } }}>
          <title>{marking.name}</title>{marking.name.split('\n').map((line, index) => <tspan key={index} x={textX} dy={index ? `${size * 1.25}px` : 0}>{line || '\u00a0'}</tspan>)}</text>}
      </g>;
    })}
  </svg></ViewportPortal>;
}

export function MarkingsButton({ onOpen }: { onOpen(): void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null);
  const count = useStore(s => s.nodes.filter(n => n.selected).length);
  const pending = useStore(s => s.pendingMarkingRect);
  const drawing = useStore(s => s.drawingMarking);
  const generation = useStore(s => s.topologyGeneration);
  const geometry = useStore(s => s.markingGeometry);
  const selectedId = useStore(s => s.selectedMarkingId), onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const close = () => { setOpen(false); useStore.getState().selectMarking(null); useStore.getState().previewMarking(null); };
  useEffect(() => setOpen(false), [generation]);
  useEffect(() => { if (geometry || drawing) setOpen(false); }, [geometry, drawing]);
  useEffect(() => { if (pending) { onOpenRef.current(); setOpen(true); } }, [pending]);
  // A title click selects only presentation metadata, not React Flow nodes.
  useEffect(() => { if (selectedId) { onOpenRef.current(); setOpen(true); } }, [selectedId]);
  return <>
    <button ref={anchor} type="button" className="btn btn--toolbar markings-trigger" aria-label={t('navigation.markings')}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'area-markings-popover' : undefined}
      title={pending ? t('navigation.markingsPending') : count >= 2 ? t('navigation.markingsSelection', { count }) : t('navigation.markings')}
      data-can-create={!!pending || count >= 2} onClick={() => { if (open) close(); else { if (drawing) useStore.getState().setPendingMarkingRect(null); if (geometry) useStore.getState().setMarkingGeometry(null); onOpen(); setOpen(true); } }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="3" strokeDasharray="3 2"/><path d="M6 7h8M6 11h5"/></svg>
      <span className="markings-trigger-label">{t('navigation.markings')}</span>
    </button>
    {open && <FloatingPopover anchor={anchor} id="area-markings-popover" label={t('navigation.markings')} width={280}
      className="area-markings-popover" onClose={close}
      onKeyDown={e => { if (e.key === 'Escape' && useStore.getState().pendingMarkingRect) useStore.getState().setPendingMarkingRect(null); }}>
      <MarkingsEditor onCancel={() => { useStore.getState().setPendingMarkingRect(null); close(); }} /></FloatingPopover>}
  </>;
}

/** A compact inline listbox: native option elements cannot reliably render
 * color samples across platforms. Keyboard behavior stays local to the picker. */
function MarkingPicker({ markings, selectedId }: { markings: AreaMarking[]; selectedId: string | null }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false), [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const options = [null, ...markings], selected = markings.find(m => m.id === selectedId);
  const choose = (index: number) => { useStore.getState().selectMarking(options[index]?.id ?? null); setExpanded(false); trigger.current?.focus(); };
  const open = () => { setActive(Math.max(0, options.findIndex(m => (m?.id ?? null) === selectedId))); setExpanded(true); };
  useEffect(() => { if (expanded) list.current?.focus({ preventScroll: true }); }, [expanded]);
  useEffect(() => { if (expanded) document.getElementById(`marking-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [expanded, active]);
  const content = (marking: AreaMarking | null) => <>
    {marking && <span className="marking-sample" style={{ background: MARKING_COLORS[marking.color].value }} aria-hidden="true" />}
    <span className="marking-option-name">{marking ? marking.name.trim() || t('navigation.markingUnnamed') : t('navigation.markingNew')}</span>
    {marking && <span className="marking-member-count">{markingDeviceCount(marking.deviceIds.length, t)}</span>}
  </>;
  return <div className="marking-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}>
    <span id="marking-picker-label">{t('navigation.markingArea')}</span>
    <button type="button" ref={trigger} className="marking-picker-trigger" aria-label={t('navigation.markingChoose')}
      aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? 'marking-picker-list' : undefined}
      onClick={() => expanded ? setExpanded(false) : open()}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } }}>
      {content(selected ?? null)}<span aria-hidden="true">▾</span>
    </button>
    {expanded && <div ref={list} id="marking-picker-list" role="listbox" aria-labelledby="marking-picker-label" tabIndex={0}
      aria-activedescendant={`marking-option-${active}`} onKeyDown={e => {
        const next = e.key === 'ArrowDown' ? Math.min(options.length - 1, active + 1) : e.key === 'ArrowUp' ? Math.max(0, active - 1)
          : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null;
        if (next !== null) { e.preventDefault(); e.stopPropagation(); setActive(next); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(active); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setExpanded(false); trigger.current?.focus(); }
      }}>
      {options.map((marking, index) => <div key={marking?.id ?? 'new'} id={`marking-option-${index}`} role="option"
        aria-selected={(marking?.id ?? null) === selectedId} data-marking-id={marking?.id ?? ''} data-active={index === active}
        onPointerMove={() => setActive(index)} onClick={() => choose(index)}>{content(marking)}</div>)}
    </div>}
  </div>;
}

function MarkingsEditor({ onCancel }: { onCancel(): void }) {
  const { t } = useTranslation();
  const markings = useStore(s => s.areaMarkings), selectedId = useStore(s => s.selectedMarkingId);
  const count = useStore(s => s.nodes.filter(n => n.selected).length);
  const selection = useStore(s => JSON.stringify(s.nodes.filter(n => n.selected).map(n => n.id)));
  const pending = useStore(s => s.pendingMarkingRect);
  const [draft, setDraft] = useState<MarkingStyle>(() => {
    const preview = useStore.getState().markingPreview;
    return preview ? { name: preview.name, color: preview.color, intensity: preview.intensity, ...(preview.textSize !== undefined ? { textSize: preview.textSize } : {}) } : { ...DEFAULT_MARKING };
  });
  const group = useRef<object>({});
  const marking = markings.find(m => m.id === selectedId), value = marking ?? draft;
  const selectedDevices = JSON.parse(selection) as string[];
  const addCount = marking ? selectedDevices.filter(id => !marking.deviceIds.includes(id)).length : 0;
  const removeCount = marking ? selectedDevices.filter(id => marking.deviceIds.includes(id)).length : 0;
  const removesAll = !!marking && marking.geometry !== 'free' && removeCount > 0 && removeCount === marking.deviceIds.length;
  useEffect(() => { group.current = {}; }, [selectedId]);
  useEffect(() => {
    useStore.getState().previewMarking(marking ? null : draft);
    return () => useStore.getState().previewMarking(null);
  }, [marking?.id, draft.name, draft.color, draft.intensity, draft.textSize, selection, pending]);
  const change = (patch: Partial<MarkingStyle>) => {
    const next = { name: value.name, color: value.color, intensity: value.intensity, ...(value.textSize !== undefined ? { textSize: value.textSize } : {}), ...patch };
    if (marking) useStore.getState().updateMarking(marking.id, next, group.current);
    else setDraft(next);
  };
  return <div className="markings-editor">
    <strong>{t('navigation.markings')}</strong>
    {!pending && <button type="button" className="btn" onClick={() => useStore.getState().beginMarkingDrawing()}>{t('navigation.markingDrawNew')}</button>}
    {!pending && <MarkingPicker markings={markings} selectedId={marking?.id ?? null} />}
    <label>{t('navigation.markingName')}<textarea aria-label={t('navigation.markingName')} rows={2} maxLength={80} placeholder={t('navigation.markingNamePlaceholder')} value={value.name} onChange={e => change({ name: e.target.value })} /></label>
    <label className="marking-intensity">{t('navigation.markingTextSize')} <output>{value.textSize ?? DEFAULT_MARKING_TEXT_SIZE} px</output>
      <input type="range" aria-label={t('navigation.markingTextSize')} min="10" max="28" step="1" value={value.textSize ?? DEFAULT_MARKING_TEXT_SIZE} onChange={e => change({ textSize: Number(e.target.value) })} />
    </label>
    {marking && <button type="button" className="btn" disabled={!marking.textOffset} onClick={() => useStore.getState().setMarkingTextOffset(marking.id, { x: 0, y: 0 })}>{t('navigation.markingResetText')}</button>}
    <fieldset><legend>{t('navigation.markingColor')}</legend><div className="marking-colors">
      {(Object.keys(MARKING_COLORS) as MarkingColor[]).map(color => <label key={color} title={t(MARKING_COLOR_KEYS[color])} style={{ '--marking-color': MARKING_COLORS[color].value } as CSSProperties}>
        <input type="radio" name="marking-color" aria-label={t(MARKING_COLOR_KEYS[color])} checked={value.color === color} onChange={() => change({ color })}/><span aria-hidden="true" />
      </label>)}
    </div></fieldset>
    <label className="marking-intensity">{t('navigation.settingsIntensity')} <output>{value.intensity}%</output>
      <input type="range" aria-label={t('navigation.markingIntensity')} min="5" max="50" step="1" value={value.intensity} onChange={e => change({ intensity: Number(e.target.value) })} />
    </label>
    {!pending && <p className="markings-hint">{marking ? <>{markingDeviceCount(marking.deviceIds.length, t)} · {t('navigation.markingApplied')}</> : t('navigation.markingNewHint')}</p>}
    {marking && <div className="marking-members">
      <p className="markings-hint">{t(count === 1 ? 'navigation.markingSelectedOne' : 'navigation.markingSelectedMany', { count })}</p>
      <button type="button" className="btn" disabled={!addCount} onClick={() => useStore.getState().changeMarkingMembers(marking.id, 'add')}>{t('navigation.markingAddSelection')}</button>
      <button type="button" className="btn" disabled={!removeCount || removesAll} aria-describedby={removesAll ? 'marking-empty-hint' : undefined}
        onClick={() => useStore.getState().changeMarkingMembers(marking.id, 'remove')}>{t('navigation.markingRemoveSelection')}</button>
      {removesAll && <p id="marking-empty-hint" className="markings-hint" role="status">{t('navigation.markingKeepDevice')}</p>}
    </div>}
    {marking && <div className="markings-actions marking-extension-actions">
      <button type="button" className="btn" onClick={() => useStore.getState().setMarkingGeometry(marking.id, 'draw')}>{t('navigation.markingAddExtension')}</button>
      <button type="button" className="btn" onClick={() => useStore.getState().setMarkingGeometry(marking.id, 'edit')}>{t('navigation.markingEditExtensions')}</button>
    </div>}
    <div className="markings-actions">{pending ? <>
      <button type="button" className="btn btn--primary" onClick={() => useStore.getState().createFreeMarking(draft)}>{t('navigation.markingSave')}</button>
      <button type="button" className="btn" onClick={onCancel}>{t('common.cancel')}</button>
    </> : marking ? <>
      <button type="button" className="btn" onClick={() => useStore.getState().selectMarking(null)}>{t('navigation.new')}</button>
      <button type="button" className="btn btn--danger" onClick={() => useStore.getState().removeMarking(marking.id)}>{t('navigation.markingRemove')}</button>
    </> : <button type="button" className="btn btn--primary" disabled={count < 2} onClick={() => useStore.getState().createMarking(draft)}>{t('navigation.markingCreate')}</button>}</div>
  </div>;
}
