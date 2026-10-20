import { useId, useRef, useState } from 'react';
import { IpDevice } from '../engine/ipdevice';
import { sim } from '../sim';
import { useStore } from '../store';
import { terminalColor, TERMINAL_FONTS, type TerminalFont } from '../terminalAppearance';
import { FloatingPopover } from './FloatingPopover';
import type { TerminalLayoutMode } from '../terminalPanels';

export function TerminalSettingsControls({ initialDeviceId, includeLayout = false }: { initialDeviceId?: string; includeLayout?: boolean }) {
  const intensityId = useId();
  const nodes = useStore((s) => s.nodes);
  useStore((s) => s.uiPulse); // Keep device names current without subscribing to every tick.
  const [selected, setSelected] = useState(initialDeviceId ?? useStore.getState().activeTerminal);
  const devices = nodes.map((node) => sim.net.devices.get(node.id)).filter((device): device is IpDevice => device instanceof IpDevice);
  const device = devices.find((item) => item.id === selected) ?? devices[0];
  const custom = useStore((s) => device ? s.terminalColors[device.id] : undefined);
  const setColor = useStore((s) => s.setTerminalColor);
  const preference = useStore((s) => s.terminalAppearance);
  const setPreference = useStore((s) => s.setTerminalAppearance);
  const layoutMode = useStore((s) => s.terminalLayoutMode);
  const color = device ? terminalColor(device.kind, custom) : '';
  return (
    <div className="terminal-appearance">
      {includeLayout && <section className="terminal-settings-layout">
        <h3>Layout</h3>
        <label className="terminal-style-label">
          Organization
          <select value={layoutMode} onChange={(e) => useStore.getState().setTerminalLayoutMode(e.target.value as TerminalLayoutMode)}>
            <option value="free">Free panels</option>
            <option value="by-type">Group by type</option>
          </select>
        </label>
        <span className="hint">Widths and locks are remembered separately for each mode. Sessions keep running.</span>
      </section>}
      <section>
      <h3>Appearance</h3>
      {device && <>
      <label className="terminal-style-label">
        Device color
        <select value={device.id} onChange={(e) => setSelected(e.target.value)}>
          {devices.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}
        </select>
      </label>
      <div className="terminal-color-controls">
        <label className="terminal-color-label">
          <input type="color" value={color} aria-label={`Terminal color for ${device.name}`}
            onChange={(e) => setColor(device.id, e.target.value)} />
          <span>Color <code>{color}</code></span>
        </label>
        <button type="button" className="btn" disabled={!custom}
          onClick={() => setColor(device.id, null)}>Restore color</button>
      </div>
      <span className="hint">{custom ? 'Custom color' : `Default for ${device.kind}`}.</span>
      </>}
      <label className="terminal-style-label">
        Background style
        <select value={preference.style} onChange={(e) => setPreference({ style: e.target.value as 'diagonal' | 'dual-glow' })}>
          <option value="diagonal">Diagonal</option>
          <option value="dual-glow">Dual Glow</option>
        </select>
      </label>
      <label className="terminal-intensity-label" htmlFor={intensityId}>
        <span>Intensity <output>{preference.intensity}%</output></span>
        <input id={intensityId} type="range" min={0} max={100} step={1} value={preference.intensity}
          onChange={(e) => setPreference({ intensity: Number(e.target.value) })} />
      </label>
      <label className="terminal-style-label">
        Terminal font family
        <select value={preference.fontFamily} onChange={(e) => setPreference({ fontFamily: e.target.value as TerminalFont })}>
          {Object.entries(TERMINAL_FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
        </select>
      </label>
      <span className="hint">Local fonts only. Unavailable fonts use a monospace fallback.</span>
      <label className="terminal-style-label">
        Terminal font size
        <select value={preference.fontSize} onChange={(e) => setPreference({ fontSize: Number(e.target.value) })}>
          {[12, 13, 14, 15, 16, 17, 18].map((size) => <option key={size} value={size}>{size} px{size === 13 ? ' (original)' : ''}</option>)}
        </select>
      </label>
      <span className="hint">Background and font apply to all terminals. Colors remain individual.</span>
      <div className="terminal-settings-reset">
        <button type="button" className="btn" onClick={() => useStore.getState().resetTerminalAppearance()}>Restore defaults</button>
        <span className="hint">Resets appearance and all device colors in this topology. Sessions stay open.</span>
      </div>
      </section>
    </div>
  );
}
export function TerminalColorButton({ device, color }: { device: IpDevice; color: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = `terminal-appearance-${device.id}`;
  return <>
    <button ref={anchor} type="button" className="terminal-color-trigger"
      title={`Customize terminal for ${device.name}`} aria-label={`Customize terminal for ${device.name}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)}>
      <span className="terminal-color-dot" aria-hidden="true" style={{ backgroundColor: color }} />
    </button>
    {open && <FloatingPopover anchor={anchor} id={id} label={`Terminal appearance for ${device.name}`}
      className="terminal-appearance-popup" onClose={() => setOpen(false)}>
      <TerminalSettingsControls initialDeviceId={device.id} />
    </FloatingPopover>}
  </>;
}

export function TerminalSettingsButton() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchor} type="button" className="terminal-settings-trigger"
      aria-label="Terminal settings" title="Terminal settings"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'terminal-settings' : undefined}
      onClick={() => setOpen(!open)}>
      <span aria-hidden="true">⚙</span> Settings
    </button>
    {open && <FloatingPopover anchor={anchor} id="terminal-settings" label="Terminal settings"
      className="terminal-appearance-popup" width={320} preferredSide="above" onClose={() => setOpen(false)}>
      <TerminalSettingsControls includeLayout />
    </FloatingPopover>}
  </>;
}
