import { ViewportPortal } from '@xyflow/react';
import { useStore } from '../store';
import { useWifiCoverage } from '../wifiCoverage';
import { wifiCenter, wifiRadius } from '../engine/wirelessRange';
import { sim } from '../sim';
import { ApDevice } from '../engine/switch';

export function WifiCoverage() {
  const nodes = useStore(s => s.nodes);
  const selected = useStore(s => s.selected);
  const { mode, hovered } = useWifiCoverage();
  if (mode === 'hidden') return null;
  return <ViewportPortal><svg className="wifi-coverage-layer" aria-hidden="true">
    {nodes.filter(n => n.data.kind === 'ap' && (mode === 'always' || n.id === hovered || n.id === selected || n.selected)).map(n => {
      const center = wifiCenter(n.position, 'ap');
      const device = sim.net.devices.get(n.id);
      const radius = wifiRadius(device instanceof ApDevice ? device.rangeMeters : 250);
      return <circle key={n.id} data-wifi-coverage={n.id} cx={center.x} cy={center.y} r={radius} />;
    })}
  </svg></ViewportPortal>;
}
