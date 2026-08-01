import { useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { NODE_H, NODE_W } from './DeviceNode';

const COLORS: Record<string, string> = {
  arp: '#f59e0b',
  icmp: '#38bdf8',
};

// Animated dots for frames in flight. Packets travel the centre line
// between devices — the same line the floating edges are drawn on.
export function PacketLayer() {
  const { x, y, zoom } = useViewport();
  const packets = useStore((s) => s.packets);
  const clock = useStore((s) => s.clock);
  const nodes = useStore((s) => s.nodes);

  if (!packets.length) return null;

  const centers = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    centers.set(n.id, {
      x: n.position.x + (n.measured?.width ?? NODE_W) / 2,
      y: n.position.y + (n.measured?.height ?? NODE_H) / 2,
    });
  }

  const dots = packets
    .filter((p) => clock >= p.start && clock <= p.end)
    .map((p) => {
      const a = centers.get(p.fromDeviceId);
      const b = centers.get(p.toDeviceId);
      if (!a || !b) return null;
      const t = (clock - p.start) / (p.end - p.start || 1);
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      return <circle key={p.id} cx={px} cy={py} r={5} fill={COLORS[p.kind] ?? '#fff'} className="packet-dot" />;
    });

  return (
    <svg className="packet-layer">
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>{dots}</g>
    </svg>
  );
}
