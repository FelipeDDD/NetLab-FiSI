import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode, RefObject } from 'react';
import { useStore } from '../store';
import { canMovePanelSession, MAX_TERMINAL_PANELS, type TerminalTabDestination, type TerminalPanel } from '../terminalPanels';
import { FloatingPopover } from './FloatingPopover';
import { edgeScrollSpeed, insertionAnchor, sortPreviewOffsets } from './terminalSortPreview';

interface DropTarget extends TerminalTabDestination { allowed: boolean }
interface Movement {
  dragging: string | null;
  panelDragging: string | null;
  target: DropTarget | null;
  start(event: DragEvent, id: string, panel?: boolean): void;
  end(): void;
}
const Context = createContext<Movement | null>(null);
export function useTerminalTabMovement() { return useContext(Context)!; }
const items = (elements: HTMLElement[], panel: boolean) => elements.map((el) => ({
  id: panel ? el.id : el.dataset.terminalTab!, left: el.offsetLeft, width: el.offsetWidth,
}));

export function TerminalTabMovementProvider({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; panel: boolean } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const mode = useStore((s) => s.terminalLayoutMode);
  const collapsed = useStore((s) => s.terminalDockCollapsed);
  const end = () => { pointer.current = null; setDrag(null); setTarget(null); };
  useEffect(end, [mode, collapsed]);

  const hitTest = (x: number, y: number): DropTarget | null => {
    if (!drag || !root.current) return null;
    const columns = root.current.querySelector<HTMLElement>('.terminal-panels');
    if (!columns) return null;
    const rect = columns.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const elements = [...columns.querySelectorAll<HTMLElement>('[data-terminal-pane]')];
    const geometry = items(elements, true);
    const localX = x - rect.left + columns.scrollLeft;
    if (drag.panel) return { panelId: insertionAnchor(geometry, localX, drag.id), allowed: true };
    const newPanel = root.current.querySelector('.terminal-new-panel-drop')?.getBoundingClientRect();
    if (newPanel && x >= newPanel.left && x <= newPanel.right && y >= newPanel.top && y <= newPanel.bottom) {
      return { panelId: null, allowed: canMovePanelSession(useStore.getState().terminalPanels, drag.id, { panelId: null }, mode) };
    }
    const element = elements.find((el) => localX >= el.offsetLeft && localX <= el.offsetLeft + el.offsetWidth);
    if (!element) return null;
    const strip = element.querySelector<HTMLElement>('.terminal-tabs')!;
    const bounds = strip.getBoundingClientRect();
    const beforeId = y >= bounds.top && y <= bounds.bottom
      ? insertionAnchor(items([...strip.querySelectorAll<HTMLElement>('[data-terminal-tab]')], false), x - bounds.left + strip.scrollLeft, drag.id) : null;
    const destination = { panelId: element.id, beforeId };
    return { ...destination, allowed: canMovePanelSession(useStore.getState().terminalPanels, drag.id, destination, mode) };
  };
  const updateTarget = (next: DropTarget | null) => setTarget((old) => old?.panelId === next?.panelId && old?.beforeId === next?.beforeId && old?.allowed === next?.allowed ? old : next);

  useEffect(() => {
    if (!drag) return;
    let frame: number, last = 0;
    const tick = (now: number) => {
      const p = pointer.current, columns = root.current?.querySelector<HTMLElement>('.terminal-panels');
      if (p && columns) {
        const rect = columns.getBoundingClientRect();
        if (p.y >= rect.top && p.y <= rect.bottom) {
          const scale = Math.min(2, (now - (last || now)) / 16.67);
          const speed = edgeScrollSpeed(p.x, rect.left, rect.right);
          const before = columns.scrollLeft;
          columns.scrollLeft += speed * scale;
          if (!drag.panel && before === columns.scrollLeft) {
            for (const strip of columns.querySelectorAll<HTMLElement>('.terminal-tabs')) {
              const bounds = strip.getBoundingClientRect();
              if (p.y >= bounds.top && p.y <= bounds.bottom) strip.scrollLeft += edgeScrollSpeed(p.x, bounds.left, bounds.right) * scale;
            }
          }
          updateTarget(hitTest(p.x, p.y));
        }
      }
      last = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') end(); };
    const leaveWindow = (event: globalThis.DragEvent) => { if (!event.relatedTarget) { pointer.current = null; updateTarget(null); } };
    window.addEventListener('keydown', cancel);
    window.addEventListener('dragleave', leaveWindow);
    window.addEventListener('blur', end);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', cancel); window.removeEventListener('dragleave', leaveWindow); window.removeEventListener('blur', end); };
  }, [drag, mode]);

  useLayoutEffect(() => {
    if (!drag || !target?.allowed || !root.current) return;
    const elements = drag.panel ? [...root.current.querySelectorAll<HTMLElement>('[data-terminal-pane]')]
      : [...(document.getElementById(target.panelId ?? '')?.querySelectorAll<HTMLElement>('[data-terminal-tab]') ?? [])];
    if (!elements.length) return;
    const source = [...root.current.querySelectorAll<HTMLElement>('[data-terminal-tab]')].find((el) => el.dataset.terminalTab === drag.id);
    const gap = drag.panel ? 6 : parseFloat(getComputedStyle(elements[0].parentElement!).columnGap) || 0;
    const offsets = sortPreviewOffsets(items(elements, drag.panel), drag.id, drag.panel ? target.panelId : target.beforeId ?? null, source?.offsetWidth, gap);
    for (const element of elements) {
      element.classList.add('terminal-sort-preview');
      element.style.transform = 'translateX(' + (offsets[drag.panel ? element.id : element.dataset.terminalTab!] ?? 0) + 'px)';
    }
    return () => { elements.forEach((el) => { el.classList.remove('terminal-sort-preview'); el.style.removeProperty('transform'); }); };
  }, [drag, target]);

  return <Context.Provider value={{ dragging: drag && !drag.panel ? drag.id : null, panelDragging: drag?.panel ? drag.id : null, target,
    start(event, id, panel = false) {
      event.stopPropagation();
      event.dataTransfer.setData(panel ? 'application/x-netlab-panel' : 'application/x-netlab-terminal', id);
      event.dataTransfer.effectAllowed = 'move';
      const image = panel ? event.currentTarget.closest<HTMLElement>('.terminal-panel-header') : event.currentTarget.closest<HTMLElement>('[data-terminal-tab]');
      if (image) { const rect = image.getBoundingClientRect(); event.dataTransfer.setDragImage(image, event.clientX - rect.left, event.clientY - rect.top); }
      setDrag({ id, panel }); setTarget(null);
    }, end,
  }}><div ref={root} className="terminal-movement-root"
    onDragEnter={(event) => { if (drag) event.preventDefault(); }}
    onDragOver={(event) => {
      if (!drag) return;
      event.preventDefault(); event.stopPropagation();
      pointer.current = { x: event.clientX, y: event.clientY };
      const next = hitTest(event.clientX, event.clientY);
      event.dataTransfer.dropEffect = next?.allowed ? 'move' : 'none';
      updateTarget(next);
    }} onDrop={(event) => {
      if (!drag) return;
      event.preventDefault(); event.stopPropagation();
      const next = hitTest(event.clientX, event.clientY);
      end();
      if (next?.allowed) {
        if (drag.panel) {
          useStore.getState().reorderTerminalPanel(drag.id, next.panelId);
          requestAnimationFrame(() => document.getElementById(drag.id)?.querySelector<HTMLButtonElement>('.terminal-panel-move')?.focus());
        }
        else useStore.getState().moveTerminalTab(drag.id, next);
      }
    }} onDragEnd={end}>{children}</div></Context.Provider>;
}

export function TerminalNewPanelDrop() {
  const movement = useTerminalTabMovement();
  const mode = useStore((s) => s.terminalLayoutMode);
  const panels = useStore((s) => s.terminalPanels);
  if (!movement.dragging && !movement.panelDragging) return null;
  const allowed = !!movement.dragging && canMovePanelSession(panels, movement.dragging, { panelId: null }, mode);
  return <>
    {/* Wait for the first dragover: covering the source during dragstart can
        prevent Chromium from completing its native drag initialization. */}
    {movement.target && <div className="terminal-drag-surface" aria-hidden="true" />}
    {movement.dragging && mode === 'free' && <div className={`terminal-new-panel-drop${allowed ? '' : ' is-forbidden'}${movement.target?.panelId === null ? ' is-over' : ''}`}>
      <strong>+ New panel</strong><span>{allowed ? 'Drop to separate this tab' : panels.length >= MAX_TERMINAL_PANELS ? 'Maximal 5 Panels – Tabs weiterverwenden' : 'Already a separate panel'}</span>
    </div>}
    <span role="status" aria-live="polite" className="terminal-move-status">
      {movement.target?.allowed === false ? 'This destination is not allowed.' : movement.target ? 'Drop to confirm the new position.' : 'Drag to move. Escape cancels.'}
    </span>
  </>;
}

export function TerminalPanelMoveHandle({ panel, index }: { panel: TerminalPanel; index: number }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const movement = useTerminalTabMovement();
  const panels = useStore((s) => s.terminalPanels);
  const move = (before: string | null) => {
    setMenu(false);
    useStore.getState().reorderTerminalPanel(panel.id, before);
    requestAnimationFrame(() => anchor.current?.focus());
  };
  return <>
    <button ref={anchor} className="terminal-panel-move" type="button" draggable aria-label={`Move panel ${index + 1}`}
      title="Drag to reorder panel; click or Shift+F10 for move options" aria-haspopup="menu" aria-expanded={menu}
      onDragStart={(e) => movement.start(e, panel.id, true)} onDragEnd={movement.end}
      onClick={() => setMenu(true)} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
      onKeyDown={(e) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); setMenu(true); } }}>
      <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
        {[4, 9, 14].map((y) => <g key={y}><circle cx="4" cy={y} r="1.3" /><circle cx="10" cy={y} r="1.3" /></g>)}
      </svg>
    </button>
    {menu && <FloatingPopover anchor={anchor} id={`move-${panel.id}`} label="Move panel" role="menu" width={230} className="terminal-move-menu" onClose={() => setMenu(false)}>
      <button type="button" role="menuitem" className="labs-menu-item" disabled={index === 0} onClick={() => move(panels[index - 1].id)}>Move panel left</button>
      <button type="button" role="menuitem" className="labs-menu-item" disabled={index === panels.length - 1} onClick={() => move(panels[index + 2]?.id ?? null)}>Move panel right</button>
    </FloatingPopover>}
  </>;
}


