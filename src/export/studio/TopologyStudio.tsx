import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../i18n';
import { useStore } from '../../store';
import { sim } from '../../sim';
import { svgToPngBlob } from '../diagram';
import { capturePrintSnapshot } from './model';
import { printPreset, changePrintPreset, REPORT_SECTIONS, pageSize, presentationName, type PrintDocumentOptions, type PrintPreset, type ReportSection, type DiagramOptions } from './options';
import { studioDiagram, studioAutomaticLayout, positionStudioDevices } from './diagram';
import { studioReport } from './report';
import { studioText, type StudioKey } from './messages';
import { StudioBlocksPanel } from './StudioBlocksPanel';
import { useStudioBlockDrag } from './useStudioBlockDrag';
import { highlightStudioDevice, useStudioDeviceDrag } from './useStudioDeviceDrag';
import './studio.css';
import { previewScale, type PreviewZoom } from './preview';
import { compactStudioLayout } from './compactLayout';
import type { DevicePositions } from './devicePositions';
import { activePageOptions, activePresentation, pageLayoutKey, updateActivePresentation, updatePageSession } from './pageLayouts';
import { restoreStudioPresentation } from './persistence';
import { saveStudioPresentation } from '../../studioPresentation';
import { useWorkspaceUI } from '../../workspace/WorkspaceUI';
import { flippedDevicePositions } from './verticalFlip';
import { normalizeFooterNote } from './footerText';
import { updateStudioPreview } from './updatePreview';
import { StudioSection } from './StudioSection';

