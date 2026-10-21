import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PacketInspectorPreference } from '../packetInspectorLayout';

export function ResizablePacketPanel({ open, layout, min, max, width, onResize, children }: {
  open: boolean; layout: PacketInspectorPreference; min: number; max: number; width: number;
  onResize: (width: number, persist: boolean) => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number; last: number; moved: boolean }>();
  const callback = useRef(onResize); callback.current = onResize;
  const [resizing, setResizing] = useState(false);
  const finish = useCallback(() => {
    const current = drag.current; if (!current) return;
    drag.current = undefined; setResizing(false);
    if (current.moved) callback.current(current.last, true);
  }, []);
  useEffect(() => { finish(); }, [open, layout.side, layout.mode, min, max, finish]);
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => { window.removeEventListener('blur', finish); finish(); };
  }, [finish]);
  useEffect(() => {
    if (!resizing) return;
    document.body.classList.add('packet-panel-resizing');
    return () => document.body.classList.remove('packet-panel-resizing');
  }, [resizing]);
  const clamp = (next: number) => Math.round(Math.max(min, Math.min(max, next)));
  const direction = layout.side === 'right' ? -1 : 1;
  return <div ref={panel} className={`packet-panel-shell${resizing ? ' is-resizing' : ''}`} hidden={!open}>
    <div role="separator" tabIndex={0} className="packet-resizer" aria-label="Resize Packet Inspector"
      aria-orientation="vertical" aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={width}
      aria-valuetext={`${width} pixels`} title="Drag to resize. Left/Right: 5 px, Shift: 20 px. Home/End: width limits."
      onBlur={finish} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 20 : 5;
        const next = event.key === 'ArrowRight' ? width + direction * step : event.key === 'ArrowLeft' ? width - direction * step
          : event.key === 'Home' ? min : event.key === 'End' ? max : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation(); callback.current(clamp(next), true);
      }} onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const actual = panel.current?.getBoundingClientRect().width ?? width;
        drag.current = { pointer: event.pointerId, x: event.clientX, width: actual, last: actual, moved: false };
        setResizing(true);
      }} onPointerMove={event => {
        const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        if (event.clientX === current.x && !current.moved) return;
        current.moved = true; current.last = clamp(current.width + direction * (event.clientX - current.x));
        callback.current(current.last, false);
      }} onPointerUp={event => {
        if (drag.current?.pointer !== event.pointerId) return;
        finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={finish} onLostPointerCapture={finish} />
    {children}
  </div>;
}
