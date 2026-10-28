import { hasTerminalKind } from '../engine/device';
import { WifiCoverage } from './WifiCoverage';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
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
import { LinkDetails } from './LinkDetails';
import { linkPresentation } from '../linkPresentation';
import { sim } from '../sim';
import { protectsTopologyKeys, topologyHistoryDirection } from '../topologyShortcuts';
import { CANVAS_BACKGROUNDS, useCanvasBackground } from '../canvasBackground';
import { BackgroundParticles } from './BackgroundParticles';
import { CableManager, type CableMenuPoint } from './CableManager';
import { cableEndAt } from '../cableInteraction';
import { DEVICE_COLORS } from '../deviceColors';
import { AlignmentGuides } from './AlignmentGuides';
import { useSmartAlignment } from './useSmartAlignment';
import { AreaMarkingsLayer } from './AreaMarkings';
import { MarkingFreeDraw } from './MarkingFreeDraw';
import { MarkingGeometryEditor, markingsAtPoint, type MarkingMenuPoint } from './MarkingGeometryEditor';

const nodeTypes = { device: DeviceNode };
const edgeTypes = { floating: FloatingEdge };

const DROPPABLE_KINDS = new Set(['host', 'notebook', 'smartphone', 'switch', 'router', 'firewall', 'server', 'ap']);

