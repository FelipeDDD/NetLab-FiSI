import { useViewport } from '@xyflow/react';
import { useMemo } from 'react';
import { cableGeometry } from '../cableGeometry';
import { useStore } from '../store';
import { NODE_H, NODE_W } from './DeviceNode';
import { packetAnimationProgress } from '../packetAnimation';

const COLORS: Record<string, string> = {
  arp: '#f59e0b',
  icmp: '#38bdf8',
  tcp: '#34d399',
  udp: '#c084fc',
};

// Identified forwarding hops wait for their own visual predecessor only.
// Responses and unrelated packets remain independent of this presentation.
export function PacketLayer() {
  const { x, y, zoom } = useViewport();
  const packets = useStore((s) => s.packets);
  const dropFlashes = useStore((s) => s.dropFlashes);
  const clock = useStore((s) => s.clock);
  const animationClock = useStore((s) => s.packetAnimationClock);
  const mode = useStore((s) => s.packetVisualizationMode);
  const guided = useStore((s) => s.guidedPacket.playback);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore(s => s.edges);
  const cableStyle = useStore(s => s.cableStyle);
  const paths = useMemo(() => {
    const result = new Map<string, { source: string; geometry: ReturnType<typeof cableGeometry> }>();
    if (cableStyle !== 'hybrid') return result;
    const boxes = new Map(nodes.map(n => [n.id, { ...n.position, width: n.measured?.width ?? NODE_W, height: n.measured?.height ?? NODE_H }]));
    for (const edge of edges) {
      const a = boxes.get(edge.source), b = boxes.get(edge.target);
      if (a && b) result.set(edge.id, { source: edge.source, geometry: cableGeometry(a, b, cableStyle) });
    }
    return result;
  }, [nodes, edges, cableStyle]);

  if (!packets.length && !dropFlashes.length && !guided.hops.length) return null;

  const centers = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    centers.set(n.id, {
      x: n.position.x + (n.measured?.width ?? NODE_W) / 2,
      y: n.position.y + (n.measured?.height ?? NODE_H) / 2,
    });
  }

  const visible = mode === 'live' ? packets.map((p) => ({ p, t: packetAnimationProgress(p, animationClock) }))
    : guided.hops[guided.index] ? [{ p: guided.hops[guided.index], t: guided.progress }] : [];
  const dots = visible
    .map(({ p, t }) => {
      if (t === null) return null;
      const a = centers.get(p.fromDeviceId);
      const b = centers.get(p.toDeviceId);
      if (!a || !b) return null;
      const path = paths.get(p.linkId);
      const point = path ? path.geometry.pointAt(path.source === p.fromDeviceId ? t : 1 - t)
        : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return <circle key={p.id} data-link-id={p.linkId} cx={point.x} cy={point.y} r={5} fill={COLORS[p.kind] ?? '#fff'} className="packet-dot" />;
    });

  // Expanding red ring where a firewall chain dropped or rejected a packet.
  const rings = (mode === 'live' ? dropFlashes : [])
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
