import type { DragEvent } from 'react';
import { useStore } from '../store';
import type { DeviceKind } from '../engine/device';
import { DeviceIcon } from './DeviceNode';
import type { HostCreationMode } from '../hostOs';

const ITEMS: { kind: DeviceKind; label: string; blurb: string }[] = [
  { kind: 'host', label: 'Host', blurb: 'Linux workstation' },
  { kind: 'server', label: 'Server', blurb: 'DHCP / DNS / web services' },
  { kind: 'switch', label: 'Switch', blurb: 'L2 learning switch' },
  { kind: 'router', label: 'Router', blurb: 'IP forwarding on' },
  { kind: 'firewall', label: 'Firewall', blurb: 'router + nftables ready' },
  { kind: 'ap', label: 'Wi-Fi AP', blurb: 'wireless bridge (SSID)' },
];

export function Palette() {
  const addDeviceAt = useStore((s) => s.addDeviceAt);
  const nodeCount = useStore((s) => s.nodes.length);
  const hostMode = useStore((s) => s.hostCreationMode);

  const onDragStart = (e: DragEvent, kind: DeviceKind) => {
    e.dataTransfer.setData('application/netsim', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      <div className="palette-title">Devices</div>
      <label className="host-creation-mode">New hosts
        <select value={hostMode} onChange={(e) => useStore.getState().setHostCreationMode(e.target.value as HostCreationMode)}>
          <option value="linux">Linux</option><option value="windows">Windows</option><option value="mixed">Mixed (50/50)</option>
        </select>
      </label>
      {ITEMS.map((it) => (
        <button
          key={it.kind}
          className={`palette-item kind-${it.kind}`}
          draggable
          onDragStart={(e) => onDragStart(e, it.kind)}
          onClick={() => addDeviceAt(it.kind, { x: 140 + (nodeCount % 5) * 60, y: 120 + (nodeCount % 7) * 50 })}
          title="Drag onto the canvas, or click to add"
        >
          <span className="palette-item-icon">
            <DeviceIcon kind={it.kind} size={22} />
          </span>
          <span className="palette-item-text">
            <span className="palette-item-label">{it.label}</span>
            <span className="palette-item-blurb">{it.kind === 'host' ? hostMode === 'mixed' ? 'Linux or Windows' : `${hostMode === 'windows' ? 'Windows' : 'Linux'} workstation` : it.blurb}</span>
          </span>
        </button>
      ))}
      <div className="palette-hint">
        Drag between the dots on two devices to cable them. Double-click a host or router for its
        terminal.
      </div>
    </aside>
  );
}
