import { Panel } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { sim } from '../sim';
import { linkPresentation } from '../linkPresentation';

export function LinkDetails({ pointer }: { pointer: { x: number; y: number } | null }) {
  const hovered = useStore(s => s.hoveredLinkId);
  const selected = useStore(s => s.edges.find(e => e.selected)?.id);
  useStore(s => s.uiPulse);
  useStore(s => s.nodes);
  const selection = linkPresentation(sim.net, selected);
  const hover = linkPresentation(sim.net, hovered);
  return <>
    {selection && <Panel position="top-left" className="cable-details nodrag nopan nowheel">
      <div className="cable-details-heading"><strong>Verbindung</strong>
        <button type="button" className="mini-btn" aria-label="Kabelauswahl aufheben" onClick={() => useStore.getState().clearLinkSelection()}>×</button></div>
      <div>{selection.a}</div><div>{selection.b}</div>
      <div className="hint">Latenz: {selection.latency} ms</div>
    </Panel>}
    {hover && hovered !== selected && (pointer ? createPortal(
      <div className="cable-tooltip" role="tooltip" style={{
        ...(pointer.x > window.innerWidth / 2 ? { right: Math.max(8, window.innerWidth - pointer.x + 14) } : { left: Math.max(8, pointer.x + 14) }),
        ...(pointer.y > window.innerHeight / 2 ? { bottom: Math.max(8, window.innerHeight - pointer.y + 16) } : { top: Math.max(8, pointer.y + 16) }),
      }}>{hover.title}</div>, document.body)
      : <Panel position="top-right" className="cable-tooltip cable-tooltip-panel" role="tooltip">{hover.title}</Panel>)}
  </>;
}
