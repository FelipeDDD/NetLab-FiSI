import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { getSession } from '../terminals';
import { MIN_TERMINAL_PANEL_WIDTH, TERMINAL_GROUP_LABELS, type TerminalPanel } from '../terminalPanels';
import { terminalBackground, terminalColor, terminalFontFamily, terminalTint } from '../terminalAppearance';
import { TerminalColorButton } from './TerminalAppearanceControls';
import { attachTerminalSession, observeTerminalSize } from './terminalDockLayout';

function TerminalSessionView({ deviceId, visible, focused }: { deviceId: string; visible: boolean; focused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusRequest = useStore((s) => s.terminalFocusRequest);
  const preference = useStore((s) => s.terminalAppearance);
  const custom = useStore((s) => s.terminalColors[deviceId]);
  const color = terminalColor(sim.net.devices.get(deviceId)?.kind ?? 'host', custom);
  const background = useMemo(() => terminalBackground(color, preference), [color, preference]);

  useLayoutEffect(() => {
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice) || !ref.current) return;
    attachTerminalSession(getSession(device), ref.current);
    // Unmount only detaches presentation. The store owns definitive disposal.
  }, [deviceId]);

  useLayoutEffect(() => {
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    if (session.term.options.fontSize !== preference.fontSize) session.term.options.fontSize = preference.fontSize;
    const family = terminalFontFamily(preference.fontFamily);
    if (session.term.options.fontFamily !== family) session.term.options.fontFamily = family;
  }, [deviceId, preference.fontSize, preference.fontFamily]);

  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    // Refit explicitly on a font change: the host can keep the same pixel size.
    // Hidden tabs receive the preference above and fit when shown again.
    return observeTerminalSize(ref.current, () => session.fit.fit());
  }, [visible, deviceId, preference.fontSize, preference.fontFamily]);

  useEffect(() => {
    if (!visible || !focused) return;
    const device = sim.net.devices.get(deviceId);
    if (device instanceof IpDevice) getSession(device).term.focus();
  }, [visible, focused, deviceId, focusRequest]);

  return <div ref={ref} className="term-host" data-terminal-device={deviceId} role="tabpanel"
    id={`terminal-panel-${deviceId}`} aria-labelledby={`terminal-tab-${deviceId}`}
    style={{ display: visible ? 'block' : 'none', backgroundImage: background }} />;
}

function TerminalTab({ id, panel }: { id: string; panel: TerminalPanel }) {
  const ref = useRef<HTMLDivElement>(null);
  const device = sim.net.devices.get(id);
  const custom = useStore((s) => s.terminalColors[id]);
  const name = device?.name ?? id;
  const selected = id === panel.active;
  const color = terminalColor(device?.kind ?? 'host', custom);
  const tabStyle = useMemo(() => ({
    '--terminal-tab-color': color,
    '--terminal-tab-muted-color': color + '80',
    '--terminal-tab-tint': terminalTint(color, 60),
  }) as CSSProperties, [color]);
  useLayoutEffect(() => {
    if (!selected || !ref.current?.parentElement) return;
    const strip = ref.current.parentElement;
    const tab = ref.current.getBoundingClientRect();
    const viewport = strip.getBoundingClientRect();
    // Reveal the whole active tab, including its close button, without scrolling
    // another pane or the editor when the strip overflows.
    if (tab.left < viewport.left + 4) strip.scrollLeft += tab.left - viewport.left - 4;
    else if (tab.right > viewport.right - 4) strip.scrollLeft += tab.right - viewport.right + 4;
  }, [selected, name]);
  return <div ref={ref} className={`terminal-tab-group${selected ? ' is-active' : ''}`} data-terminal-device={id} style={tabStyle}>
    {device instanceof IpDevice && <TerminalColorButton device={device} color={color} />}
    <button type="button" id={`terminal-tab-${id}`} role="tab" aria-selected={selected}
      aria-controls={`terminal-panel-${id}`} tabIndex={selected ? 0 : -1}
      className={`terminal-tab${selected ? ' active' : ''}`} title={name}
      onClick={() => useStore.getState().setActiveTerminal(id)}
      onKeyDown={(event) => {
        const index = panel.tabs.indexOf(id);
        const next = event.key === 'ArrowRight' ? panel.tabs[(index + 1) % panel.tabs.length]
          : event.key === 'ArrowLeft' ? panel.tabs[(index - 1 + panel.tabs.length) % panel.tabs.length]
          : event.key === 'Home' ? panel.tabs[0] : event.key === 'End' ? panel.tabs[panel.tabs.length - 1] : null;
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        document.getElementById(`terminal-tab-${next}`)?.focus();
      }}><span>{name}</span></button>
    <button className="tab-close" type="button" title={`Close terminal for ${name}`} aria-label={`Close terminal for ${name}`}
      onClick={() => useStore.getState().closeTerminal(id)}>×</button>
  </div>;
}

export function TerminalPanelView({ panel, index, focused }: { panel: TerminalPanel; index: number; focused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const focusRequest = useStore((s) => s.terminalFocusRequest);
  useEffect(() => {
    if (!focused || !ref.current) return;
    const show = () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    show();
    // Keep the focused pane visible when a narrow dock starts scrolling.
    const observer = new ResizeObserver(show);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [focused, focusRequest]);

  return <section ref={ref} id={panel.id} data-terminal-pane="" role="group" aria-label={`Terminal panel ${index + 1}`}
    className={`terminal-pane${focused ? ' is-focused' : ''}`} style={{ flexGrow: panel.weight, minWidth: MIN_TERMINAL_PANEL_WIDTH }}>
    <div className="terminal-panel-header">
      {panel.kind && <div className="terminal-panel-type">{TERMINAL_GROUP_LABELS[panel.kind]}</div>}
      <div className="terminal-tabs" role="tablist" aria-label={`Terminal panel ${index + 1} tabs`}
        aria-keyshortcuts="Alt+Shift+ArrowRight Alt+Shift+ArrowLeft Control+Tab Control+Shift+Tab Control+PageDown Control+PageUp"
        title="Switch all terminals: Alt+Shift+Left/Right. Ctrl+Tab or Ctrl+PageUp/PageDown where the browser allows it.">
        {panel.tabs.map((id) => <TerminalTab key={id} id={id} panel={panel} />)}
      </div>
    </div>
    <div className="terminal-pane-content">
      {panel.tabs.map((id) => <TerminalSessionView key={id} deviceId={id} visible={id === panel.active} focused={focused && id === panel.active} />)}
    </div>
  </section>;
}
