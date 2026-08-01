import type { DragEvent } from 'react';
import { useStore } from '../store';
import type { DeviceKind } from '../engine/device';

const ITEMS: { kind: DeviceKind; label: string; blurb: string }[] = [
  { kind: 'host', label: 'Host', blurb: 'Linux workstation' },
  { kind: 'switch', label: 'Switch', blurb: 'L2 learning switch' },
  { kind: 'router', label: 'Router', blurb: 'IP forwarding on' },
  { kind: 'firewall', label: 'Firewall', blurb: 'router + nftables ready' },
];

export function Palette() {
  const addDeviceAt = useStore((s) => s.addDeviceAt);
  const nodeCount = useStore((s) => s.nodes.length);

  const onDragStart = (e: DragEvent, kind: DeviceKind) => {
    e.dataTransfer.setData('application/netsim', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      <div className="palette-title">Devices</div>
      {ITEMS.map((it) => (
        <button
          key={it.kind}
          className={`palette-item kind-${it.kind}`}
          draggable
          onDragStart={(e) => onDragStart(e, it.kind)}
          onClick={() => addDeviceAt(it.kind, { x: 140 + (nodeCount % 5) * 60, y: 120 + (nodeCount % 7) * 50 })}
          title="Drag onto the canvas, or click to add"
        >
          <span className="palette-item-label">{it.label}</span>
          <span className="palette-item-blurb">{it.blurb}</span>
        </button>
      ))}
      <div className="palette-hint">
        Drag between the dots on two devices to cable them. Double-click a host or router for its
        terminal.
      </div>
    </aside>
  );
}
