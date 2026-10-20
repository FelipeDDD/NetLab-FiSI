import { ReactFlowProvider } from '@xyflow/react';
import { useRef } from 'react';
import { Flow } from './components/Flow';
import { Palette } from './components/Palette';
import { Inspector } from './components/Inspector';
import { PacketInspector } from './components/PacketInspector';
import { TerminalDock } from './components/TerminalDock';
import { Toolbar } from './components/Toolbar';
import { LabPanel } from './components/LabPanel';
import { useStore } from './store';

export default function App() {
  const editor = useRef<HTMLDivElement>(null);
  const selected = useStore((s) => s.selected);
  const packetInspectorOpen = useStore((s) => s.packetInspectorOpen);
  const hasTerminals = useStore((s) => s.terminals.length > 0);

  return (
    <ReactFlowProvider>
      <div className={`app${hasTerminals ? ' with-dock' : ''}`}>
        <Toolbar />
        <div className="main">
          <Palette />
          <div className="canvas" ref={editor} tabIndex={-1} role="region" aria-label="Topology editor">
            <Flow />
            <LabPanel />
          </div>
          {selected && <Inspector hidden={packetInspectorOpen} />}
          <PacketInspector />
        </div>
        <TerminalDock onFocusEditor={() => editor.current?.focus({ preventScroll: true })} />
      </div>
    </ReactFlowProvider>
  );
}
