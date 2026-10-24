import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { inspectorPreferredWidth, loadInspectorLayout, normalizeInspectorLayout, saveInspectorLayout, type InspectorLayoutPreference } from './inspectorLayout';
import { ResizableInspector } from './components/ResizableInspector';
import { Flow } from './components/Flow';
import { Palette } from './components/Palette';
import { Inspector } from './components/Inspector';
import { PacketInspector } from './components/PacketInspector';
import { TerminalDock } from './components/TerminalDock';
import { Toolbar } from './components/Toolbar';
import { LabPanel } from './components/LabPanel';
import { useStore } from './store';
import { loadPacketInspector, savePacketInspector, packetPanelGeometry, type PacketInspectorPreference } from './packetInspectorLayout';
import { ResizablePacketPanel } from './components/ResizablePacketPanel';
import { protectsTopologyKeys } from './topologyShortcuts';

export default function App() {
  const [packetLayout, setPacketLayout] = useState(loadPacketInspector);
  const changePacketLayout = (value: PacketInspectorPreference, persist = true) => { setPacketLayout(value); if (persist) savePacketInspector(value); };
  const [viewport, setViewport] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth);
  useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const [inspectorLayout, setInspectorLayout] = useState(loadInspectorLayout);
  const changeInspectorLayout = (value: InspectorLayoutPreference, persist = true) => {
    const next = normalizeInspectorLayout(value);
    setInspectorLayout(next);
    if (persist) saveInspectorLayout(next);
  };
  const editor = useRef<HTMLDivElement>(null);
  const selected = useStore((s) => s.selected);
  const packetInspectorOpen = useStore((s) => s.packetInspectorOpen);
  const hasTerminals = useStore((s) => s.terminals.length > 0);
  const geometry = packetPanelGeometry(viewport, selected ? inspectorPreferredWidth(inspectorLayout) : 0, packetLayout);

  return (
    <ReactFlowProvider>
      <div className={`app${hasTerminals ? ' with-dock' : ''}`} data-inspector-layout={inspectorLayout.layout}
        onKeyDown={event => {
          if (event.key !== "'" || event.repeat || event.defaultPrevented || event.nativeEvent.isComposing ||
              event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
              protectsTopologyKeys(event.target as Element) || protectsTopologyKeys(document.activeElement)) return;
          const state = useStore.getState();
          if (!state.terminals.length) return;
          event.preventDefault();
          state.setTerminalDockCollapsed(!state.terminalDockCollapsed);
        }}
        style={{ '--inspector-width': `${inspectorPreferredWidth(inspectorLayout)}px` } as React.CSSProperties}>
        <Toolbar inspectorLayout={inspectorLayout} onInspectorLayoutChange={changeInspectorLayout} />
        <div className={`main${packetInspectorOpen ? ' is-analyzing-packets' : ''}${selected ? ' has-device-inspector' : ''}`}
          data-packet-side={packetLayout.side} data-analysis-layout={geometry.placement}
          style={{ '--packet-panel-width': `${geometry.width}px`, '--analysis-device-width': `${geometry.deviceWidth}px` } as React.CSSProperties}>
          <Palette />
          <div className="canvas" ref={editor} tabIndex={-1} role="region" aria-label="Topology editor">
            <Flow />
            <LabPanel />
          </div>
          {selected && <ResizableInspector hidden={false} side={packetInspectorOpen && packetLayout.side === 'right' ? 'left' : 'right'}
            onResize={(width, persist) => changeInspectorLayout({ layout: 'custom', customWidth: width }, persist)}
            onReset={() => changeInspectorLayout({ ...inspectorLayout, layout: 'balanced' })}>
            <Inspector />
          </ResizableInspector>}
          <ResizablePacketPanel open={packetInspectorOpen} layout={packetLayout} min={geometry.min} max={geometry.max} width={geometry.width}
            onResize={(width, persist) => changePacketLayout({ ...packetLayout, widths: { ...packetLayout.widths, [packetLayout.mode]: width } }, persist)}>
            <PacketInspector layout={packetLayout} onLayoutChange={changePacketLayout} />
          </ResizablePacketPanel>
        </div>
        <TerminalDock onFocusEditor={() => editor.current?.focus({ preventScroll: true })} />
      </div>
    </ReactFlowProvider>
  );
}