export function TerminalTabMoveMenu({ id, panel, anchor, onClose }: {
  id: string; panel: TerminalPanel; anchor: RefObject<HTMLButtonElement>; onClose(): void;
}) {
  const panels = useStore((s) => s.terminalPanels);
  const mode = useStore((s) => s.terminalLayoutMode);
  const index = panel.tabs.indexOf(id);
  const move = (destination: TerminalTabDestination) => { onClose(); useStore.getState().moveTerminalTab(id, destination); };
  return <FloatingPopover anchor={anchor} id={`terminal-move-${id}`} label="Move terminal" role="menu" width={270}
    className="terminal-move-menu" onClose={onClose}>
    <button type="button" role="menuitem" className="labs-menu-item" disabled={index === 0}
      onClick={() => move({ panelId: panel.id, beforeId: panel.tabs[index - 1] })}>Move tab left</button>
    <button type="button" role="menuitem" className="labs-menu-item" disabled={index === panel.tabs.length - 1}
      onClick={() => move({ panelId: panel.id, beforeId: panel.tabs[index + 2] ?? null })}>Move tab right</button>
    {mode === 'free' && panels.filter((p) => p.id !== panel.id).map((p) => <button key={p.id} type="button" role="menuitem" className="labs-menu-item"
      onClick={() => move({ panelId: p.id })}>Move to panel {panels.indexOf(p) + 1}</button>)}
    {mode === 'free' && <button type="button" role="menuitem" className="labs-menu-item"
      disabled={!canMovePanelSession(panels, id, { panelId: null }, mode)}
      title={panels.length >= MAX_TERMINAL_PANELS ? 'Maximal 5 sichtbare Panels. Terminals bleiben als Tabs verfügbar.' : undefined}
      onClick={() => move({ panelId: null })}>Move to new panel</button>}
    <p className="hint">{mode === 'by-type' ? 'Tabs stay within their device type.' : 'Move the tab without restarting its terminal.'}</p>
  </FloatingPopover>;
}
