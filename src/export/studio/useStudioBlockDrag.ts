import { useEffect, useRef } from 'react';
import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import type { PrintDocumentOptions } from './options';
import type { studioLayout } from './diagram';
import { blockConflicts, clampBlockPosition, renderRoutingBlock, resizedRoutingBlock, scaledRoutingBlock, type RoutingBlockLayout, type RoutingBlockOptions } from './routingBlocks';
import type { Point } from './geometry';
import { pointerInDocument } from './devicePositions';
import { studioText } from './messages';

/** Keep pointer capture outside the reflowed content. Commit document geometry
 * once on release, without reloading the iframe during the gesture. */
export function useStudioBlockDrag(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, layout: ReturnType<typeof studioLayout>,
  commit: (id: string, patch: Partial<RoutingBlockOptions>) => void, close: () => void, activity: (active: boolean) => void) {
  const cleanup = useRef<() => void>(() => {}), selected = useRef<string | null>(null);
  const cancelActive = useRef<() => boolean>(() => false), escapedAt = useRef(0);
  useEffect(() => () => cleanup.current(), []);
  const bind = (doc: Document) => {
    cleanup.current();
    const svg = doc.querySelector<SVGSVGElement>('[data-print-section=diagram] svg'); if (!svg) return;
    type Drag = { id: string; pointerId: number; group: SVGGElement; handle: SVGElement; start: Point; original: RoutingBlockLayout; box: RoutingBlockLayout; mode: 'move' | 'width' | 'scale'; selection: string; };
    let active: Drag | null = null, hovered: string | null = null;
    const ns = 'http://www.w3.org/2000/svg', overlay = doc.createElementNS(ns, 'g');
    overlay.dataset.studioBlockUi = ''; overlay.style.pointerEvents = 'none';
    const style = doc.createElement('style'); style.textContent = '@media print { [data-studio-block-ui] { display:none!important; } }';
    doc.head.appendChild(style); svg.appendChild(overlay);
    const boxes = new Map(layout.blocks.map(b => [b.content.block.id, b]));
    const affordances = new Map<string, { outline: SVGRectElement; widthHandle: SVGGElement; scaleHandle: SVGGElement }>();
    for (const box of layout.blocks) {
      const id = box.content.block.id, outline = doc.createElementNS(ns, 'rect');
      outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', '#256080'); outline.setAttribute('stroke-width', '2'); outline.setAttribute('rx', '4');
      const grip = (scale: boolean) => {
        const handle = doc.createElementNS(ns, 'g'), label = studioText(language, scale ? 'scaleTable' : 'resizeTable');
        handle.dataset[scale ? 'blockScale' : 'blockResize'] = id; handle.style.cursor = scale ? 'nwse-resize' : 'ew-resize'; handle.style.touchAction = 'none';
        handle.setAttribute('aria-label', label);
        const hit = doc.createElementNS(ns, 'rect'); hit.setAttribute('width', '18'); hit.setAttribute('height', '18'); hit.setAttribute('rx', '3'); hit.setAttribute('fill', '#256080');
        const mark = doc.createElementNS(ns, 'path'); mark.setAttribute('d', scale ? 'M5 13 L13 5 M9 13 L13 9' : 'M4 9H14 M7 6L4 9L7 12 M11 6L14 9L11 12'); mark.setAttribute('stroke', 'white'); mark.setAttribute('fill', 'none'); mark.setAttribute('stroke-width', '1.5'); mark.setAttribute('pointer-events', 'none');
        const title = doc.createElementNS(ns, 'title'); title.textContent = label; handle.append(hit, mark, title); return handle;
      };
      const widthHandle = grip(false), scaleHandle = grip(true);
      overlay.append(outline, widthHandle, scaleHandle); affordances.set(id, { outline, widthHandle, scaleHandle });
    }
    const decorate = () => {
      for (const [id, ui] of affordances) {
        const box = boxes.get(id)!;
        ui.outline.setAttribute('x', String(box.x)); ui.outline.setAttribute('y', String(box.y));
        ui.outline.setAttribute('width', String(box.width)); ui.outline.setAttribute('height', String(box.height));
        ui.outline.style.visibility = selected.current === id ? 'visible' : 'hidden';
        ui.outline.setAttribute('stroke', box.overlap ? '#a16207' : '#256080');
        const visible = selected.current === id || hovered === id;
        ui.widthHandle.setAttribute('transform', `translate(${box.x + box.width - 18} ${box.y + box.height / 2 - 9})`);
        ui.scaleHandle.setAttribute('transform', `translate(${box.x + box.width - 18} ${box.y + box.height - 18})`);
        for (const handle of [ui.widthHandle, ui.scaleHandle]) { handle.style.visibility = visible ? 'visible' : 'hidden'; handle.style.pointerEvents = visible ? 'all' : 'none'; }
      }
    };
    decorate();
    const point = (event: PointerEvent) => pointerInDocument(svg, { x: event.clientX, y: event.clientY });
    const paint = (drag: Drag, box: RoutingBlockLayout) => {
      box = { ...box, overlap: blockConflicts(box, [...layout.documentCards, ...layout.documentLabels, ...[...boxes.values()].filter(b => b.content.block.id !== drag.id)], layout.documentCables) };
      if (drag.mode !== 'move') {
        const node = new DOMParser().parseFromString(`<svg xmlns="${ns}">${renderRoutingBlock(box, options)}</svg>`, 'image/svg+xml').documentElement.firstElementChild!;
        drag.group.replaceChildren(...[...node.childNodes].map(n => doc.importNode(n, true)));
      }
      drag.group.setAttribute('transform', `translate(${box.x} ${box.y})`);
      for (const key of ['x', 'y', 'width', 'height'] as const) drag.group.dataset[key] = String(box[key]);
      drag.group.dataset.scale = String(box.content.scale); drag.group.dataset.baseWidth = String(box.content.baseWidth); drag.group.dataset.baseHeight = String(box.content.baseHeight); drag.group.dataset.overlap = String(box.overlap);
      boxes.set(drag.id, box); decorate();
    };
    const finish = (cancel = false) => {
      const drag = active; if (!drag) return; active = null;
      paint(drag, cancel ? drag.original : drag.box); drag.group.removeAttribute('data-dragging'); drag.group.removeAttribute('data-resizing'); drag.group.removeAttribute('data-scaling');
      doc.documentElement.style.userSelect = drag.selection;
      if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
      activity(false);
      if (!cancel) commit(drag.id, {
        position: { x: drag.box.x, y: drag.box.y },
        ...(drag.mode !== 'move' ? { customWidth: drag.box.content.baseWidth } : {}),
        ...(drag.mode === 'scale' || drag.original.content.block.scale !== undefined ? { scale: drag.box.content.scale } : {}),
      });
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || active || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (!target?.closest || target.closest('button,input,select,textarea,a,[data-no-drag]')) return;
      const resize = target.closest<SVGGElement>('[data-block-resize],[data-block-scale]'), mode = resize?.hasAttribute('data-block-scale') ? 'scale' : resize ? 'width' : 'move';
      const group = resize ? [...svg.querySelectorAll<SVGGElement>('[data-document-block]')].find(g => g.dataset.documentBlock === (resize.dataset.blockResize ?? resize.dataset.blockScale)) : target.closest<SVGGElement>('[data-document-block]');
      selected.current = group?.dataset.documentBlock ?? null; decorate();
      const handle = resize ?? target.closest<SVGElement>('[data-block-drag]'), box = boxes.get(selected.current ?? ''), p = point(event);
      if (!handle || !group || !box || !p) return;
      event.preventDefault(); event.stopPropagation();
      // The grip changes position as rows wrap; the SVG root stays fixed.
      const capture = resize ? svg : handle;
      active = { id: box.content.block.id, pointerId: event.pointerId, group, handle: capture, start: p, original: box, box, mode, selection: doc.documentElement.style.userSelect };
      doc.documentElement.style.userSelect = 'none'; group.dataset[resize ? 'resizing' : 'dragging'] = 'true';
      if (mode === 'scale') group.dataset.scaling = 'true';
      capture.setPointerCapture(event.pointerId); activity(true);
    };
    const move = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointerId) return;
      const p = point(event); if (!p) return; event.preventDefault();
      if (active.mode === 'scale') {
        const { width, height, content } = active.original;
        const ratio = 1 + ((p.x - active.start.x) * width + (p.y - active.start.y) * height) / (width * width + height * height);
        active.box = scaledRoutingBlock(options, active.original, layout.page.area, content.scale * ratio);
      }
      else if (active.mode === 'width') active.box = resizedRoutingBlock(snapshot, options, language, active.original, layout.page.area, active.original.width + p.x - active.start.x);
      else active.box = { ...active.original, ...clampBlockPosition({ x: active.original.x + p.x - active.start.x, y: active.original.y + p.y - active.start.y }, active.original, layout.page.area) };
      paint(active, active.box);
    };
    const hover = (event: PointerEvent) => {
      if (active) return;
      const target = (event.type === 'pointerout' ? event.relatedTarget : event.target) as Element | null;
      const handle = target?.closest?.<SVGGElement>('[data-block-resize],[data-block-scale]');
      hovered = target?.closest?.<SVGGElement>('[data-document-block]')?.dataset.documentBlock ?? handle?.dataset.blockResize ?? handle?.dataset.blockScale ?? null;
      decorate();
    };
    const up = (event: PointerEvent) => { if (event.pointerId === active?.pointerId) finish(); };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== active?.pointerId) return;
      // Keep a still-held pointer on the fixed capture node after a transient
      // SVG capture loss. A cancelled/released pointer always restores the block.
      if (event.type === 'lostpointercapture' && event.buttons === 1 && active.handle.isConnected) {
        try { active.handle.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
      }
      escapedAt.current = Date.now(); finish(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return; event.preventDefault();
      if (event.repeat) return;
      if (active) { escapedAt.current = Date.now(); finish(true); }
      else if (Date.now() - escapedAt.current >= 250) close();
    };
    const wheel = (event: WheelEvent) => { if (active) event.preventDefault(); };
    const beforePrint = () => { finish(true); overlay.style.display = 'none'; }, afterPrint = () => { overlay.style.display = ''; };
    cancelActive.current = () => { if (!active) return false; escapedAt.current = Date.now(); finish(true); return true; };
    doc.addEventListener('pointerdown', down); doc.addEventListener('pointermove', move, { passive: false });
    doc.addEventListener('pointerup', up); doc.addEventListener('pointercancel', cancel); doc.addEventListener('lostpointercapture', cancel); doc.addEventListener('keydown', key);
    doc.addEventListener('pointerover', hover); doc.addEventListener('pointerout', hover); doc.addEventListener('wheel', wheel, { passive: false });
    doc.defaultView!.addEventListener('beforeprint', beforePrint); doc.defaultView!.addEventListener('afterprint', afterPrint);
    cleanup.current = () => {
      cancelActive.current = () => false; finish(true); overlay.remove(); style.remove();
      doc.removeEventListener('pointerdown', down); doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', cancel); doc.removeEventListener('lostpointercapture', cancel); doc.removeEventListener('keydown', key);
      doc.removeEventListener('pointerover', hover); doc.removeEventListener('pointerout', hover); doc.removeEventListener('wheel', wheel);
      doc.defaultView?.removeEventListener('beforeprint', beforePrint); doc.defaultView?.removeEventListener('afterprint', afterPrint);
    };
  };
  return { bind, cancelEscape: () => Date.now() - escapedAt.current < 250 || cancelActive.current() };
}
