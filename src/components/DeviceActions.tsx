import { useStore } from '../store';

export function DeviceActions({ id, name }: { id: string; name: string }) {
  const openTerminal = useStore(s => s.openTerminal);
  const pingSource = useStore(s => s.quickPing?.sourceId === id);
  return <div className="device-actions" role="group" aria-label={`Aktionen für ${name}`}>
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
