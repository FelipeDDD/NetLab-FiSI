import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { getSession } from '../terminals';
import { clampDockHeight, dockHeightBounds, observeTerminalSize, readDockHeight, saveDockHeight } from './terminalDockLayout';

function TerminalPane({ deviceId, active }: { deviceId: string; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusRequest = useStore((s) => s.terminalFocusRequest);

  useLayoutEffect(() => {
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice) || !ref.current) return;
    // The store owns session lifetime; mounting/moving a pane only attaches it.
    const session = getSession(device);
    if (!session.opened) {
      session.term.open(ref.current);
      session.opened = true;
    } else if (session.term.element && session.term.element.parentElement !== ref.current) {
      ref.current.appendChild(session.term.element);
    }
  }, [deviceId]);

  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    return observeTerminalSize(ref.current, () => session.fit.fit());
  }, [active, deviceId]);

  useEffect(() => {
    if (!active) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    session.term.focus();
  }, [active, deviceId, focusRequest]);

  return <div ref={ref} className="term-host" role="tabpanel" id={`terminal-panel-${deviceId}`} aria-labelledby={`terminal-tab-${deviceId}`} style={{ display: active ? 'block' : 'none' }} />;
}

export function TerminalDock() {
  const terminals = useStore((s) => s.terminals);
  const activeTerminal = useStore((s) => s.activeTerminal);
  const setActiveTerminal = useStore((s) => s.setActiveTerminal);
  const closeTerminal = useStore((s) => s.closeTerminal);
  const [preferredHeight, setPreferredHeight] = useState(readDockHeight);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number; height: number } | null>(null);
  useStore((s) => s.uiPulse); // pick up device renames in tab labels

  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const height = clampDockHeight(preferredHeight, viewportHeight);
  const bounds = dockHeightBounds(viewportHeight);
  const changeHeight = (next: number) => {
    const clamped = clampDockHeight(next, window.innerHeight);
    setPreferredHeight(clamped);
    return clamped;
  };
  const finishResize = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    saveDockHeight(changeHeight(drag.current.height));
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const resizeWithKeyboard = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (e.key) {
      case 'ArrowUp': next = height + (e.shiftKey ? 50 : 10); break;
      case 'ArrowDown': next = height - (e.shiftKey ? 50 : 10); break;
      case 'Home': next = bounds.min; break;
      case 'End': next = bounds.max; break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    saveDockHeight(changeHeight(next));
  };

  if (!terminals.length) return null;

  return (
    <div className="terminal-dock" style={{ height }}>
      <div
        className="terminal-resizer"
        role="separator"
        tabIndex={0}
        aria-label="Resize terminal dock"
        aria-orientation="horizontal"
        aria-controls="terminal-body"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={height}
        aria-valuetext={`${height} pixels`}
        title="Drag to resize. Use Up/Down arrows, Home or End."
        onKeyDown={resizeWithKeyboard}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { pointerId: e.pointerId, startY: e.clientY, startHeight: height, height };
        }}
        onPointerMove={(e) => {
          const current = drag.current;
          if (current?.pointerId !== e.pointerId) return;
          current.height = changeHeight(current.startHeight + current.startY - e.clientY);
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={finishResize}
      />
      <div className="terminal-tabs" role="tablist" aria-label="Device terminals">
        {terminals.map((id) => {
          const name = sim.net.devices.get(id)?.name ?? id;
          return (
            <div className="terminal-tab-group" key={id}>
              <button
                type="button"
                id={`terminal-tab-${id}`}
                role="tab"
                aria-selected={id === activeTerminal}
                aria-controls={`terminal-panel-${id}`}
                tabIndex={id === activeTerminal ? 0 : -1}
                className={`terminal-tab${id === activeTerminal ? ' active' : ''}`}
                onClick={() => setActiveTerminal(id)}
                onKeyDown={(e) => {
                  const index = terminals.indexOf(id);
                  let next: string | undefined;
                  if (e.key === 'ArrowRight') next = terminals[(index + 1) % terminals.length];
                  else if (e.key === 'ArrowLeft') next = terminals[(index - 1 + terminals.length) % terminals.length];
                  else if (e.key === 'Home') next = terminals[0];
                  else if (e.key === 'End') next = terminals[terminals.length - 1];
                  if (!next) return;
                  e.preventDefault();
                  e.stopPropagation();
                  // Manual activation: Enter/Space opens the focused tab.
                  document.getElementById(`terminal-tab-${next}`)?.focus();
                }}
              >
                <span>{name}</span>
              </button>
              <button
                className="tab-close"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(id);
                }}
                title={`Close terminal for ${name}`}
                aria-label={`Close terminal for ${name}`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="terminal-body" id="terminal-body">
        {terminals.map((id) => (
          <TerminalPane key={id} deviceId={id} active={id === activeTerminal} />
        ))}
      </div>
    </div>
  );
}
