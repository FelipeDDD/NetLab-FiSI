import { useRef, useState } from 'react';
import { useStore } from '../store';
import { LABS } from '../labs/library';

export function Toolbar() {
  const [labsOpen, setLabsOpen] = useState(false);
  const loadBundledLab = useStore((s) => s.loadBundledLab);
  const clock = useStore((s) => s.clock);
  const paused = useStore((s) => s.paused);
  const speed = useStore((s) => s.speed);
  const notice = useStore((s) => s.notice);
  const setPaused = useStore((s) => s.setPaused);
  const setSpeed = useStore((s) => s.setSpeed);
  const newTopology = useStore((s) => s.newTopology);
  const loadDemo = useStore((s) => s.loadDemo);
  const exportJson = useStore((s) => s.exportJson);
  const importJson = useStore((s) => s.importJson);
  const shareUrl = useStore((s) => s.shareUrl);
  const setNotice = useStore((s) => s.setNotice);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const err = importJson(await f.text());
    if (err) setNotice(`Import failed: ${err}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-name">NetSim</span>
        <span className="brand-sub">real Linux syntax · in your browser</span>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={() => newTopology()}>
          New
        </button>
        <button className="btn" onClick={() => loadDemo()}>
          Demo
        </button>
        <div className="labs-menu-wrap">
          <button className="btn" onClick={() => setLabsOpen((v) => !v)}>
            Labs ▾
          </button>
          {labsOpen && (
            <div className="labs-menu" onMouseLeave={() => setLabsOpen(false)}>
              {LABS.map((l, i) => (
                <button
                  key={l.lab!.id}
                  className="labs-menu-item"
                  onClick={() => {
                    loadBundledLab(i);
                    setLabsOpen(false);
                  }}
                >
                  <span className="labs-menu-title">{l.lab!.title}</span>
                  <span className="labs-menu-blurb">{l.lab!.blurb}</span>
                </button>
              ))}
              <div className="labs-menu-note">Loading a lab replaces the current canvas.</div>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button className="btn" onClick={() => exportJson()}>
          Export
        </button>
        <button className="btn" onClick={() => shareUrl()}>
          Share link
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <div className="toolbar-group sim-controls">
        <button className="btn" onClick={() => setPaused(!paused)} title={paused ? 'Resume' : 'Pause'}>
          {paused ? '▶ Run' : '⏸ Pause'}
        </button>
        <select className="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
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
