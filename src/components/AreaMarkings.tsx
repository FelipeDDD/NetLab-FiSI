import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ViewportPortal, useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { DEFAULT_MARKING, MARKING_COLORS, markingBounds, type AreaMarking, type MarkingColor, type MarkingStyle } from '../areaMarkings';
import { FloatingPopover } from './FloatingPopover';
import './areaMarkings.css';
import { unionPath } from '../markingGeometry';

const deviceCount = (count: number) => `${count} ${count === 1 ? 'Gerät' : 'Geräte'}`;

export function AreaMarkingsLayer() {
  const markings = useStore(s => s.areaMarkings), nodes = useStore(s => s.nodes);
  const preview = useStore(s => s.markingPreview);
  const selectedId = useStore(s => s.selectedMarkingId);
  const geometry = useStore(s => s.markingGeometry), extensionPreview = useStore(s => s.markingExtensionPreview);
  const busy = useStore(s => !!s.reconnectingCable || !!s.quickPing);
  const { zoom } = useViewport();
  const visible = preview ? [...markings, preview] : markings;
  if (!visible.length) return null;
  return <ViewportPortal><svg className="area-markings-layer" aria-label="Bereichsmarkierungen">
    {visible.map(marking => {
      const basePreview = extensionPreview?.areaId === marking.id ? extensionPreview.baseOffsets : undefined;
      const box = markingBounds(basePreview ? { ...marking, baseOffsets: basePreview } : marking, nodes, zoom); if (!box) return null;
      const color = MARKING_COLORS[marking.color].value;
      const selected = marking.id === selectedId || marking.id === geometry?.areaId, interactive = marking !== preview && !busy && !geometry;
      const extensions = extensionPreview?.areaId === marking.id ? extensionPreview.extensions : marking.extensions;
      const shape = { fill: color, fillOpacity: marking.intensity / 100, stroke: color, strokeOpacity: selected ? 1 : .72,
        strokeWidth: selected ? 2 : 1, strokeDasharray: marking === preview ? '4 4' : undefined, vectorEffect: 'non-scaling-stroke' };
      const edit = () => useStore.getState().selectMarking(marking.id);
      return <g key={marking.id} data-area-marking={marking.id} data-marking-selected={selected || undefined} data-marking-preview={marking === preview || undefined} aria-label={marking.name || 'Unbenannter Bereich'}>
        {extensions?.length ? <path d={unionPath([box, ...extensions])} fillRule="evenodd" {...shape} /> : <rect {...box} rx="14" {...shape} />}
        {marking.name && <text x={box.x + 12} y={box.y + 21} className="area-marking-title nodrag nopan"
          role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} data-interactive={interactive || undefined}
          aria-label={interactive ? `Bereich ${marking.name} bearbeiten` : undefined}
          onPointerDown={e => { if (interactive && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); } }}
          onClick={e => { if (interactive && !e.shiftKey) { e.stopPropagation(); edit(); } }}
          onKeyDown={e => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); edit(); } }}>
          <title>{marking.name}</title>{marking.name.length > 38 ? marking.name.slice(0, 37) + '…' : marking.name}</text>}
      </g>;
    })}
  </svg></ViewportPortal>;
}

export function MarkingsButton({ onOpen }: { onOpen(): void }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null);
  const count = useStore(s => s.nodes.filter(n => n.selected).length);
  const generation = useStore(s => s.topologyGeneration);
  const geometry = useStore(s => s.markingGeometry);
  const selectedId = useStore(s => s.selectedMarkingId), onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const close = () => { setOpen(false); useStore.getState().selectMarking(null); useStore.getState().previewMarking(null); };
  useEffect(() => setOpen(false), [generation]);
  useEffect(() => { if (geometry) setOpen(false); }, [geometry]);
  // A title click selects only presentation metadata, not React Flow nodes.
  useEffect(() => { if (selectedId) { onOpenRef.current(); setOpen(true); } }, [selectedId]);
  return <>
    <button ref={anchor} type="button" className="btn btn--toolbar markings-trigger" aria-label="Markierungen"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'area-markings-popover' : undefined}
      title={count >= 2 ? `${deviceCount(count)} ausgewählt · Bereich markieren` : 'Markierungen'}
      data-can-create={count >= 2} onClick={() => { if (open) close(); else { if (geometry) useStore.getState().setMarkingGeometry(null); onOpen(); setOpen(true); } }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="3" strokeDasharray="3 2"/><path d="M6 7h8M6 11h5"/></svg>
      <span className="markings-trigger-label">Markierungen</span>
    </button>
    {open && <FloatingPopover anchor={anchor} id="area-markings-popover" label="Markierungen" width={280}
      className="area-markings-popover" onClose={close}><MarkingsEditor /></FloatingPopover>}
  </>;
}

/** A compact inline listbox: native option elements cannot reliably render
 * color samples across platforms. Keyboard behavior stays local to the picker. */
