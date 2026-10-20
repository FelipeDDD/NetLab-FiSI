import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MIN_TERMINAL_PANEL_WIDTH, resizablePanelPair, resizePanelPair, type TerminalPanel } from '../terminalPanels';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { getSession } from '../terminals';
import { capturePresentationSelection } from '../terminalPresentationSelection';

export function TerminalPanelSplitter({ left, right, index, suspended = false }: { left: TerminalPanel; right: TerminalPanel; index: number; suspended?: boolean }) {
  const panels = useStore((s) => s.terminalPanels);
  const pair = resizablePanelPair(panels, left.id, right.id);
  const first = pair ? panels[pair.left] : null;
  const second = pair ? panels[pair.right] : null;
  const drag = useRef<{ pointer: number; x: number; width: number; share: number; panels: TerminalPanel[]; widths: number[]; releaseSelection(): void } | null>(null);
  const [measurement, setMeasurement] = useState({ width: 0, share: 0.5 });
  const measure = () => {
    const a = first ? document.getElementById(first.id)?.getBoundingClientRect().width ?? 0 : 0;
    const b = second ? document.getElementById(second.id)?.getBoundingClientRect().width ?? 0 : 0;
    return { width: a + b, share: a + b ? a / (a + b) : 0.5 };
  };
  useLayoutEffect(() => {
    if (suspended) { drag.current?.releaseSelection(); drag.current = null; return; }
    const update = () => {
      const next = measure();
      setMeasurement((previous) => previous.width === next.width && previous.share === next.share ? previous : next);
    };
    const observer = new ResizeObserver(update);
    const a = first ? document.getElementById(first.id) : null;
    const b = second ? document.getElementById(second.id) : null;
    if (a) observer.observe(a);
    if (b) observer.observe(b);
    update();
    return () => { observer.disconnect(); drag.current?.releaseSelection(); drag.current = null; };
  }, [first?.id, second?.id, suspended]);
  const minimum = measurement.width ? Math.min(0.5, MIN_TERMINAL_PANEL_WIDTH / measurement.width) : 0.5;
  const readWidths = (items: TerminalPanel[]) => items.map((panel) => document.getElementById(panel.id)?.getBoundingClientRect().width ?? MIN_TERMINAL_PANEL_WIDTH);
  const captureSelection = (held = false) => {
    const release: (() => void)[] = [];
    for (const panel of [first, second]) for (const id of panel?.tabs ?? []) {
      const device = sim.net.devices.get(id);
      if (device instanceof IpDevice) release.push(capturePresentationSelection(getSession(device).term, held));
    }
    return () => release.forEach((done) => done());
  };
  const apply = (items: TerminalPanel[], fraction: number, width: number, widths = readWidths(items)) => {
    if (suspended || !pair || !width) return;
    useStore.getState().setTerminalPanels(resizePanelPair(items, left.id, right.id, fraction, MIN_TERMINAL_PANEL_WIDTH / width, widths));
  };
  const finish = () => { drag.current?.releaseSelection(); drag.current = null; };
  return <div className="terminal-panel-splitter" role="separator" tabIndex={pair ? 0 : -1} aria-orientation="vertical" aria-disabled={!pair}
    aria-label={`Resize terminal panels ${pair ? pair.left + 1 : index + 1} and ${pair ? pair.right + 1 : index + 2}`}
    aria-controls={first && second ? `${first.id} ${second.id}` : undefined}
    aria-valuemin={Math.round(minimum * 100)} aria-valuemax={Math.round((1 - minimum) * 100)}
    aria-valuenow={Math.round(measurement.share * 100)} aria-valuetext={`${Math.round(measurement.share * 100)}% of adjacent panels`}
    title="Resize adjacent panels. Locks protect automatic sizing only. Double-click to equalize."
    onDoubleClick={() => { captureSelection(); apply(useStore.getState().terminalPanels, 0.5, measure().width); }}
    onKeyDown={(event) => {
      if (!pair) return;
      const m = measure();
      const step = (event.shiftKey ? 50 : 10) / m.width;
      const fraction = event.key === 'ArrowLeft' ? m.share - step : event.key === 'ArrowRight' ? m.share + step
        : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
      if (fraction === null) return;
      event.preventDefault();
      event.stopPropagation();
      captureSelection();
      apply(useStore.getState().terminalPanels, fraction, m.width);
    }}
    onPointerDown={(event) => {
      if (!pair || event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const releaseSelection = captureSelection(true);
      const m = measure();
      drag.current = { pointer: event.pointerId, x: event.clientX, ...m, panels, widths: readWidths(panels), releaseSelection };
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (start?.pointer !== event.pointerId) return;
      apply(start.panels, start.share + (event.clientX - start.x) / start.width, start.width, start.widths);
    }}
    onPointerUp={(event) => {
      finish();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={finish} onLostPointerCapture={finish} />;
}
