import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { PACKET_ANIMATION_SPEEDS } from '../packetAnimation';
import { clampPacketWidget, readPacketAnimationPlacement, savePacketAnimationPlacement, type PacketAnimationPlacement } from '../packetAnimationWidget';
import { useStore } from '../store';
import { FloatingPopover } from './FloatingPopover';
import { GuidedPacketControls } from './GuidedPacketControls';

export function PacketAnimationControl({ initialPlacement }: { initialPlacement?: PacketAnimationPlacement }) {
  const speed = useStore((s) => s.packetAnimationSpeed);
  const mode = useStore((s) => s.packetVisualizationMode);
  const [controlsOpen, setControlsOpen] = useState(false);
  const modeButton = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState(() => readPacketAnimationPlacement(initialPlacement));
  const widget = useRef<HTMLDivElement>(null), handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean; last: PacketAnimationPlacement } | null>(null);
  const clamp = (x: number, y: number) => clampPacketWidget({ x, y }, { width: window.innerWidth, height: window.innerHeight },
    { width: widget.current?.offsetWidth ?? 234,
      height: widget.current ? widget.current.offsetHeight + (widget.current.classList.contains('is-floating') ? 0 : 8) : 43 });
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
    setPlacement(next); savePacketAnimationPlacement(next); handle.current?.focus({ preventScroll: true });
  };
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (current.moved) savePacketAnimationPlacement(current.last);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={widget} className={`packet-animation-widget${placement.mode === 'floating' ? ' is-floating' : ''}`}
    style={placement.mode === 'floating' ? { left: placement.x, top: placement.y } : undefined}>
    <button ref={handle} type="button" className="packet-animation-handle" aria-label="Move packet animation control"
      title="Drag to move. Arrow keys move; Home restores the toolbar."
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
      <label htmlFor="packet-animation-speed" title="Visual speed only. Identified forwarding hops animate in sequence; replies are independent.">Packet animation</label>
      <button ref={modeButton} type="button" className="packet-animation-mode" aria-label={`Packet visualization: ${mode === 'live' ? 'Live' : 'Guided'}`}
        aria-haspopup="dialog" aria-expanded={controlsOpen} aria-controls={controlsOpen ? 'packet-visualization-settings' : undefined}
        onClick={() => setControlsOpen(!controlsOpen)}>{mode === 'live' ? 'Live' : 'Guided'} ▾</button>
      <input id="packet-animation-speed" type="range" min={0} max={PACKET_ANIMATION_SPEEDS.length - 1} step={1}
        value={PACKET_ANIMATION_SPEEDS.indexOf(speed as typeof PACKET_ANIMATION_SPEEDS[number])}
        aria-describedby="packet-animation-help" aria-valuetext={`${speed}× visual speed`}
        onChange={(event) => useStore.getState().setPacketAnimationSpeed(PACKET_ANIMATION_SPEEDS[Number(event.target.value)])} />
      <output htmlFor="packet-animation-speed">{speed}×</output>
      <span id="packet-animation-help" className="sr-only">Packet animation speed; 1× is one second per link. Network timing is unchanged. {mode === 'guided'
        ? 'Guided replays up to four requests and replies from one ping session.' : 'Untracked packets and replies animate independently.'}</span>
    </div>
    <button type="button" className="packet-animation-restore" style={{ visibility: placement.mode === 'floating' ? 'visible' : 'hidden' }}
      disabled={placement.mode !== 'floating'} title="Restore to toolbar" aria-label="Restore packet animation to toolbar" onClick={dock}>↶</button>
    {controlsOpen && <FloatingPopover anchor={modeButton} onClose={() => setControlsOpen(false)}
      id="packet-visualization-settings" label="Packet visualization" width={310} className="packet-visualization-settings">
      <div role="group" aria-label="Visualization mode" className="guided-playback-actions">
        <button type="button" className="btn" aria-pressed={mode === 'live'} onClick={() => useStore.getState().setPacketVisualizationMode('live')}>Live</button>
        <button type="button" className="btn" aria-pressed={mode === 'guided'} onClick={() => {
          const state = useStore.getState();
          if (state.packetVisualizationMode === 'guided') return;
          state.setPacketVisualizationMode('guided');
          state.observeNextGuidedPacket();
        }}>Guided</button>
      </div>
      {mode === 'guided' ? <GuidedPacketControls /> : <p>Live: simultaneous packet animations. Network timing is unchanged.</p>}
    </FloatingPopover>}
  </div>;
}
