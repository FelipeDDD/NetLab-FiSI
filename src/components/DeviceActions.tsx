import type { CSSProperties } from 'react';
import { useViewport } from '@xyflow/react';
import type { DeviceKind } from '../engine/device';
import type { DeviceActionLayout } from '../deviceActions';
import { DEVICE_ARTWORK, hasDeviceArtwork } from '../deviceArtwork';
import { networkLabelScale } from '../canvasNetwork';
import { useStore } from '../store';

export function DeviceActions({ id, name, kind, layout }: { id: string; name: string; kind: DeviceKind; layout: DeviceActionLayout }) {
  const openTerminal = useStore(s => s.openTerminal), { zoom } = useViewport();
  return <div className="device-actions" data-layout={layout} role="group" aria-label={`Aktionen für ${name}`}
    style={{ '--device-action-scale': layout === 'b' ? networkLabelScale(zoom) : 1,
      '--device-action-bottom': `${6 + (hasDeviceArtwork(kind) ? DEVICE_ARTWORK[kind].height : 30)}px`,
    } as CSSProperties}>
    <button type="button" className="device-terminal device-action nodrag nopan nowheel"
      aria-label={`Terminal öffnen: ${name}`} title={`Terminal öffnen: ${name}`}
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openTerminal(id); }}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="m4 5 4 4-4 4m7 0h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {layout !== 'current' && <button type="button" className="device-ping-preview device-action nodrag nopan nowheel"
      aria-label={`Ping: ${name} — Vorschau, noch nicht verfügbar`} title="Ping — Vorschau, noch nicht verfügbar" aria-disabled="true"
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 10h10m-3-3 3 3-3 3M14 4a8 8 0 0 1 0 12M16 2a11 11 0 0 1 0 16" />
      </svg>
    </button>}
  </div>;
}