function MarkingPicker({ markings, selectedId }: { markings: AreaMarking[]; selectedId: string | null }) {
  const [expanded, setExpanded] = useState(false), [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const options = [null, ...markings], selected = markings.find(m => m.id === selectedId);
  const choose = (index: number) => { useStore.getState().selectMarking(options[index]?.id ?? null); setExpanded(false); trigger.current?.focus(); };
  const open = () => { setActive(Math.max(0, options.findIndex(m => (m?.id ?? null) === selectedId))); setExpanded(true); };
  useEffect(() => { if (expanded) list.current?.focus({ preventScroll: true }); }, [expanded]);
  useEffect(() => { if (expanded) document.getElementById(`marking-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [expanded, active]);
  const content = (marking: AreaMarking | null) => <>
    {marking && <span className="marking-sample" style={{ background: MARKING_COLORS[marking.color].value }} aria-hidden="true" />}
    <span className="marking-option-name">{marking ? marking.name.trim() || 'Unbenannter Bereich' : 'Neue Markierung'}</span>
    {marking && <span className="marking-member-count">{deviceCount(marking.deviceIds.length)}</span>}
  </>;
  return <div className="marking-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}>
    <span id="marking-picker-label">Bereich</span>
    <button type="button" ref={trigger} className="marking-picker-trigger" aria-label="Markierung auswählen"
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

function MarkingsEditor() {
  const markings = useStore(s => s.areaMarkings), selectedId = useStore(s => s.selectedMarkingId);
  const count = useStore(s => s.nodes.filter(n => n.selected).length);
  const selection = useStore(s => JSON.stringify(s.nodes.filter(n => n.selected).map(n => n.id)));
  const [draft, setDraft] = useState<MarkingStyle>({ ...DEFAULT_MARKING });
  const group = useRef<object>({});
  const marking = markings.find(m => m.id === selectedId), value = marking ?? draft;
  const selectedDevices = JSON.parse(selection) as string[];
  const addCount = marking ? selectedDevices.filter(id => !marking.deviceIds.includes(id)).length : 0;
  const removeCount = marking ? selectedDevices.filter(id => marking.deviceIds.includes(id)).length : 0;
  const removesAll = !!marking && removeCount === marking.deviceIds.length;
  useEffect(() => { group.current = {}; }, [selectedId]);
  useEffect(() => {
    useStore.getState().previewMarking(marking ? null : draft);
    return () => useStore.getState().previewMarking(null);
  }, [marking?.id, draft.name, draft.color, draft.intensity, selection]);
  const change = (patch: Partial<MarkingStyle>) => {
    const next = { name: value.name, color: value.color, intensity: value.intensity, ...patch };
    if (marking) useStore.getState().updateMarking(marking.id, next, group.current);
    else setDraft(next);
  };
  return <div className="markings-editor">
    <strong>Markierungen</strong>
    <MarkingPicker markings={markings} selectedId={marking?.id ?? null} />
    <label>Name der Fläche<input aria-label="Name der Fläche" maxLength={80} placeholder="Optional, z. B. Büro oder DMZ" value={value.name} onChange={e => change({ name: e.target.value })} /></label>
    <fieldset><legend>Farbe</legend><div className="marking-colors">
      {(Object.keys(MARKING_COLORS) as MarkingColor[]).map(color => <label key={color} title={MARKING_COLORS[color].label} style={{ '--marking-color': MARKING_COLORS[color].value } as CSSProperties}>
        <input type="radio" name="marking-color" aria-label={MARKING_COLORS[color].label} checked={value.color === color} onChange={() => change({ color })}/><span aria-hidden="true" />
      </label>)}
    </div></fieldset>
    <label className="marking-intensity">Intensität <output>{value.intensity}%</output>
      <input type="range" aria-label="Intensität der Markierung" min="5" max="50" step="1" value={value.intensity} onChange={e => change({ intensity: Number(e.target.value) })} />
    </label>
    <p className="markings-hint">{marking ? `${deviceCount(marking.deviceIds.length)} · Änderungen werden sofort übernommen.` : `${deviceCount(count)} ausgewählt. Mit Shift einen Rahmen um mindestens zwei Geräte ziehen.`}</p>
    {marking && <div className="marking-members">
      <p className="markings-hint">{deviceCount(count)} ausgewählt</p>
      <button type="button" className="btn" disabled={!addCount} onClick={() => useStore.getState().changeMarkingMembers(marking.id, 'add')}>Auswahl hinzufügen</button>
      <button type="button" className="btn" disabled={!removeCount || removesAll} aria-describedby={removesAll ? 'marking-empty-hint' : undefined}
        onClick={() => useStore.getState().changeMarkingMembers(marking.id, 'remove')}>Auswahl entfernen</button>
      {removesAll && <p id="marking-empty-hint" className="markings-hint" role="status">Mindestens ein Gerät muss im Bereich bleiben. Zum Löschen „Bereich entfernen“ verwenden.</p>}
    </div>}
    {marking && <div className="markings-actions marking-extension-actions">
      <button type="button" className="btn" onClick={() => useStore.getState().setMarkingGeometry(marking.id, 'draw')}>Teilfläche hinzufügen</button>
      <button type="button" className="btn" onClick={() => useStore.getState().setMarkingGeometry(marking.id, 'edit')}>Teilflächen bearbeiten</button>
    </div>}
    <div className="markings-actions">{marking ? <>
      <button type="button" className="btn" onClick={() => useStore.getState().selectMarking(null)}>Neu</button>
      <button type="button" className="btn btn--danger" onClick={() => useStore.getState().removeMarking(marking.id)}>Bereich entfernen</button>
    </> : <button type="button" className="btn btn--primary" disabled={count < 2} onClick={() => useStore.getState().createMarking(draft)}>Bereich markieren</button>}</div>
  </div>;
}
