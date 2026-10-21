import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { getSession } from '../terminals';
import { MIN_TERMINAL_PANEL_WIDTH, TERMINAL_GROUP_LABELS, type TerminalPanel } from '../terminalPanels';
import { terminalAuroraColors, terminalFlowColors, terminalBackground, terminalColor, terminalFontFamily, terminalTabPalette } from '../terminalAppearance';
import { TerminalColorButton } from './TerminalAppearanceControls';
import { attachTerminalSession, observeTerminalSize } from './terminalDockLayout';
import { TerminalPanelMoveHandle, TerminalTabMoveMenu, useTerminalTabMovement } from './TerminalTabMovement';
import { restorePresentationSelection } from '../terminalPresentationSelection';
import { isTerminalEffect } from '../terminalEffects';

function TerminalSessionView({ deviceId, visible, focused, suspended }: { deviceId: string; visible: boolean; focused: boolean; suspended: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusRequest = useStore((s) => s.terminalFocusRequest);
  const preference = useStore((s) => s.terminalAppearance);
  const custom = useStore((s) => s.terminalColors[deviceId]);
  const kind = sim.net.devices.get(deviceId)?.kind ?? 'host';
  const color = terminalColor(kind, custom);
  const background = useMemo(() => terminalBackground(color, preference, kind), [color, preference, kind]);

  useLayoutEffect(() => {
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice) || !ref.current) return;
    attachTerminalSession(getSession(device), ref.current);
    // Unmount only detaches presentation. The store owns definitive disposal.
  }, [deviceId]);

  useLayoutEffect(() => {
    if (suspended) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    if (session.term.options.fontSize !== preference.fontSize) session.term.options.fontSize = preference.fontSize;
    const family = terminalFontFamily(preference.fontFamily);
    if (session.term.options.fontFamily !== family) session.term.options.fontFamily = family;
  }, [deviceId, preference.fontSize, preference.fontFamily, suspended]);

  useLayoutEffect(() => {
    if (suspended || !visible || !ref.current) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    // Refit explicitly on a font change: the host can keep the same pixel size.
    // Hidden tabs receive the preference above and fit when shown again.
    return observeTerminalSize(ref.current, () => {
      session.fit.fit();
      restorePresentationSelection(session.term);
    });
  }, [visible, deviceId, preference.fontSize, preference.fontFamily, suspended]);

  useEffect(() => {
    if (suspended || !visible || !focused) return;
    const device = sim.net.devices.get(deviceId);
    if (device instanceof IpDevice) {
      const term = getSession(device).term;
      term.focus();
      restorePresentationSelection(term);
    }
  }, [visible, focused, deviceId, focusRequest, suspended]);

  return <div ref={ref} className="term-host" data-terminal-device={deviceId} role="tabpanel"
    data-terminal-effect={isTerminalEffect(preference.style) ? '' : undefined}
    id={`terminal-panel-${deviceId}`} aria-labelledby={`terminal-tab-${deviceId}`}
    style={{ display: visible ? 'block' : 'none', backgroundImage: background }} />;
}

function TerminalTab({ id, panel }: { id: string; panel: TerminalPanel }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const movement = useTerminalTabMovement();
  const device = sim.net.devices.get(id);
  const custom = useStore((s) => s.terminalColors[id]);
  const name = device?.name ?? id;
  const selected = id === panel.active;
  const color = terminalColor(device?.kind ?? 'host', custom);
  const tabStyle = useMemo(() => {
    const palette = terminalTabPalette(color);
    return {
      '--terminal-tab-color': color,
      '--terminal-tab-border': color + '80',
      '--terminal-tab-tint': palette.active,
      '--terminal-tab-hover-tint': palette.hover,
      '--terminal-tab-active-hover-tint': palette.activeHover,
    } as CSSProperties;
  }, [color]);
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
  const before = movement.target?.allowed && movement.target.panelId === panel.id && movement.target.beforeId === id;
  return <div ref={ref} className={`terminal-tab-group${selected ? ' is-active' : ''}${movement.dragging === id ? ' is-dragging' : ''}${before ? ' is-drop-before' : ''}`} data-terminal-device={id} data-terminal-tab={id} style={tabStyle}>
    {device instanceof IpDevice && <TerminalColorButton device={device} color={color} />}
    <button ref={anchor} type="button" id={`terminal-tab-${id}`} role="tab" aria-selected={selected} draggable
      aria-controls={`terminal-panel-${id}`} tabIndex={selected ? 0 : -1}
      className={`terminal-tab${selected ? ' active' : ''}`} title={`${name} — Drag to move; right-click or Shift+F10 for move options`}
      aria-description="Drag to move. Press Shift+F10 for move options."
      onDragStart={(event) => movement.start(event, id)} onDragEnd={movement.end}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setMenu(true); }}
      onClick={() => useStore.getState().setActiveTerminal(id)}
      onKeyDown={(event) => {
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
          event.preventDefault(); event.stopPropagation(); setMenu(true); return;
        }
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
    {menu && <TerminalTabMoveMenu id={id} panel={panel} anchor={anchor} onClose={() => setMenu(false)} />}
  </div>;
}

