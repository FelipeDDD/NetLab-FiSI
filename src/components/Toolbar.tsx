import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useStore } from '../store';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { FloatingPopover } from './FloatingPopover';
import { PacketAnimationControl } from './PacketAnimationControl';
import { InspectorLayoutSettings } from './InspectorLayoutSettings';
import type { InspectorLayoutPreference } from '../inspectorLayout';

const USER_GUIDE_URL = 'https://github.com/michael-borck/netsim/blob/main/docs/USER_GUIDE.md';

type ExportAction =
  | 'exportJson'
  | 'exportConfigs'
  | 'exportContainerlab'
  | 'exportCompose'
  | 'exportSvg'
  | 'exportPng'
  | 'exportReport';

function ExportItem({
  label,
  hint,
  action,
  close,
}: {
  label: string;
  hint: string;
  action: ExportAction;
  close: (open: boolean) => void;
}) {
  const fn = useStore((s) => s[action]);
  return (
    <button
      className="labs-menu-item"
      role="menuitem"
      onClick={() => {
        fn();
        close(false);
      }}
    >
      <span className="labs-menu-title">{label}</span>
      <span className="labs-menu-blurb">{hint}</span>
    </button>
  );
}

export function Toolbar({ inspectorLayout, onInspectorLayoutChange }: {
  inspectorLayout: InspectorLayoutPreference; onInspectorLayoutChange: (value: InspectorLayoutPreference) => void;
}) {
  const [labsOpen, setLabsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [menuFocus, setMenuFocus] = useState<'first' | 'last'>('first');
  const labsRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const loadBundledLab = useStore((s) => s.loadBundledLab);
  const loadExample = useStore((s) => s.loadExample);
  const clock = useStore((s) => s.clock);
  const paused = useStore((s) => s.paused);
  const speed = useStore((s) => s.speed);
  const notice = useStore((s) => s.notice);
  const setPaused = useStore((s) => s.setPaused);
  const setSpeed = useStore((s) => s.setSpeed);
  const newTopology = useStore((s) => s.newTopology);
  const loadDemo = useStore((s) => s.loadDemo);
  const importJson = useStore((s) => s.importJson);
  const shareUrl = useStore((s) => s.shareUrl);
  const setNotice = useStore((s) => s.setNotice);
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useStore((s) => s.topologyHistory);
  const packetInspectorOpen = useStore((s) => s.packetInspectorOpen);
  const closeExport = (open: boolean) => {
    setExportOpen(open);
    if (!open) exportRef.current?.focus({ preventScroll: true });
  };
  const menuKeys = (event: KeyboardEvent, menu: 'labs' | 'export') => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setMenuFocus(event.key === 'ArrowUp' ? 'last' : 'first');
    setLabsOpen(menu === 'labs');
    setExportOpen(menu === 'export');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const err = importJson(await f.text());
    if (err) setNotice(`Import failed: ${err}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-name">NetLab - FiSi</span>
      </div>

      <div className="toolbar-group">
        <InspectorLayoutSettings value={inspectorLayout} onChange={onInspectorLayoutChange} />
        <button className="btn topology-history-action" disabled={!history.past.length} aria-label="Undo"
          title={history.past.length ? `Undo: ${history.past.at(-1)!.label} (Ctrl/Cmd+Z)` : 'Undo (Ctrl/Cmd+Z)'}
          onClick={() => useStore.getState().undoTopology()}>↶ Undo</button>
        <button className="btn topology-history-action" disabled={!history.future.length} aria-label="Redo"
          title={history.future.length ? `Redo: ${history.future.at(-1)!.label} (Ctrl/Cmd+Shift+Z)` : 'Redo (Ctrl/Cmd+Shift+Z)'}
          onClick={() => useStore.getState().redoTopology()}>↷ Redo</button>
        <button className="btn" onClick={() => newTopology()}>
          New
        </button>
        <button className="btn" onClick={() => loadDemo()}>
          Demo
        </button>
        <button id="packets-toggle" className="btn packets-toggle" aria-expanded={packetInspectorOpen}
          aria-controls={packetInspectorOpen ? 'packet-inspector' : undefined}
          onClick={() => useStore.getState().setPacketInspectorOpen(!packetInspectorOpen)}>
          Packets
        </button>
        <div className="labs-menu-wrap">
          <button ref={labsRef} className="btn" aria-haspopup="menu" aria-expanded={labsOpen} aria-controls={labsOpen ? 'toolbar-labs-menu' : undefined}
            onKeyDown={(e) => menuKeys(e, 'labs')}
            onClick={() => { setMenuFocus('first'); setLabsOpen(!labsOpen); setExportOpen(false); }}>
            Labs ▾
          </button>
          {labsOpen && (
            <FloatingPopover anchor={labsRef} id="toolbar-labs-menu" label="Labs and example networks" role="menu" width={360}
              initialFocus={menuFocus} className="labs-menu" onClose={() => setLabsOpen(false)}>
              {LABS.map((l, i) => (
                <button
                  key={l.lab!.id}
                  className="labs-menu-item"
                  role="menuitem"
                  onClick={() => {
                    loadBundledLab(i);
                    setLabsOpen(false);
                    labsRef.current?.focus();
                  }}
                >
                  <span className="labs-menu-title">{l.lab!.title}</span>
                  <span className="labs-menu-blurb">{l.lab!.blurb}</span>
                </button>
              ))}
              <div className="labs-menu-section">Example networks</div>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={ex.title}
                  className="labs-menu-item"
                  role="menuitem"
                  onClick={() => {
                    loadExample(i);
                    setLabsOpen(false);
                    labsRef.current?.focus();
                  }}
                >
                  <span className="labs-menu-title">{ex.title}</span>
                  <span className="labs-menu-blurb">{ex.blurb}</span>
                </button>
              ))}
              <div className="labs-menu-note">Loading a lab or example replaces the current canvas.</div>
            </FloatingPopover>
          )}
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <div className="labs-menu-wrap">
          <button ref={exportRef} className="btn" aria-haspopup="menu" aria-expanded={exportOpen} aria-controls={exportOpen ? 'toolbar-export-menu' : undefined}
            onKeyDown={(e) => menuKeys(e, 'export')}
            onClick={() => { setMenuFocus('first'); setExportOpen(!exportOpen); setLabsOpen(false); }}>
            Export ▾
          </button>
          {exportOpen && (
            <FloatingPopover anchor={exportRef} id="toolbar-export-menu" label="Export topology" role="menu" width={345}
              initialFocus={menuFocus} className="labs-menu export-menu" onClose={() => setExportOpen(false)}>
              <ExportItem label="Topology (.json)" hint="save/share/import in NetSim" action="exportJson" close={closeExport} />
              <ExportItem label="Device configs (.zip)" hint="real setup.sh, nftables.conf, dnsmasq.conf per device" action="exportConfigs" close={closeExport} />
              <ExportItem label="containerlab (.clab.yml)" hint="deploy the design with real containers" action="exportContainerlab" close={closeExport} />
              <ExportItem label="docker-compose (.yml)" hint="approximate L2 — see file header" action="exportCompose" close={closeExport} />
              <ExportItem label="Diagram (.svg)" hint="documentation-grade topology drawing" action="exportSvg" close={closeExport} />
              <ExportItem label="Diagram (.png)" hint="same drawing, rasterised 2×" action="exportPng" close={closeExport} />
              <ExportItem label="Network report (.html)" hint="printable design document with tables + diagram" action="exportReport" close={closeExport} />
            </FloatingPopover>
          )}
        </div>
        <button className="btn" onClick={() => shareUrl()}>
          Share link
        </button>
        <a className="btn" href={USER_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          Help
        </a>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <PacketAnimationControl />

      <div className="toolbar-group sim-controls">
        <button className="btn" onClick={() => setPaused(!paused)} title={paused ? 'Resume' : 'Pause'}>
          {paused ? '▶ Run' : '⏸ Pause'}
        </button>
        <select className="speed" aria-label="Simulation speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
        <span className="clock">t = {(clock / 1000).toFixed(1)}s</span>
      </div>

      {notice && <div className="notice">{notice}</div>}
    </header>
  );
}
