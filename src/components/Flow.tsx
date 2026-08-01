import { useCallback, useEffect } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import type { DragEvent } from 'react';
import { useStore } from '../store';
import type { DevNode } from '../store';
import type { DeviceKind } from '../engine/device';
import { DeviceNode } from './DeviceNode';
import { FloatingEdge } from './FloatingEdge';
import { PacketLayer } from './PacketLayer';

const nodeTypes = { device: DeviceNode };
const edgeTypes = { floating: FloatingEdge };

const MINIMAP_COLORS: Record<string, string> = {
  host: '#38bdf8',
  switch: '#a78bfa',
  router: '#34d399',
  firewall: '#fb923c',
  server: '#2dd4bf',
  ap: '#f472b6',
};

const DROPPABLE_KINDS = new Set(['host', 'switch', 'router', 'firewall', 'server', 'ap']);

export function Flow() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const select = useStore((s) => s.select);
  const openTerminal = useStore((s) => s.openTerminal);
  const tick = useStore((s) => s.tick);
  const addDeviceAt = useStore((s) => s.addDeviceAt);
  const { screenToFlowPosition } = useReactFlow();

  // Advance the virtual clock in real time; the engine itself is
  // deterministic and only moves when we push it. rAF drives smooth
  // animation while the window is visible; the interval keeps simulated
  // time flowing when the browser throttles rAF (background tab/window),
  // so pings and timeouts don't freeze the moment focus is lost.
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const step = () => {
      const t = performance.now();
      tick(t - last);
      last = t;
    };
    const loop = () => {
      step();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const interval = window.setInterval(() => {
      if (performance.now() - last > 200) step();
    }, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, [tick]);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData('application/netsim') as DeviceKind | '';
      if (kind === '' || !DROPPABLE_KINDS.has(kind)) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addDeviceAt(kind, { x: pos.x - 48, y: pos.y - 39 });
    },
    [screenToFlowPosition, addDeviceAt],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, n) => select(n.id)}
      onPaneClick={() => select(null)}
      onNodeDoubleClick={(_, n: DevNode) => {
        if (n.data.kind !== 'switch') openTerminal(n.id);
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={45}
      deleteKeyCode={['Backspace', 'Delete']}
      defaultEdgeOptions={{ type: 'floating' }}
      minZoom={0.25}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.25 }}
    >
      <Background gap={26} size={1.6} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => MINIMAP_COLORS[(n as DevNode).data.kind] ?? '#888'}
        maskColor="rgba(10, 15, 28, 0.72)"
        bgColor="#0d1526"
      />
      <PacketLayer />
    </ReactFlow>
  );
}
