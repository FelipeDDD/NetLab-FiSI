import { useEffect, useRef } from 'react';
import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import type { PrintDocumentOptions } from './options';
import { positionStudioDevices, studioConnectionMarkup, type studioLayout } from './diagram';
import { clampDeviceCenter, pointerInDocument } from './devicePositions';
import type { Point } from './geometry';
import { alignDeviceCenter, type AlignmentGuide } from './alignmentGuides';
import { drawDistanceGuides, type DistanceGuide } from './drawDistanceGuides';
import { moveStudioDiagram } from './diagramMovement';

type Layout = ReturnType<typeof studioLayout>;
export function highlightStudioDevice(doc: Document, id: string | null) {
  for (const group of doc.querySelectorAll<SVGGElement>('[data-device]')) {
    const selected = group.dataset.device === id, rect = group.querySelector('rect');
    group.toggleAttribute('data-selected-device', selected);
    rect?.setAttribute('stroke', selected ? '#256080' : '#94a3b8');
    rect?.setAttribute('stroke-width', selected ? '2' : '1.2');
  }
}

/** Only the active SVG card and connection layers change during pointer moves.
 * The automatic reference is reused; commit a document center once on release. */
export function useStudioDeviceDrag(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, layout: Layout, selectedId: string | null,
  select: (id: string | null) => void, commit: (id: string, position: Point) => void, activity: (moving: boolean) => void, alignmentGuides = true,
  diagramMove?: { enabled: boolean; commit: (result: ReturnType<typeof moveStudioDiagram>) => void }) {
  const cleanup = useRef<() => void>(() => {}), cancelActive = useRef<() => boolean>(() => false), escapedAt = useRef(0), selected = useRef(selectedId);
  selected.current = selectedId;
  const guidesEnabled = useRef(alignmentGuides); guidesEnabled.current = alignmentGuides;
  useEffect(() => () => cleanup.current(), []);
  const bind = (doc: Document) => {
    cleanup.current();
    const svg = doc.querySelector<SVGSVGElement>('[data-print-section=diagram] svg'), topology = svg?.querySelector<SVGGElement>('[data-topology]');
    if (!svg || !topology) return;
    const cardGroups = new Map([...topology.querySelectorAll<SVGGElement>('[data-device]')].map(group => [group.dataset.device!, group]));
    highlightStudioDevice(doc, selected.current);
    topology.style.cursor = diagramMove?.enabled ? 'move' : '';
    for (const card of topology.querySelectorAll<SVGElement>('[data-device]')) card.style.cursor = diagramMove?.enabled ? 'move' : 'grab';
    type Drag = { id: string; pointerId: number; group: SVGGElement; index: number; start: Point; original: Point; position: Point; selection: string; guides: AlignmentGuide[]; distances: DistanceGuide[]; snapped: Partial<Point>; whole: boolean; };
    let active: Drag | null = null, animation: number | undefined;
    const frameWindow = doc.defaultView!;
    const guideLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    guideLayer.dataset.studioDeviceGuides = ''; guideLayer.setAttribute('pointer-events', 'none'); guideLayer.setAttribute('aria-hidden', 'true'); svg.appendChild(guideLayer);
    const visualScale = () => {
      const iframe = frameWindow.frameElement as HTMLIFrameElement | null;
      return Math.max(.001, Math.abs(svg.getScreenCTM()?.a ?? 1) * (iframe ? iframe.getBoundingClientRect().width / iframe.offsetWidth : 1));
    };
    const drawGuides = (guides: AlignmentGuide[], distances: DistanceGuide[]) => {
      guideLayer.replaceChildren(); const k = visualScale();
      for (const guide of guides) {
        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line'), vertical = guide.axis === 'x';
        line.dataset.alignmentAxis = guide.axis; line.dataset.alignmentEdge = guide.edge;
        for (const [attribute, value] of Object.entries({ x1: vertical ? guide.value : guide.from, y1: vertical ? guide.from : guide.value, x2: vertical ? guide.value : guide.to, y2: vertical ? guide.to : guide.value })) line.setAttribute(attribute, String(value));
        line.setAttribute('stroke', '#0891b2'); line.setAttribute('stroke-width', String(1 / k)); line.setAttribute('stroke-dasharray', `${4 / k} ${3 / k}`); guideLayer.appendChild(line);
      }
      drawDistanceGuides(guideLayer, distances, layout.page.area, k);
    };
    const updateConnections = (scene: Layout) => {
      const markup = studioConnectionMarkup(scene, options), parser = new DOMParser();
      for (const node of topology.querySelectorAll('[data-link],[data-cable-label]')) node.remove();
      const firstCard = topology.querySelector('[data-device]');
      const parse = (source: string) => parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${source}</svg>`, 'image/svg+xml').documentElement.children;
      for (const node of [...parse(markup.cables)]) topology.insertBefore(doc.importNode(node, true), firstCard);
      for (const node of [...parse(markup.labels)]) topology.appendChild(doc.importNode(node, true));
    };
    const draw = (drag: Drag, scene: Layout) => {
      const indices = drag.whole ? layout.boxes.map((_, i) => i) : [drag.index];
      for (const index of indices) {
        const before = layout.boxes[index], after = scene.boxes[index], rect = scene.documentCards[index];
        const group = cardGroups.get(before.device.id)!;
        group.setAttribute('transform', `translate(${after.x - before.x} ${after.y - before.y})`);
        group.dataset.x = String(rect.x); group.dataset.y = String(rect.y);
      }
      if (drag.whole) for (const [i, group] of [...topology.querySelectorAll<SVGGElement>('[data-studio-area]')].entries()) {
        const before = layout.areas[i].title, after = scene.areas[i].title;
        group.setAttribute('transform', `translate(${after.x - before.x} ${after.y - before.y})`);
      }
      updateConnections(scene);
      drawGuides(drag.guides, drag.distances);
      if (!drag.whole) drag.group.querySelector('rect')?.setAttribute('stroke', scene.manualOverlap || scene.manualCableWarning ? '#a16207' : '#256080');
    };
    const movedLayout = (drag: Drag) => {
      const moved = drag.whole ? moveStudioDiagram(layout, options, drag.position) : null;
      return positionStudioDevices(layout.automatic, snapshot, moved ? { ...options, devicePositions: moved.positions, areaOffset: moved.areaOffset } : { ...options, devicePositions: { ...options.devicePositions, [drag.id]: drag.position } }, language);
    };
    const finish = (cancel = false) => {
      const drag = active; if (!drag) return;
      if (animation !== undefined) { frameWindow.cancelAnimationFrame(animation); animation = undefined; }
      draw(drag, cancel ? layout : movedLayout(drag)); active = null;
      guideLayer.replaceChildren();
      drag.group.removeAttribute('data-device-dragging'); doc.documentElement.style.userSelect = drag.selection;
      drag.group.removeAttribute('data-diagram-dragging');
      if (drag.group.hasPointerCapture(drag.pointerId)) drag.group.releasePointerCapture(drag.pointerId);
      highlightStudioDevice(doc, selected.current); activity(false);
      if (!cancel && Math.hypot(drag.position.x - drag.original.x, drag.position.y - drag.original.y) > .1) {
        if (drag.whole) diagramMove?.commit(moveStudioDiagram(layout, options, drag.position)); else commit(drag.id, drag.position);
      }
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || active || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (!target?.closest || target.closest('button,input,select,textarea,a,[data-no-drag]')) return;
      const card = target.closest<SVGGElement>('[data-device]');
      if (!card) {
        if (!target.closest('[data-document-block],[data-studio-block-ui]')) { selected.current = null; select(null); highlightStudioDevice(doc, null); }
        return;
      }
      const whole = !!diagramMove?.enabled, group = whole ? topology : card, p = pointerInDocument(svg, { x: event.clientX, y: event.clientY });
      const index = whole ? 0 : layout.boxes.findIndex(b => b.device.id === group?.dataset.device); if (!group || !p || index < 0 || !layout.boxes.length) return;
      event.preventDefault(); event.stopPropagation();
      const rect = layout.documentCards[index], original = whole ? { x: 0, y: 0 } : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      active = { id: layout.boxes[index].device.id, pointerId: event.pointerId, group, index, start: p, original, position: original, selection: doc.documentElement.style.userSelect, guides: [], distances: [], snapped: {}, whole };
      if (!whole) { selected.current = active.id; select(active.id); highlightStudioDevice(doc, active.id); } activity(true);
      group.setAttribute(whole ? 'data-diagram-dragging' : 'data-device-dragging', 'true'); doc.documentElement.style.userSelect = 'none'; group.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointerId) return;
      const p = pointerInDocument(svg, { x: event.clientX, y: event.clientY }); if (!p) return; event.preventDefault();
      if (active.whole) {
        active.position = moveStudioDiagram(layout, options, { x: p.x - active.start.x, y: p.y - active.start.y }).delta;
        if (animation === undefined) animation = frameWindow.requestAnimationFrame(() => { animation = undefined; if (active) draw(active, movedLayout(active)); });
        return;
      }
      active.position = clampDeviceCenter({ x: active.original.x + p.x - active.start.x, y: active.original.y + p.y - active.start.y }, layout.documentCards[active.index], layout.page.area);
      const aligned = guidesEnabled.current ? alignDeviceCenter(active.position, layout.documentCards[active.index], layout.documentCards.filter((_, i) => i !== active!.index), layout.page.area, 6 / visualScale(), layout.blocks, active.snapped) : { position: active.position, guides: [], distances: [], snapped: {} };
      active.position = aligned.position; active.guides = aligned.guides; active.distances = aligned.distances; active.snapped = aligned.snapped;
      if (animation === undefined) animation = frameWindow.requestAnimationFrame(() => { animation = undefined; if (active) draw(active, movedLayout(active)); });
    };
    const up = (event: PointerEvent) => { if (event.pointerId === active?.pointerId) finish(); };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== active?.pointerId) return;
      if (event.type === 'lostpointercapture' && event.buttons === 1 && active.group.isConnected) {
        try { active.group.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
      }
      escapedAt.current = Date.now(); finish(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !active && Date.now() - escapedAt.current >= 250) return;
      event.preventDefault();
      if (active) { escapedAt.current = Date.now(); finish(true); }
    };
    const wheel = (event: WheelEvent) => { if (active) event.preventDefault(); };
    const beforePrint = () => { finish(true); highlightStudioDevice(doc, null); }, afterPrint = () => highlightStudioDevice(doc, selected.current);
    cancelActive.current = () => { if (!active) return false; escapedAt.current = Date.now(); finish(true); return true; };
    doc.addEventListener('pointerdown', down); doc.addEventListener('pointermove', move, { passive: false });
    doc.addEventListener('pointerup', up); doc.addEventListener('pointercancel', cancel); doc.addEventListener('lostpointercapture', cancel);
    doc.addEventListener('keydown', key); doc.addEventListener('wheel', wheel, { passive: false });
    frameWindow.addEventListener('beforeprint', beforePrint); frameWindow.addEventListener('afterprint', afterPrint);
    cleanup.current = () => {
      cancelActive.current = () => false; finish(true);
      guideLayer.remove();
      doc.removeEventListener('pointerdown', down); doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up);
      doc.removeEventListener('pointercancel', cancel); doc.removeEventListener('lostpointercapture', cancel); doc.removeEventListener('keydown', key); doc.removeEventListener('wheel', wheel);
      frameWindow.removeEventListener('beforeprint', beforePrint); frameWindow.removeEventListener('afterprint', afterPrint);
    };
  };
  return { bind, cancelEscape: () => Date.now() - escapedAt.current < 250 || cancelActive.current() };
}
