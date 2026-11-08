import { useStore } from '../store';
import { useLayoutEffect, useRef } from 'react';
import { useViewport } from '@xyflow/react';

export function DeviceActions({ id, name }: { id: string; name: string }) {
  const openTerminal = useStore(s => s.openTerminal);
  const pingSource = useStore(s => s.quickPing?.sourceId === id);
  const actions = useRef<HTMLDivElement>(null), { zoom } = useViewport();
  useLayoutEffect(() => {
    const el = actions.current, region = el?.parentElement?.querySelector<HTMLElement>('.device-interaction-region');
    if (!el || !region) return;
    const measure = () => {
      // Keep both targets inside the existing selection, with a small gap.
      // Nothing extends the node measurement or cable-drop region.
      const available = Math.max(0, region.getBoundingClientRect().width - 6 * zoom - 4);
      const top = el.querySelector('button')!.getBoundingClientRect().top;
      const handles = [...el.parentElement!.querySelectorAll<HTMLElement>('.react-flow__handle-left,.react-flow__handle-right')];
      // A short PC at 25% cannot fit a 24px button centre above its lateral
      // handles. Keep the centre clickable; handles retain their own hit areas.
      const clearCentre = Math.min(...handles.map(h => 2 * (h.getBoundingClientRect().top - top - 2)));
      const pixels = Math.min(24, available / 2, clearCentre), scale = Math.max(1, pixels / (28 * zoom));
      el.style.setProperty('--device-action-scale', String(scale));
      el.toggleAttribute('data-enlarged', scale > 1.001);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(region);
    return () => observer.disconnect();
  }, [zoom]);
  return <div ref={actions} className="device-actions" role="group" aria-label={`Aktionen für ${name}`}>
    <button type="button" className="device-terminal device-action nodrag nopan nowheel"
      aria-label={`Terminal öffnen: ${name}`} title={`Terminal öffnen: ${name}`}
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openTerminal(id); }}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="m4 5 4 4-4 4m7 0h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    <button type="button" className="device-ping device-action nodrag nopan nowheel"
      aria-label={`Ping von ${name}`} title={pingSource ? 'Ping abbrechen' : `Ping von ${name}`} aria-pressed={pingSource}
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); useStore.getState().beginQuickPing(id); }}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.5" /><path d="M10 1v4m0 10v4M1 10h4m10 0h4" />
      </svg>
    </button>
  </div>;
}
