import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { getSession } from '../terminals';

function TerminalPane({ deviceId, active }: { deviceId: string; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice) || !ref.current) return;
    const session = getSession(device, {
      onAfterCommand: () => useStore.getState().refresh(),
    });
    if (!session.opened) {
      session.term.open(ref.current);
      session.opened = true;
    } else if (session.term.element && session.term.element.parentElement !== ref.current) {
      ref.current.appendChild(session.term.element);
    }
    session.fit.fit();
  }, [deviceId]);

  useEffect(() => {
    if (!active) return;
    const device = sim.net.devices.get(deviceId);
    if (!(device instanceof IpDevice)) return;
    const session = getSession(device);
    session.fit.fit();
    session.term.focus();
  }, [active, deviceId]);

  return <div ref={ref} className="term-host" style={{ display: active ? 'block' : 'none' }} />;
}

export function TerminalDock() {
  const terminals = useStore((s) => s.terminals);
  const activeTerminal = useStore((s) => s.activeTerminal);
  const setActiveTerminal = useStore((s) => s.setActiveTerminal);
  const closeTerminal = useStore((s) => s.closeTerminal);
  useStore((s) => s.uiPulse); // pick up device renames in tab labels

  if (!terminals.length) return null;

  return (
    <div className="terminal-dock">
      <div className="terminal-tabs">
        {terminals.map((id) => {
          const name = sim.net.devices.get(id)?.name ?? id;
          return (
            <div
              key={id}
              className={`terminal-tab${id === activeTerminal ? ' active' : ''}`}
              onClick={() => setActiveTerminal(id)}
            >
              <span>{name}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(id);
                }}
                title="Close terminal"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="terminal-body">
        {terminals.map((id) => (
          <TerminalPane key={id} deviceId={id} active={id === activeTerminal} />
        ))}
      </div>
    </div>
  );
}
