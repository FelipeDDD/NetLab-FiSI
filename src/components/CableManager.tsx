import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Panel, useReactFlow, ViewportPortal } from '@xyflow/react';
import { CABLE_COLORS } from '../cableAppearance';
import type { CableColor } from '../cableAppearance';
import { cableGeometry } from '../cableGeometry';
import { linkAttachment } from '../deviceArtwork';
import { sim } from '../sim';
import { useStore } from '../store';
import { FloatingPopover } from './FloatingPopover';
import { useCableAppearances } from './useCableAppearances';

export type CableMenuPoint = { id: string; x: number; y: number; end: 'a' | 'b' };

// Cursor and menu state are temporary UI; the original Link stays attached until
// the store validates a free Ethernet interface and commits the move atomically.
export function CableManager({ menu, onMenuChange, message, onMessageChange }: {
  menu: CableMenuPoint | null; onMenuChange: (point: CableMenuPoint | null) => void;
  message: string | null; onMessageChange: (value: string | null) => void;
}) {
  const draft = useStore(s => s.reconnectingCable);
  const colors = useCableAppearances();
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);
  const style = useStore(s => s.cableStyle);
  const anchor = useRef<HTMLSpanElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const menuLink = menu && sim.net.links.get(menu.id);
  const appearance = menu ? colors[menu.id] : undefined;
  const link = draft && sim.net.links.get(draft.id);
  const closeMenu = () => onMenuChange(null);
  const focusEdge = (id: string) => requestAnimationFrame(() => {
    if (document.activeElement?.closest('[data-floating-popover]')) return;
    const edge = [...document.querySelectorAll<HTMLElement>('.react-flow__edge')].find(e => e.dataset.id === id);
    edge?.focus({ preventScroll: true });
  });
  const cancel = () => {
    if (draft) focusEdge(draft.id);
    useStore.getState().cancelCableReconnect(); onMessageChange(null);
  };
  useEffect(() => {
    if (!draft) { onMessageChange(null); return; }
    const move = (e: PointerEvent) => setCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [draft, screenToFlowPosition, onMessageChange]);
  useEffect(() => {
    if (menu && !menuLink) onMenuChange(null);
    if (draft && (!link || link.a.device.id !== draft.before.a[0] || link.a.name !== draft.before.a[1]
      || link.b.device.id !== draft.before.b[0] || link.b.name !== draft.before.b[1])) useStore.getState().cancelCableReconnect();
  }, [menu, menuLink, draft, link, nodes, edges, onMenuChange]);

  const begin = () => {
    if (!menu) return;
    setCursor(screenToFlowPosition(menu)); onMessageChange(null);
    useStore.getState().beginCableReconnect(menu.id, menu.end);
    closeMenu(); focusEdge(menu.id);
  };
  const fixed = link && nodes.find(n => n.id === link[draft!.end === 'a' ? 'b' : 'a'].device.id);
  const attachment = fixed && linkAttachment(fixed, draft!.id, nodes, edges);
  const preview = attachment && cableGeometry(attachment, { x: cursor.x - 1, y: cursor.y - 1, width: 2, height: 2 }, style);
  const tint = colors[draft?.id ?? '']?.color ?? CABLE_COLORS.gray.value;
  return <>
    {menu && menuLink && <>
      {createPortal(<span ref={anchor} className="cable-menu-anchor" tabIndex={-1} style={{ left: menu.x, top: menu.y }} />, document.body)}
      <FloatingPopover anchor={anchor} id="cable-context-menu" label="Kabel" role="menu" width={258}
        className="cable-context-menu" onClose={() => { closeMenu(); focusEdge(menu.id); }}>
        <button type="button" role="menuitem" className="toolbar-menu-action cable-menu-item"
          disabled={menuLink.medium !== 'ethernet'}
          title={menuLink.medium !== 'ethernet' ? 'WLAN-Verbindungen über die WLAN-Einstellungen ändern.' : 'Ende ' + menu.end.toUpperCase() + ' · ' + menuLink[menu.end].device.name + ' / ' + menuLink[menu.end].name}
          onClick={begin}>Kabel umstecken</button>
        <button type="button" role="menuitem" className="toolbar-menu-action cable-menu-item cable-menu-remove" onClick={() => {
          useStore.getState().deleteTopologyElements([], [menu.id]); closeMenu();
        }}>Kabel entfernen</button>
        <div role="separator" className="cable-menu-separator" />
        <div className="cable-menu-heading cable-color-heading"><span>Kabelfarbe</span>
          <button type="button" className="mini-btn" aria-pressed={appearance?.mode === 'auto'} title="Automatische Kabelfarbe verwenden"
            onClick={() => { useStore.getState().resetCableColor(menu.id); closeMenu(); focusEdge(menu.id); }}>Auto</button>
        </div>
        {appearance && <div className="cable-color-mode"><span className="cable-color-swatch" style={{ '--swatch': appearance.color } as CSSProperties} aria-hidden="true" />
          {appearance.mode === 'auto' ? 'Automatisch' : 'Manuell'}</div>}
        {(Object.entries(CABLE_COLORS) as [CableColor, { label: string; value: string }][]).map(([id, color]) => {
          const selected = appearance ? appearance.mode === 'manual' && appearance.color === color.value : id === 'gray';
          return <button type="button" role="menuitemradio" aria-checked={selected} className="toolbar-menu-action cable-menu-item" key={id}
            onClick={() => { useStore.getState().setCableColor(menu.id, id); closeMenu(); focusEdge(menu.id); }}>
            <span className="cable-color-swatch" style={{ '--swatch': color.value } as CSSProperties} aria-hidden="true" />
            <span>{color.label}</span><span className="cable-color-check" aria-hidden="true">{selected ? '✓' : ''}</span>
          </button>;
        })}
      </FloatingPopover>
    </>}
    {draft && link && <>
      <Panel position="top-center" className="cable-reconnect-status nodrag nopan nowheel">
        <div role="status">Ende {draft.end.toUpperCase()} umstecken · Zielgerät anklicken.</div>
        <div className="hint">Die erste freie Ethernet-Schnittstelle wird verwendet.</div>
        {message && <div role="status">{message}</div>}
        <button type="button" className="mini-btn" onClick={cancel}>Abbrechen (Esc)</button>
      </Panel>
      {preview && <>
        <ViewportPortal><svg className="packet-layer packet-layer-underlay cable-reconnect-preview" aria-hidden="true">
          <path d={preview.path} fill="none" stroke={tint} strokeWidth="2.5" />
          <circle cx={cursor.x} cy={cursor.y} r="4" fill={tint} />
        </svg></ViewportPortal>
        {preview.frontStart && <ViewportPortal><svg className="packet-layer cable-reconnect-front" aria-hidden="true">
          <path d={preview.frontStart} fill="none" stroke={tint} strokeWidth="2.5" />
        </svg></ViewportPortal>}
      </>}
    </>}
  </>;
}
