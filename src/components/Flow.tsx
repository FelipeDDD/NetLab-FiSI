import { useCallback, useEffect, useRef } from 'react';
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
import { protectsTopologyKeys, topologyHistoryDirection } from '../topologyShortcuts';

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
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardMoving = useRef(false);
  const finishKeyboard = () => {
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = null;
    if (keyboardMoving.current) { keyboardMoving.current = false; useStore.getState().finishNodeMovement(); }
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const direction = topologyHistoryDirection(event, target, document.activeElement);
      if (direction) {
        event.preventDefault();
        finishKeyboard();
        if (direction === 'undo') useStore.getState().undoTopology();
        else useStore.getState().redoTopology();
      } else if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && !protectsTopologyKeys(target) && !protectsTopologyKeys(document.activeElement)) {
        if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
        keyboardTimer.current = null;
        keyboardMoving.current = false;
        useStore.getState().cancelNodeMovement();
      }
    };
    const blur = () => {
      finishKeyboard();
      useStore.getState().cancelNodeMovement();
    };
    // Bubble phase respects controls which already handled the event.
    window.addEventListener('keydown', shortcut);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', shortcut); window.removeEventListener('blur', blur); finishKeyboard(); };
  }, []);

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
      onBeforeDelete={async ({ nodes, edges }) => {
        // Own the entire transaction before React Flow emits edge removals
        // followed by node removals. Returning false prevents duplicate edits.
        useStore.getState().deleteTopologyElements(nodes.map((n) => n.id), edges.map((e) => e.id));
        return false;
      }}
      onNodeDragStart={() => { finishKeyboard(); useStore.getState().beginNodeMovement('drag'); }}
      onNodeDragStop={() => useStore.getState().finishNodeMovement()}
      onSelectionDragStart={() => { finishKeyboard(); useStore.getState().beginNodeMovement('drag'); }}
      onSelectionDragStop={() => useStore.getState().finishNodeMovement()}
      onPointerDownCapture={finishKeyboard}
      onPointerCancelCapture={() => useStore.getState().cancelNodeMovement()}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finishKeyboard(); }}
      onKeyDownCapture={(event) => {
        const target = event.target as Element;
        if (!event.defaultPrevented && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
          && /^Arrow(Left|Right|Up|Down)$/.test(event.key) && !protectsTopologyKeys(target)
          && !protectsTopologyKeys(document.activeElement) && target.closest('.react-flow__node, .react-flow__nodesselection')) {
          if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
          keyboardTimer.current = null;
          useStore.getState().beginNodeMovement('keyboard');
          keyboardMoving.current = true;
        } else finishKeyboard();
      }}
      onKeyUpCapture={(event) => {
        if (!keyboardMoving.current || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
        if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
        keyboardTimer.current = setTimeout(finishKeyboard, 350);
      }}
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
