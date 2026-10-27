import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { PACKET_ANIMATION_BASE_MS } from '../packetAnimation';
import { clampPacketWidget, readPacketAnimationPlacement, savePacketAnimationPlacement, type PacketAnimationPlacement } from '../packetAnimationWidget';
import { useStore } from '../store';
import { FloatingPopover } from './FloatingPopover';
import { GuidedPacketControls } from './GuidedPacketControls';

export function PacketAnimationControl({ initialPlacement, menuAnchor, settingsOpen = false, onSettingsClose }: {
  initialPlacement?: PacketAnimationPlacement;
  menuAnchor?: RefObject<HTMLElement>;
  settingsOpen?: boolean;
  onSettingsClose?: () => void;
}) {
  const mode = useStore((s) => s.packetVisualizationMode);
  const modeLabel = mode === 'live' ? 'Live' : 'Schrittmodus';
  const [controlsOpen, setControlsOpen] = useState(false);
  const modeButton = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState(() => readPacketAnimationPlacement(initialPlacement));
  const widget = useRef<HTMLDivElement>(null), handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean; last: PacketAnimationPlacement } | null>(null);
  const clamp = (x: number, y: number) => clampPacketWidget({ x, y }, { width: window.innerWidth, height: window.innerHeight },
    { width: widget.current?.offsetWidth || 234,
      height: widget.current?.offsetHeight ? widget.current.offsetHeight + (widget.current.classList.contains('is-floating') ? 0 : 8) : 43 });
  useLayoutEffect(() => {
    const resize = () => setPlacement((current) => {
      if (current.mode !== 'floating') return current;
      const next = clamp(current.x, current.y);
      if (next.mode === 'floating' && next.x === current.x && next.y === current.y) return current;
      savePacketAnimationPlacement(next); return next;
    });
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const dock = () => {
    const next = { mode: 'toolbar' } as const;
    setPlacement(next); savePacketAnimationPlacement(next);
    (menuAnchor?.current ?? handle.current)?.focus({ preventScroll: true });
  };
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (current.moved) savePacketAnimationPlacement(current.last);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={widget} className={`packet-animation-widget${placement.mode === 'floating' ? ' is-floating' : menuAnchor ? ' is-menu-docked' : ''}`}
    style={placement.mode === 'floating' ? { left: placement.x, top: placement.y } : undefined}>
    <button ref={handle} type="button" className="packet-animation-handle" aria-label="Move packet animation control"
      title={menuAnchor ? 'Drag to move. Arrow keys move; Home restores Packets.' : 'Drag to move. Arrow keys move; Home restores the toolbar.'}
      onKeyDown={(event) => {
        if (event.key === 'Home') { event.preventDefault(); dock(); return; }
        const delta: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
        if (!delta[event.key]) return;
        event.preventDefault(); event.stopPropagation();
        const bounds = widget.current!.getBoundingClientRect(), [dx, dy] = delta[event.key];
        const next = clamp(bounds.left + dx, bounds.top + dy); setPlacement(next); savePacketAnimationPlacement(next);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const bounds = widget.current!.getBoundingClientRect();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, moved: false, last: placement };
      }} onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.moved && Math.hypot(dx, dy) < 5) return;
        current.moved = true; current.last = clamp(current.left + dx, current.top + dy); setPlacement(current.last);
      }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>⠿</button>
    <div className="packet-animation-control">
      <span className="packet-animation-label">Paketdarstellung</span>
      <button ref={modeButton} type="button" className="packet-animation-mode" aria-label={`Paketdarstellung: ${modeLabel}`}
        aria-haspopup="dialog" aria-expanded={controlsOpen} aria-controls={controlsOpen ? 'packet-visualization-settings' : undefined}
        aria-describedby="packet-animation-help" onClick={() => setControlsOpen(!controlsOpen)}>{modeLabel} ▾</button>
      <span className="packet-animation-timing">{PACKET_ANIMATION_BASE_MS[mode]} ms/Link</span>
      <span id="packet-animation-help" className="sr-only">Nur Darstellung. Simulationsuhr, Ping-Intervalle und Protokolle laufen im normalen Tempo. {mode === 'guided'
        ? 'Schrittmodus zeigt ARP und ICMP mit Step und Replay.' : 'Live zeigt unabhängige Übertragungen parallel und erkannte Antworten nach ihrer Anfrage.'}</span>
    </div>
    <button type="button" className="packet-animation-restore" style={{ visibility: placement.mode === 'floating' ? 'visible' : 'hidden' }}
      disabled={placement.mode !== 'floating'} title={menuAnchor ? 'Restore to Packets' : 'Restore to toolbar'}
      aria-label={menuAnchor ? 'Restore packet animation to Packets' : 'Restore packet animation to toolbar'} onClick={dock}>↶</button>
    {(settingsOpen || controlsOpen) && <FloatingPopover anchor={settingsOpen && menuAnchor ? menuAnchor : modeButton}
      onClose={() => { setControlsOpen(false); onSettingsClose?.(); }}
      id="packet-visualization-settings" label="Paketdarstellung" width={310} className="packet-visualization-settings">
      <h2 className="toolbar-dialog-title">Paketdarstellung</h2>
      <p>Live: {PACKET_ANIMATION_BASE_MS.live} ms/Link. Schrittmodus: {PACKET_ANIMATION_BASE_MS.guided} ms/Link mit Step und Replay. Die Simulation läuft im normalen Tempo; Paketintervalle bleiben unverändert.</p>
      <div role="group" aria-label="Paketdarstellung" className="guided-playback-actions">
        <button type="button" className="btn" aria-pressed={mode === 'live'} onClick={() => useStore.getState().setPacketVisualizationMode('live')}>Live</button>
        <button type="button" className="btn" aria-pressed={mode === 'guided'} onClick={() => {
          const state = useStore.getState();
          if (state.packetVisualizationMode === 'guided') return;
          state.setPacketVisualizationMode('guided');
        }}>Schrittmodus</button>
      </div>
      {mode === 'guided' ? <GuidedPacketControls /> : <p>Live: flüssiger Netzwerkverkehr. Erkannte Antworten folgen ihrer Anfrage; unabhängige Übertragungen bleiben parallel.</p>}
      {menuAnchor && <button type="button" className="btn" onClick={() => {
        if (placement.mode === 'floating') { dock(); return; }
        const next = clamp(window.innerWidth - 260, 70);
        setPlacement(next); savePacketAnimationPlacement(next);
      }}>{placement.mode === 'floating' ? 'Steuerung zu Packets zurücksetzen' : 'Schwebende Steuerung anzeigen'}</button>}
    </FloatingPopover>}
  </div>;
}
