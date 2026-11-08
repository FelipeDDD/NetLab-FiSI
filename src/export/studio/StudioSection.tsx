import { useState, type ReactNode } from 'react';

/** Open/closed state belongs to the interface, never to the saved layout. */
export function StudioSection({ title, children, initialOpen = false, accent = false, id }: { title: string; children: ReactNode; initialOpen?: boolean; accent?: boolean; id: string }) {
  const [open, setOpen] = useState(initialOpen);
  return <details className={`studio-panel${accent ? ' studio-panel--accent' : ''}`} data-studio-panel={id} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary><div className="studio-panel-body">{children}</div>
  </details>;
}