const capture = () => capturePrintSnapshot(sim.net, useStore.getState());
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TopologyStudio({ onClose, origin }: { onClose(): void; origin: HTMLElement | null }) {
  const language = useLanguage(s => s.language), t = (key: StudioKey) => studioText(language, key);
  const [snapshot] = useState(capture);
  const [initial] = useState(() => {
    const restored = restoreStudioPresentation(useStore.getState().studioPresentation, snapshot, language);
    return { ...restored, generation: useStore.getState().topologyGeneration, json: JSON.stringify(saveStudioPresentation(restored.session, restored.alignmentGuides, restored.positioningTipDismissed)) };
  });
  const [session, setSession] = useState(initial.session), [recoveryWarning, setRecoveryWarning] = useState(initial.warning);
  const generation = useStore(s => s.topologyGeneration), autosaveError = useStore(s => s.autosaveError), autosaveBlocked = useStore(s => s.autosaveBlocked), autosavePending = useStore(s => s.autosavePending);
  const workspace = useWorkspaceUI(), draft = workspace?.state.drafts.find(d => d.id === workspace.state.activeDraftId);
  const options = useMemo(() => activePageOptions(session), [session]), presentation = activePresentation(session);
  const setOptions = (update: (options: PrintDocumentOptions) => PrintDocumentOptions) => setSession(s => updatePageSession(s, update, snapshot, language));
  const [zoom, setZoom] = useState<PreviewZoom>(0), [maximized, setMaximized] = useState(false), [previewReady, setPreviewReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [dense, setDense] = useState(false);
  const { compactUndo, compactNotice } = presentation;
  const setCompactUndo = (value: DevicePositions | null | ((previous: DevicePositions | null) => DevicePositions | null)) => setSession(s => updateActivePresentation(s, page => ({ ...page, compactUndo: typeof value === 'function' ? value(page.compactUndo) : value })));
  const setCompactNotice = (value: boolean) => setSession(s => updateActivePresentation(s, page => ({ ...page, compactNotice: value })));
  const [alignmentGuides, setAlignmentGuides] = useState(initial.alignmentGuides);
  const [positioningTipDismissed, setPositioningTipDismissed] = useState(initial.positioningTipDismissed), [positioningTipVisible, setPositioningTipVisible] = useState(false);
  const tipDismissed = useRef(positioningTipDismissed); tipDismissed.current = positioningTipDismissed;
  const manualPositioningUsed = () => { if (!tipDismissed.current) setPositioningTipVisible(true); };
  const savedPresentation = useMemo(() => saveStudioPresentation(session, alignmentGuides, positioningTipDismissed), [session, alignmentGuides, positioningTipDismissed]);
  const lastSaved = useRef(initial.json);
  const flipReturn = useRef<{ after: string; before: DevicePositions } | null>(null);
  const [moveDiagram, setMoveDiagram] = useState(false);
  const escapeAction = useRef<() => void>(() => {});
  const moveReturns = useRef(new Map<string, { before: Pick<PrintDocumentOptions, 'devicePositions' | 'areaOffset'>; after: string; context: string }>());
  useLayoutEffect(() => {
    if (generation !== initial.generation) return;
    const json = JSON.stringify(savedPresentation); if (json === lastSaved.current) return;
    if (useStore.getState().setStudioPresentation(savedPresentation, initial.generation)) { lastSaved.current = json; setRecoveryWarning(false); }
  }, [savedPresentation, generation, initial]);
  useEffect(() => { if (generation !== initial.generation) onClose(); }, [generation, initial, onClose]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null), [movingDevice, setMovingDevice] = useState(false), [movingBlock, setMovingBlock] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 700, height: 900, available: 800, availableHeight: 700, sheetHeight: 900 });
  const currentPage = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null), frame = useRef<HTMLIFrameElement>(null), stage = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  // Manual centers and table edits do not invalidate automatic separation/fit.
  const automatic = useMemo(() => studioAutomaticLayout(snapshot, options, language), [snapshot, language, options.diagram, options.names, options.textSize, options.paper, options.orientation, options.margin, options.diagramScale, options.preset, options.title, options.subtitle, options.annotation, options.footerNote]);
  const layout = useMemo(() => positionStudioDevices(automatic, snapshot, options, language), [automatic, snapshot, options, language]);
  const svg = useMemo(() => studioDiagram(snapshot, options, language, layout), [snapshot, options, language, layout]);
  const rendered = useMemo(() => studioReport(snapshot, options, language, svg), [snapshot, options, language, svg]);
  const initialPreview = useRef(rendered.html), appliedPreview = useRef(rendered.html);
  const oversized = layout.blocks.some(b => b.oversized) || layout.page.footerOverflow || layout.areaOutside || layout.manualOutside, overlapping = layout.blocks.some(b => b.overlap);
  const reportOversized = layout.page.footerOverflow || options.sections.diagram.enabled && oversized;
  const moveContext = JSON.stringify([layout.page.area, layout.documentCards.map((r, i) => [layout.boxes[i].device.id, r.width, r.height]), options.diagram.areas, snapshot.areas]);
  const moveReturn = moveReturns.current.get(pageLayoutKey(options));
  const canUndoMove = !!moveReturn && moveReturn.after === JSON.stringify([options.devicePositions, options.areaOffset]) && moveReturn.context === moveContext;
  const bindDeviceDrag = useStudioDeviceDrag(snapshot, options, language, layout, selectedDeviceId, setSelectedDeviceId,
    (id, position) => { setOptions(o => ({ ...o, devicePositions: { ...o.devicePositions, [id]: position } })); manualPositioningUsed(); }, setMovingDevice, alignmentGuides, {
      enabled: moveDiagram,
      commit: result => {
        moveReturns.current.set(pageLayoutKey(options), { before: { devicePositions: options.devicePositions, areaOffset: options.areaOffset }, after: JSON.stringify([result.positions, result.areaOffset]), context: moveContext });
        setOptions(o => ({ ...o, devicePositions: result.positions, areaOffset: result.areaOffset }));
        manualPositioningUsed();
      },
    });
  const bindBlockDrag = useStudioBlockDrag(snapshot, options, language, layout, (id, patch) => setOptions(o => ({ ...o, routingBlocks: o.routingBlocks.map(b => b.id === id ? { ...b, ...patch } : b) })), () => escapeAction.current(), setMovingBlock);
  escapeAction.current = () => {
    if (bindDeviceDrag.cancelEscape() || bindBlockDrag.cancelEscape()) return;
    if (moveDiagram) { setMoveDiagram(false); return; }
    if (selectedDeviceId) { setSelectedDeviceId(null); return; }
    onClose();
  };
  const toggleDiagramMove = () => { setSelectedDeviceId(null); setMoveDiagram(value => !value); };
  const selectedDevice = snapshot.devices.find(d => d.id === selectedDeviceId);
  const paper = pageSize(options), pageWidth = paper.width * 96 / 25.4 + 32;
  const scale = previewScale(zoom, pageWidth, dimensions.sheetHeight, dimensions.available, dimensions.availableHeight);
  const patch = <K extends keyof PrintDocumentOptions>(key: K, value: PrintDocumentOptions[K]) => setOptions(o => ({ ...o, [key]: value }));
  useEffect(() => {
    const el = dialog.current!; mounted.current = true; el.showModal(); heading.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; el.close(); (origin?.isConnected ? origin : document.querySelector<HTMLElement>('.toolbar-menu-trigger'))?.focus({ preventScroll: true }); };
  }, [origin]);
  useEffect(() => {
    const element = stage.current!;
    const observer = new ResizeObserver(() => setDimensions(d => ({ ...d, available: element.clientWidth, availableHeight: element.clientHeight })));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (zoom !== 'page' || !stage.current) return;
    const page = frame.current?.contentDocument?.querySelectorAll<HTMLElement>('.print-page')[currentPage.current];
    stage.current.scrollTop = Math.max(0, (page?.offsetTop ?? 16) - 16) * scale;
    stage.current.scrollLeft = 0;
  }, [zoom, scale, dimensions.height]);
  const trackPage = () => {
    const pages = [...frame.current?.contentDocument?.querySelectorAll<HTMLElement>('.print-page') ?? []];
    const top = (stage.current?.scrollTop ?? 0) / scale + 16;
    currentPage.current = pages.reduce((index, page, i) => page.offsetTop <= top + 1 ? i : index, 0);
  };
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!previewReady || !doc || appliedPreview.current === rendered.html) return;
    updateStudioPreview(doc, rendered.html); appliedPreview.current = rendered.html;
    measureFrame();
  }, [rendered.html, previewReady]);
  useEffect(() => {
    if (selectedDeviceId && (!snapshot.devices.some(d => d.id === selectedDeviceId) || !options.diagram.deviceIds.includes(selectedDeviceId))) setSelectedDeviceId(null);
    const doc = frame.current?.contentDocument; if (doc) highlightStudioDevice(doc, selectedDeviceId);
  }, [selectedDeviceId, snapshot, rendered.html, options.diagram.deviceIds]);
  const measureFrame = () => {
    const doc = frame.current?.contentDocument; if (!doc) return;
    const pages = doc.querySelectorAll<HTMLElement>('.print-page');
    currentPage.current = Math.min(currentPage.current, Math.max(0, pages.length - 1));
    setDimensions(d => ({ ...d, width: pageWidth, height: Math.max(doc.body.scrollHeight + 32, paper.height * 96 / 25.4), sheetHeight: Math.max(...[...pages].map(p => p.offsetHeight), paper.height * 96 / 25.4) + 32 })); setPreviewReady(true);
    const diagram = doc.querySelector<SVGElement>('svg[data-label-px]');
    setDense(Number(diagram?.dataset.labelPx ?? 99) < 9 || diagram?.dataset.layoutCrowded === 'true');
    bindDeviceDrag.bind(doc); bindBlockDrag.bind(doc);
  };
  useEffect(() => { const doc = frame.current?.contentDocument; if (doc) { bindDeviceDrag.bind(doc); bindBlockDrag.bind(doc); } }, [moveDiagram]);
  const reset = (preset = options.preset) => setOptions(o => ({ ...printPreset(preset, snapshot), paper: o.paper, orientation: o.orientation, routingBlocks: o.routingBlocks, diagramScale: o.diagramScale, devicePositions: o.devicePositions, compactOffsets: o.compactOffsets, areaOffset: o.areaOffset }));
  const restoreDevice = () => {
    setOptions(o => ({ ...o, devicePositions: Object.fromEntries(Object.entries(o.devicePositions).filter(([id]) => id !== selectedDeviceId)), compactOffsets: Object.fromEntries(Object.entries(o.compactOffsets).filter(([id]) => id !== selectedDeviceId)) }));
    setCompactUndo(previous => previous && Object.fromEntries(Object.entries(previous).filter(([id]) => id !== selectedDeviceId)));
  };
  const compact = () => {
    const result = compactStudioLayout(snapshot, options, language, layout);
    setCompactNotice(!result.moved.length);
    if (result.moved.length) { setCompactUndo(options.compactOffsets); patch('compactOffsets', result.positions); }
  };
  const undoCompact = () => { if (compactUndo) { patch('compactOffsets', Object.fromEntries(Object.entries(compactUndo).filter(([id]) => snapshot.devices.some(d => d.id === id)))); setCompactUndo(null); setCompactNotice(false); } };
  const flipVertically = () => {
    if (movingDevice || movingBlock || layout.areas.length || !layout.boxes.length) return;
    const signature = (value: PrintDocumentOptions) => JSON.stringify([value, snapshot, language]);
    if (flipReturn.current?.after === signature(options)) {
      const before = flipReturn.current.before; flipReturn.current = null;
      patch('devicePositions', before); return;
    }
    const positions = flippedDevicePositions(layout.documentCards.map((rect, i) => ({ ...rect, id: layout.boxes[i].device.id })), options.devicePositions);
    // Avoid floating-point drift and recover automatic/manual status exactly
    // on the second unchanged flip. Only resulting positions are persisted.
    flipReturn.current = { after: signature({ ...options, devicePositions: positions }), before: options.devicePositions };
    patch('devicePositions', positions);
  };
  const runExport = async (kind: 'svg' | 'png' | 'html') => {
    if (busy || movingDevice || movingBlock || (kind === 'html' ? reportOversized : oversized)) return; setBusy(true); setError(false);
    try {
      const blob = kind === 'png' ? await svgToPngBlob(svg, 3) : new Blob([kind === 'svg' ? svg : rendered.html], { type: kind === 'svg' ? 'image/svg+xml;charset=utf-8' : 'text/html;charset=utf-8' });
      if (mounted.current) download(`netlab-studio.${kind}`, blob);
    } catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setBusy(false); }
  };
  const print = () => {
    try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { setError(true); }
  };
  const checkbox = (key: keyof Omit<DiagramOptions, 'deviceIds'>) => <label className={`studio-check${key === 'gatewayInterfaces' ? ' studio-check--subordinate' : ''}`} key={key}><input type="checkbox" data-studio-diagram-option={key} checked={options.diagram[key]} disabled={key === 'gatewayInterfaces' && !options.diagram.gateways} onChange={e => patch('diagram', { ...options.diagram, [key]: e.target.checked })}/>{t(key)}</label>;
  const devicePicker = (ids: string[], change: (ids: string[]) => void, id: string, routingOnly = false) => {
    const devices = snapshot.devices.filter(d => !routingOnly || d.ipCapable);
    return <div className="studio-device-picker" data-picker={id}>
      <div className="studio-picker-actions"><button type="button" className="btn btn--ghost" onClick={() => change(devices.map(d => d.id))}>{t('selectAll')}</button><button type="button" className="btn btn--ghost" onClick={() => change([])}>{t('selectNone')}</button><span>{ids.length}/{devices.length}</span></div>
      {devices.map(d => <label className="studio-check" key={d.id}><input type="checkbox" data-studio-device={d.id} checked={ids.includes(d.id)} onChange={e => change(e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))}/><span>{d.name}<small>{d.kind}</small></span></label>)}
    </div>;
  };
  const sectionPatch = (section: ReportSection, value: Partial<PrintDocumentOptions['sections'][ReportSection]>) => patch('sections', { ...options.sections, [section]: { ...options.sections[section], ...value } });
  return createPortal(<dialog ref={dialog} className={`topology-studio${maximized ? ' topology-studio--maximized' : ''}`} data-floating-popover="" aria-labelledby="studio-title" lang={language}
    onCancel={event => { event.preventDefault(); escapeAction.current(); }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) escapeAction.current(); return; }
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')].filter(e => {
        if (!e.getClientRects().length) return false;
        for (let parent = e.parentElement; parent && parent !== dialog.current; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(e)) return false;
        }
        return true;
      });
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="studio-header"><div><h2 id="studio-title" ref={heading} tabIndex={-1}>{t('open')}</h2><p>{t('isolation')}</p></div><div className="studio-window-actions"><button type="button" className="btn btn--ghost" data-studio-maximize aria-pressed={maximized} onClick={() => setMaximized(v => !v)}>{t(maximized ? 'restoreWindow' : 'maximize')}</button><button type="button" className="btn" onClick={onClose} aria-label={t('close')}>×</button></div></header>
    <div className="studio-workspace"><aside className="studio-options" aria-label={t('document')}>
      <div className="studio-preset"><label>{t('preset')}<select data-studio-preset value={options.preset} onChange={e => setOptions(o => changePrintPreset(o, e.target.value as PrintPreset, snapshot))}>{(['clean', 'presentation', 'technical'] as const).map(p => <option key={p} value={p}>{t(p)}</option>)}</select></label></div>
      <StudioSection title={t('document')} id="document" initialOpen>
        <label>{t('title')}<input data-studio-title value={options.title} placeholder={t('titlePlaceholder')} maxLength={160} onChange={e => patch('title', e.target.value)}/></label>
        <label>{t('subtitle')}<input data-studio-subtitle value={options.subtitle} placeholder={t('subtitlePlaceholder')} maxLength={220} onChange={e => patch('subtitle', e.target.value)}/></label>
        <div className="studio-option-pair"><label>{t('paper')}<select data-studio-paper value={options.paper} onChange={e => patch('paper', e.target.value as 'A4' | 'A3')}><option>A4</option><option>A3</option></select></label>
          <label>{t('orientation')}<select data-studio-orientation value={options.orientation} onChange={e => patch('orientation', e.target.value as PrintDocumentOptions['orientation'])}><option value="landscape">{t('landscape')}</option><option value="portrait">{t('portrait')}</option></select></label></div>
        <div className="studio-option-pair"><label>{t('margin')}<select data-studio-margin value={options.margin} onChange={e => patch('margin', Number(e.target.value) as 10 | 15 | 20)}>{[10, 15, 20].map(n => <option key={n} value={n}>{n} mm</option>)}</select></label>
          <label>{t('textSize')}<select data-studio-text value={options.textSize} onChange={e => patch('textSize', e.target.value as PrintDocumentOptions['textSize'])}>{(['small', 'normal', 'large'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}</select></label></div>
        <div className="studio-option-pair"><label className="studio-color">{t('accent')}<input type="color" value={options.accent} onChange={e => patch('accent', e.target.value)}/></label>
        <label>{t('diagramScale')}<select data-studio-diagram-scale value={options.diagramScale} onChange={e => patch('diagramScale', Number(e.target.value))}>{[1, .9, .8, .7, .6, .5, .4, .3, .2].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label></div>
        <details className="studio-submenu" data-studio-footer-panel><summary>{t('footerNote')}</summary><label>{t('footerNote')}<textarea data-studio-footer-note rows={3} value={options.footerNote} maxLength={600} onChange={e => patch('footerNote', normalizeFooterNote(e.target.value))}/></label></details>
        <details className="studio-submenu" data-studio-layout-panel><summary>{t('layoutSettings')}</summary>
        <div className="studio-compact-actions"><button type="button" className="btn btn--ghost" data-studio-compact disabled={movingDevice || movingBlock || !options.diagram.deviceIds.length} onClick={compact}>{t('compactLayout')}</button><button type="button" className="btn btn--ghost" data-studio-undo-compact disabled={!compactUndo || movingDevice || movingBlock} onClick={undoCompact}>{t('undoCompact')}</button></div>
        {compactNotice && <p className="studio-note" role="status" data-studio-compact-notice>{t('alreadyCompact')}</p>}
        <label className="studio-check"><input type="checkbox" data-studio-alignment-guides checked={alignmentGuides} disabled={movingDevice} onChange={e => setAlignmentGuides(e.target.checked)}/>{t('alignmentGuides')}</label>
        <button type="button" className="btn btn--ghost" data-studio-flip-vertical disabled={movingDevice || movingBlock || !layout.boxes.length || !!layout.areas.length} onClick={flipVertically}>{t('flipVertically')}</button>
        </details>
      </StudioSection>
      <StudioSection title={t('visual')} id="diagram" initialOpen accent><div className="studio-toggle-grid">{(['names', 'types', 'ipv4', 'cidr', 'interfaces', 'gateways', 'gatewayInterfaces', 'cables', 'cableLabels', 'colored'] as const).map(checkbox)}</div></StudioSection>
      <StudioSection title={t('devicesAndNames')} id="devices">
        <p className="studio-note">{t('aliasNote')}</p><div className="studio-picker-actions"><button type="button" className="btn btn--ghost" onClick={() => patch('diagram', { ...options.diagram, deviceIds: snapshot.devices.map(d => d.id) })}>{t('selectAll')}</button><button type="button" className="btn btn--ghost" onClick={() => patch('diagram', { ...options.diagram, deviceIds: [] })}>{t('selectNone')}</button><span>{options.diagram.deviceIds.length}/{snapshot.devices.length}</span></div>
        <div className="studio-device-list" data-picker="diagram">{snapshot.devices.map(d => <div className="studio-device-row" key={d.id}><label className="studio-check"><input type="checkbox" data-studio-device={d.id} checked={options.diagram.deviceIds.includes(d.id)} onChange={e => patch('diagram', { ...options.diagram, deviceIds: e.target.checked ? [...options.diagram.deviceIds, d.id] : options.diagram.deviceIds.filter(id => id !== d.id) })}/><span>{d.name}<small>{d.kind}</small></span></label><input aria-label={`${t('aliases')}: ${d.name}`} data-studio-alias={d.id} placeholder={d.name} value={presentationName(options, d.id)} maxLength={100} onChange={e => patch('names', { ...options.names, [d.id]: e.target.value })}/></div>)}</div>
      </StudioSection>
      <StudioBlocksPanel snapshot={snapshot} options={options} layout={layout} language={language} onChange={blocks => setOptions(o => ({ ...o, routingBlocks: blocks, sections: blocks.length > o.routingBlocks.length ? { ...o.sections, diagram: { ...o.sections.diagram, enabled: true } } : o.sections }))}/>
      {options.preset === 'technical' && <StudioSection title={t('contents')} id="report">{REPORT_SECTIONS.map(section => <div className="studio-section-option" key={section}>
        <label className="studio-check"><input type="checkbox" data-studio-section={section} checked={options.sections[section].enabled} onChange={e => sectionPatch(section, { enabled: e.target.checked })}/>{t(section)}</label>
        {options.sections[section].enabled && section !== 'diagram' && <details><summary>{t('sectionDevices')}</summary>{devicePicker(options.sections[section].deviceIds, ids => sectionPatch(section, { deviceIds: ids }), section, section === 'routes')}</details>}
      </div>)}
        <label>{t('routeFilter')}<select value={options.routeFilter} data-studio-route-filter onChange={e => patch('routeFilter', e.target.value as PrintDocumentOptions['routeFilter'])}>{(['all', 'static', 'connected'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}</select></label>
        <label>{t('annotation')}<textarea data-studio-annotation rows={3} value={options.annotation} maxLength={1200} onChange={e => patch('annotation', e.target.value)}/></label>
      </StudioSection>}
      {recoveryWarning && <p className="studio-warning" role="status" data-studio-recovery-warning>{t('presentationRecovery')}</p>}
    </aside>
    <section className="studio-preview" aria-label={t('diagram')}>
      <div className="studio-preview-tools"><span>{options.paper} · {t(options.orientation)} · {rendered.pages} {t('pages')}</span><label>{t('zoom')}<select data-studio-zoom value={zoom} onChange={e => { trackPage(); setZoom(e.target.value === 'page' ? 'page' : Number(e.target.value)); }}><option value={0}>{t('fit')}</option><option value="page">{t('fitPage')}</option>{[.25, .5, .75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n * 100}%</option>)}</select></label>{dense && <small>{t('dense')}</small>}</div>
      {options.sections.diagram.enabled && <div className={`studio-device-tools${moveDiagram ? ' studio-device-tools--global' : ''}`}><span data-studio-position-mode={moveDiagram ? 'global' : 'individual'}>{moveDiagram ? t('moveDiagramHint') : t('individualMove')}{selectedDevice && !moveDiagram && <span data-studio-selected-device={selectedDeviceId ?? ''}> · {t('selectedDevice')}: {presentationName(options, selectedDevice.id) || selectedDevice.name}</span>}</span>
        <button type="button" className={`btn${moveDiagram ? ' btn--primary' : ' btn--ghost'}`} data-studio-move-diagram aria-pressed={moveDiagram} disabled={movingDevice || movingBlock || !layout.boxes.length} onClick={toggleDiagramMove}>{t(moveDiagram ? 'moveDiagramActive' : 'moveDiagram')}</button>
        <button type="button" className="btn btn--ghost" data-studio-undo-move disabled={movingDevice || movingBlock || !canUndoMove} onClick={() => { if (moveReturn && canUndoMove) { setOptions(o => ({ ...o, ...moveReturn.before })); moveReturns.current.delete(pageLayoutKey(options)); } }}>{t('undoMoveDiagram')}</button>
        <button type="button" className="btn btn--ghost" data-studio-restore-device disabled={movingDevice || moveDiagram || !selectedDeviceId || !Object.hasOwn({ ...options.compactOffsets, ...options.devicePositions }, selectedDeviceId)} onClick={restoreDevice}>{t('restoreBlock')}</button><button type="button" className="btn btn--ghost" data-studio-restore-devices disabled={movingDevice || !Object.keys({ ...options.compactOffsets, ...options.devicePositions }).length && !options.areaOffset?.x && !options.areaOffset?.y} onClick={() => { setOptions(o => ({ ...o, devicePositions: {}, compactOffsets: {}, areaOffset: undefined })); setCompactUndo(null); setCompactNotice(false); }}>{t('restoreDevices')}</button></div>}
      {positioningTipVisible && !positioningTipDismissed && <div className="studio-positioning-tip" data-studio-positioning-tip><span>{t('positioningTip')}</span><button type="button" className="btn btn--ghost" data-studio-dismiss-positioning-tip aria-label={t('dismissTip')} onClick={() => { setPositioningTipDismissed(true); setPositioningTipVisible(false); }}>×</button></div>}
      {layout.page.footerOverflow ? <p className="studio-preview-warning" role="status" data-studio-footer-warning>{t('footerTooLong')}</p> : options.sections.diagram.enabled && (layout.headingOverlap ? <p className="studio-preview-warning" role="status" data-studio-heading-warning>{t('headingOverlap')}</p> : layout.areaOutside ? <p className="studio-preview-warning" role="status" data-studio-area-warning>{t('areaOutside')}</p> : layout.manualOutside ? <p className="studio-preview-warning" role="status" data-studio-device-outside>{t('deviceOutside')}</p> : oversized ? <p className="studio-preview-warning" role="status" data-studio-block-warning="oversized">{t('blockOversized')}</p> : layout.manualOverlap || layout.manualCableWarning ? <p className="studio-preview-warning" role="status" data-studio-device-warning>{t('deviceOverlap')}</p> : overlapping && <p className="studio-preview-warning" role="status" data-studio-block-warning="overlap">{t('blockOverlap')}</p>)}
      <div className="studio-preview-stage" ref={stage} onScroll={trackPage}><div className="studio-preview-space" style={{ width: pageWidth * scale, height: dimensions.height * scale }}>
        <iframe title={t('document')} ref={frame} srcDoc={initialPreview.current} data-preview-html={rendered.html} sandbox="allow-same-origin allow-modals" tabIndex={-1} onLoad={measureFrame} style={{ width: pageWidth, height: dimensions.height, transform: `scale(${scale})` }}/>
      </div></div>
    </section></div>
    <footer className="studio-footer"><div className="studio-export-actions">
      {(['svg', 'png', 'html'] as const).map(kind => <button key={kind} type="button" className="btn" data-studio-export={kind} disabled={busy || movingDevice || movingBlock || (kind === 'html' ? reportOversized : oversized) || kind !== 'html' && !options.diagram.deviceIds.length && !options.routingBlocks.length} onClick={() => void runExport(kind)}>{t(kind)}</button>)}
      <button type="button" className="btn btn--primary" data-studio-print disabled={busy || movingDevice || movingBlock || reportOversized || !previewReady} onClick={print} title={t('printHint')}>{t('print')}</button>
    </div><div><button type="button" className="btn btn--ghost" onClick={() => reset()}>{t('reset')}</button><button type="button" className="btn" onClick={onClose}>{t('close')}</button></div>
      <small role="status" data-studio-storage-status>{workspace && !draft ? t('presentationNoPlan') : workspace?.state.error || draft?.error || !workspace && (autosaveError || autosaveBlocked) ? t('presentationStorageError') : draft?.pendingPersistence || draft?.saving || !workspace && autosavePending ? t('presentationSaving') : t('presentationSaved')}</small>
      {busy && <span role="status">{t('busy')}</span>}{error && <p role="alert">{t('error')}</p>}
    </footer>
  </dialog>, document.body);
}
