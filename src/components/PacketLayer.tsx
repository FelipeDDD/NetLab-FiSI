import { useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { NODE_H, NODE_W } from './DeviceNode';

const COLORS: Record<string, string> = {
  arp: '#f59e0b',
  icmp: '#38bdf8',
  tcp: '#34d399',
  udp: '#c084fc',
};

// Animated dots for frames in flight. Packets travel the centre line
// between devices — the same line the floating edges are drawn on.
export function PacketLayer() {
  const { x, y, zoom } = useViewport();
  const packets = useStore((s) => s.packets);
  const dropFlashes = useStore((s) => s.dropFlashes);
  const clock = useStore((s) => s.clock);
  const nodes = useStore((s) => s.nodes);

  if (!packets.length && !dropFlashes.length) return null;

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

  // Expanding red ring where a firewall chain dropped or rejected a packet.
  const rings = dropFlashes
    .filter((f) => clock >= f.start && clock <= f.until)
    .map((f) => {
      const c = centers.get(f.deviceId);
      if (!c) return null;
      const t = (clock - f.start) / (f.until - f.start || 1);
      return (
        <circle
          key={`flash-${f.id}`}
          cx={c.x}
          cy={c.y}
          r={10 + t * 26}
          fill="none"
          stroke="#f87171"
          strokeWidth={2.5}
          opacity={1 - t}
        />
      );
    });

  return (
    <svg className="packet-layer">
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {dots}
        {rings}
      </g>
    </svg>
  );
}
