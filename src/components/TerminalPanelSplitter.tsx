import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MIN_TERMINAL_PANEL_WIDTH, resizePanelPair, type TerminalPanel } from '../terminalPanels';

export function TerminalPanelSplitter({ left, right, index }: { left: TerminalPanel; right: TerminalPanel; index: number }) {
  const drag = useRef<{ pointer: number; x: number; width: number; share: number; panels: TerminalPanel[] } | null>(null);
  const [measurement, setMeasurement] = useState({ width: 0, share: 0.5 });
  const measure = () => {
    const a = document.getElementById(left.id)?.getBoundingClientRect().width ?? 0;
    const b = document.getElementById(right.id)?.getBoundingClientRect().width ?? 0;
    return { width: a + b, share: a + b ? a / (a + b) : 0.5 };
  };
  useLayoutEffect(() => {
    const update = () => {
      const next = measure();
      setMeasurement((previous) => previous.width === next.width && previous.share === next.share ? previous : next);
    };
    const observer = new ResizeObserver(update);
    const a = document.getElementById(left.id);
    const b = document.getElementById(right.id);
    if (a) observer.observe(a);
    if (b) observer.observe(b);
    update();
    return () => observer.disconnect();
  }, [left.id, right.id]);
  const minimum = measurement.width ? Math.min(0.5, MIN_TERMINAL_PANEL_WIDTH / measurement.width) : 0.5;
  const apply = (panels: TerminalPanel[], fraction: number, width: number) => {
    if (!width) return;
    useStore.getState().setTerminalPanels(resizePanelPair(panels, left.id, right.id, fraction, MIN_TERMINAL_PANEL_WIDTH / width));
  };
  const finish = () => { drag.current = null; };
  return <div className="terminal-panel-splitter" role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={`Resize terminal panels ${index + 1} and ${index + 2}`} aria-controls={`${left.id} ${right.id}`}
    aria-valuemin={Math.round(minimum * 100)} aria-valuemax={Math.round((1 - minimum) * 100)}
    aria-valuenow={Math.round(measurement.share * 100)} aria-valuetext={`${Math.round(measurement.share * 100)}% of adjacent panels`}
    title="Drag to resize panels. Left/Right arrows adjust width; Home/End reach the limits. Double-click to equalize."
    onDoubleClick={() => apply(useStore.getState().terminalPanels, 0.5, measure().width)}
    onKeyDown={(event) => {
      const m = measure();
      const step = (event.shiftKey ? 50 : 10) / m.width;
      const fraction = event.key === 'ArrowLeft' ? m.share - step : event.key === 'ArrowRight' ? m.share + step
        : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
      if (fraction === null) return;
      event.preventDefault();
      event.stopPropagation();
      apply(useStore.getState().terminalPanels, fraction, m.width);
    }}
    onPointerDown={(event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const m = measure();
      drag.current = { pointer: event.pointerId, x: event.clientX, ...m, panels: useStore.getState().terminalPanels };
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (start?.pointer !== event.pointerId) return;
      apply(start.panels, start.share + (event.clientX - start.x) / start.width, start.width);
    }}
    onPointerUp={(event) => {
      finish();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={finish} onLostPointerCapture={finish} />;
}