export function Flow({ fitOnInit = true }: { fitOnInit?: boolean } = {}) {
  const [minimapOpen, setMinimapOpen] = useState(false);
  const background = useCanvasBackground(s => s.preference);
  const backgroundImage = CANVAS_BACKGROUNDS[background.choice].image;
  const experimentalBackground = backgroundImage ? `${import.meta.env.BASE_URL}assets/backgrounds/${backgroundImage}` : null;
  const shade = `rgba(10, 15, 28, ${1 - background.intensity / 100})`;
  const nodes = useStore((s) => s.nodes);
  const generation = useStore(s => s.topologyGeneration);
  const edges = useStore((s) => s.edges);
  const reconnecting = useStore(s => s.reconnectingCable);
  const quickPing = useStore(s => s.quickPing);
  const alignment = useSmartAlignment(!!reconnecting || !!quickPing);
  const [cableMenu, setCableMenu] = useState<CableMenuPoint | null>(null);
  const [markingMenu, setMarkingMenu] = useState<MarkingMenuPoint | null>(null);
  const [cableMessage, setCableMessage] = useState<string | null>(null);
  const openCableMenu = (id: string, element: Element, click?: { x: number; y: number }) => {
    const path = element.closest('.react-flow__edge')?.querySelector<SVGPathElement>('.react-flow__edge-path');
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) return;
    const length = path.getTotalLength(), midpoint = path.getPointAtLength(length / 2);
    const position = click ?? new DOMPoint(midpoint.x, midpoint.y).matrixTransform(matrix);
    const point = new DOMPoint(position.x, position.y).matrixTransform(matrix.inverse());
    // Freeze the endpoint now, before opening the menu or moving the cursor.
    const end = click ? cableEndAt({ length, pointAt: t => path.getPointAtLength(t * length) }, point) : 'a';
    setCableMenu({ id, x: Math.max(8, Math.min(window.innerWidth - 9, position.x)),
      y: Math.max(8, Math.min(window.innerHeight - 9, position.y)), end });
  };
  const labeledEdges = useMemo(() => edges.map(e => ({ ...e, ariaLabel: linkPresentation(sim.net, e.id)?.title })), [edges, nodes]);
  const hovered = useStore(s => s.hoveredLinkId);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (hovered && !edges.some(e => e.id === hovered)) useStore.getState().hoverLink(null);
  }, [edges, hovered]);
  useEffect(() => { if (quickPing) { setCableMenu(null); alignment.reset(); } }, [quickPing?.sourceId]);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const select = useStore((s) => s.select);
  const openTerminal = useStore((s) => s.openTerminal);
  const tick = useStore((s) => s.tick);
  const addDeviceAt = useStore((s) => s.addDeviceAt);
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardMoving = useRef(false);
  const pingClick = useRef<{ id: string; time: number } | null>(null);
  const cableBeforeDrag = useRef<string | null>(null);
  const finishKeyboard = () => {
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = null;
    if (keyboardMoving.current) { keyboardMoving.current = false; useStore.getState().finishNodeMovement(); }
  };
  useLayoutEffect(() => {
    // Discard the old interaction; never finish its drag against a new network
    // that happens to contain the same device IDs. Keep React Flow mounted.
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = null;
    keyboardMoving.current = false;
    cableBeforeDrag.current = null;
    pingClick.current = null;
    alignment.reset();
    setCableMenu(null); setCableMessage(null); setPointer(null);
    setMarkingMenu(null);
  }, [generation]);
  useEffect(() => {
    // Node action buttons stop bubbling keyboard events to protect dragging.
    // Escape must still cancel target selection when one of them has focus.
    const cancelPing = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && useStore.getState().quickPing) {
        event.preventDefault(); useStore.getState().cancelQuickPing();
      }
    };
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const direction = topologyHistoryDirection(event, target, document.activeElement);
      if (direction) {
        event.preventDefault();
        finishKeyboard();
        if (direction === 'undo') useStore.getState().undoTopology();
        else useStore.getState().redoTopology();
      } else if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && !protectsTopologyKeys(target) && !protectsTopologyKeys(document.activeElement)) {
        useStore.getState().cancelCableReconnect();
        alignment.reset();
        setCableMenu(null); setCableMessage(null);
        if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
        keyboardTimer.current = null;
        keyboardMoving.current = false;
        useStore.getState().cancelNodeMovement();
        useStore.getState().clearLinkSelection();
      }
    };
    const blur = () => {
      alignment.reset();
      finishKeyboard();
      useStore.getState().cancelNodeMovement();
      useStore.getState().hoverLink(null);
    };
    // Bubble phase respects controls which already handled the event.
    window.addEventListener('keydown', shortcut);
    window.addEventListener('keydown', cancelPing, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', shortcut); window.removeEventListener('keydown', cancelPing, true); window.removeEventListener('blur', blur); finishKeyboard(); };
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
      className={[experimentalBackground && 'experimental-canvas-background', quickPing && 'is-quick-ping'].filter(Boolean).join(' ') || undefined}
      style={experimentalBackground ? { backgroundImage: `linear-gradient(${shade}, ${shade}), url("${experimentalBackground}")` } : undefined}
      nodes={nodes}
      edges={labeledEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={alignment.onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      edgesReconnectable={false}
      nodesDraggable={!reconnecting && !quickPing}
      nodesConnectable={!reconnecting && !quickPing}
      elementsSelectable={!reconnecting && !quickPing}
      onBeforeDelete={async ({ nodes, edges }) => {
        if (useStore.getState().quickPing) return false;
        alignment.reset();
        // Own the entire transaction before React Flow emits edge removals
        // followed by node removals. Returning false prevents duplicate edits.
        useStore.getState().deleteTopologyElements(nodes.map((n) => n.id), edges.map((e) => e.id));
        return false;
      }}
      onNodeDragStart={(event, _, moving) => {
        alignment.begin(event, moving);
        finishKeyboard();
        useStore.getState().beginNodeMovement('drag');
        if (cableBeforeDrag.current) useStore.getState().onEdgesChange([{ type: 'select', id: cableBeforeDrag.current, selected: true }]);
      }}
      onNodeDragStop={() => { alignment.reset(); cableBeforeDrag.current = null; useStore.getState().finishNodeMovement(); }}
      onSelectionDragStart={(event, moving) => { alignment.begin(event, moving); finishKeyboard(); useStore.getState().beginNodeMovement('drag'); }}
      onSelectionDragStop={() => { alignment.reset(); useStore.getState().finishNodeMovement(); }}
      onPointerDownCapture={(event) => {
        finishKeyboard();
        cableBeforeDrag.current = (event.target as Element).closest('.react-flow__node') ? useStore.getState().edges.find(e => e.selected)?.id ?? null : null;
      }}
      onPointerCancelCapture={() => { alignment.reset(); useStore.getState().cancelNodeMovement(); }}
      onFocusCapture={(event) => {
        const edge = (event.target as Element).closest('.react-flow__edge');
        if (edge) { setPointer(null); useStore.getState().hoverLink(edge.getAttribute('data-id')); }
      }}
      onBlurCapture={(event) => {
        if ((event.target as Element).closest('.react-flow__edge')) useStore.getState().hoverLink(null);
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finishKeyboard();
      }}
      onKeyDownCapture={(event) => {
        const target = event.target as Element;
        const reconnectNode = target.closest<HTMLElement>('.react-flow__node');
        if (quickPing && reconnectNode && /^Arrow/.test(event.key)) { event.preventDefault(); return; }
        if (quickPing && reconnectNode && !target.closest('button, input, select, textarea') && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); event.stopPropagation();
          useStore.getState().chooseQuickPingTarget(reconnectNode.dataset.id!); return;
        }
        if (reconnecting && reconnectNode && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); event.stopPropagation();
          setCableMessage(useStore.getState().reconnectCable(reconnectNode.dataset.id!));
          return;
        }
        const edge = target.closest<HTMLElement>('.react-flow__edge');
        if (edge && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
          event.preventDefault(); event.stopPropagation();
          openCableMenu(edge.dataset.id!, edge);
          return;
        }
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
      onNodeClick={(_, n) => {
        if (quickPing) { pingClick.current = { id: n.id, time: performance.now() }; useStore.getState().chooseQuickPingTarget(n.id); return; }
        if (reconnecting) { setCableMessage(useStore.getState().reconnectCable(n.id)); return; }
        select(n.id);
      }}
      onEdgeMouseEnter={(event, edge) => { setPointer({ x: event.clientX, y: event.clientY }); useStore.getState().hoverLink(edge.id); }}
      onEdgeMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
      onEdgeMouseLeave={() => { setPointer(null); useStore.getState().hoverLink(null); }}
      onEdgeClick={(_, edge) => { if (!reconnecting && !quickPing) useStore.getState().onEdgesChange(edges.map(e => ({ type: 'select' as const, id: e.id, selected: e.id === edge.id }))); }}
      onEdgeContextMenu={(event, edge) => {
        event.preventDefault();
        if (reconnecting || quickPing) return;
        setPointer(null); useStore.getState().hoverLink(null);
        setMarkingMenu(null);
        useStore.getState().onEdgesChange(edges.map(e => ({ type: 'select' as const, id: e.id, selected: e.id === edge.id })));
        openCableMenu(edge.id, event.target as Element, { x: event.clientX, y: event.clientY });
      }}
      onPaneContextMenu={event => {
        if (reconnecting || quickPing || useStore.getState().markingGeometry) return;
        const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const ids = markingsAtPoint(point, getViewport().zoom);
        if (!ids.length) { setMarkingMenu(null); return; }
        event.preventDefault(); setCableMenu(null);
        setMarkingMenu({ ids, x: event.clientX, y: event.clientY });
      }}
      onPaneClick={() => { setCableMenu(null); setMarkingMenu(null); if (!reconnecting && !quickPing) { select(null); useStore.getState().clearLinkSelection(); } }}
      onNodeDoubleClick={(_, n: DevNode) => {
        if (pingClick.current?.id === n.id && performance.now() - pingClick.current.time < 500) return;
        if (!reconnecting && !quickPing && hasTerminalKind(n.data.kind)) openTerminal(n.id);
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
      elevateEdgesOnSelect={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.25}
      maxZoom={2.5}
      fitView={fitOnInit}
      fitViewOptions={{ padding: 0.25, maxZoom: 1.25 }}
    >
      {background.dots && <Background gap={26} size={1.6} bgColor={experimentalBackground ? 'transparent' : undefined}
        style={experimentalBackground ? { opacity: 0.4, pointerEvents: 'none' } : undefined} />}
      <Controls showInteractive={false} />
      <BackgroundParticles />
      {minimapOpen && <MiniMap
        id="topology-minimap"
        style={{ bottom: 40 }}
        pannable
        zoomable
        nodeColor={(n) => DEVICE_COLORS[(n as DevNode).data.kind] ?? '#888'}
        maskColor="rgba(10, 15, 28, 0.72)"
        bgColor="#0d1526"
      />}
      <Panel position="bottom-right">
        <button type="button" className="minimap-toggle" aria-expanded={minimapOpen}
          aria-controls={minimapOpen ? 'topology-minimap' : undefined}
          title={minimapOpen ? 'Hide minimap' : 'Show minimap'} onClick={() => setMinimapOpen(!minimapOpen)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />
          </svg>
          Minimap
        </button>
      </Panel>
      <AreaMarkingsLayer />
      <MarkingFreeDraw />
      <MarkingGeometryEditor menu={markingMenu} closeMenu={() => setMarkingMenu(null)} />
      <WifiCoverage />
      <AlignmentGuides guides={alignment.guides} />
      <PacketLayer />
      {quickPing && <Panel position="top-center" className="quick-ping-panel nodrag nopan nowheel">
        <div role="status">Ping-Ziel auswählen · Esc zum Abbrechen</div>
        <small>Quelle: {nodes.find(n => n.id === quickPing.sourceId)?.data.label}</small>
        {quickPing.message && <p role="status">{quickPing.message}</p>}
        {quickPing.targetId && quickPing.addresses?.map(a => <button type="button" className="btn" key={a.address}
          onClick={() => useStore.getState().chooseQuickPingTarget(quickPing.targetId!, a.address)}>{a.address} · {a.interfaces.join(', ')}</button>)}
        <button type="button" className="btn" onClick={() => useStore.getState().cancelQuickPing()}>Abbrechen</button>
      </Panel>}
      {!reconnecting && <LinkDetails pointer={pointer} />}
      <CableManager menu={cableMenu} onMenuChange={setCableMenu} message={cableMessage} onMessageChange={setCableMessage} />
    </ReactFlow>
  );
}