export function TerminalPanelView({ panel, index, focused, width, suspended }: { panel: TerminalPanel; index: number; focused: boolean; width: number; suspended: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const style = useStore((s) => s.terminalAppearance.style);
  const custom = useStore((s) => s.terminalColors[panel.active]);
  const kind = sim.net.devices.get(panel.active)?.kind ?? 'host';
  const color = terminalColor(kind, custom);
  const aurora = useMemo(() => style === 'aurora-flow' || isTerminalEffect(style) ? terminalFlowColors(color, kind)
    : style === 'aurora-lines' ? terminalAuroraColors(color) : null, [style, color, kind]);
  const focusRequest = useStore((s) => s.terminalFocusRequest);
  const movement = useTerminalTabMovement();
  const target = movement.target?.panelId === panel.id ? movement.target : null;
  useEffect(() => {
    if (suspended || !focused || !ref.current) return;
    const show = () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    show();
    // Keep the focused pane visible when a narrow dock starts scrolling.
    const observer = new ResizeObserver(show);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [focused, focusRequest, suspended]);

  return <section ref={ref} id={panel.id} data-terminal-pane="" data-terminal-style={style} data-terminal-effect={isTerminalEffect(style) ? '' : undefined} role="group" aria-label={`Terminal panel ${index + 1}`}
    className={`terminal-pane${focused ? ' is-focused' : ''}${movement.panelDragging === panel.id ? ' is-dragging-panel' : ''}${target ? target.allowed ? ' is-drop-target' : ' is-drop-forbidden' : ''}`}
    style={{ flex: `0 0 ${width}px`, minWidth: MIN_TERMINAL_PANEL_WIDTH,
      ...(aurora ? { '--terminal-aurora-start': aurora.primary + 'b3', '--terminal-aurora-end': aurora.secondary + '80' } : {}),
    } as CSSProperties}>
    <div className="terminal-panel-header">
      {panel.kind && <div className="terminal-panel-type">{TERMINAL_GROUP_LABELS[panel.kind]}</div>}
      <TerminalPanelMoveHandle panel={panel} index={index} />
      <div className="terminal-tabs" role="tablist" aria-label={`Terminal panel ${index + 1} tabs`}
        aria-keyshortcuts="Alt+Shift+ArrowRight Alt+Shift+ArrowLeft Control+Tab Control+Shift+Tab Control+PageDown Control+PageUp"
        title="Switch all terminals: Alt+Shift+Left/Right. Ctrl+Tab or Ctrl+PageUp/PageDown where the browser allows it.">
        {panel.tabs.map((id) => <TerminalTab key={id} id={id} panel={panel} />)}
      </div>
      <button type="button" className="terminal-panel-lock" aria-pressed={panel.lockedWidth !== undefined}
        title={panel.lockedWidth === undefined ? 'Lock panel width' : 'Unlock panel width'}
        aria-label={`${panel.lockedWidth === undefined ? 'Lock' : 'Unlock'} panel width — panel ${index + 1}`}
        onClick={() => useStore.getState().toggleTerminalPanelLock(panel.id, Object.fromEntries(useStore.getState().terminalPanels.map((item) => [
          item.id, document.getElementById(item.id)?.getBoundingClientRect().width ?? 0,
        ])))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d={panel.lockedWidth === undefined ? 'M8 10V7a4 4 0 0 1 8 0' : 'M8 10V7a4 4 0 0 1 8 0v3'} />
        </svg>
      </button>
    </div>
    <div className="terminal-pane-content">
      {panel.tabs.map((id) => <TerminalSessionView key={id} deviceId={id} visible={id === panel.active} focused={focused && id === panel.active} suspended={suspended} />)}
    </div>
  </section>;
}
