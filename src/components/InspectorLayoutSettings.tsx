import { useRef, useState } from 'react';
import { INSPECTOR_LAYOUTS, type InspectorLayout, type InspectorLayoutPreference } from '../inspectorLayout';
import { FloatingPopover } from './FloatingPopover';
import { useStore } from '../store';

export function InspectorLayoutSettings({ value, onChange }: {
  value: InspectorLayoutPreference; onChange: (value: InspectorLayoutPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const cableStyle = useStore(s => s.cableStyle);
  const anchor = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchor} className="btn" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? 'inspector-layout-settings' : undefined} onClick={() => setOpen(!open)}>⚙ Settings</button>
    {open && <FloatingPopover anchor={anchor} id="inspector-layout-settings" label="Settings" width={300}
      className="inspector-layout-settings" onClose={() => setOpen(false)}>
      <label htmlFor="inspector-layout-choice">Inspector layout · Experiment</label>
      <select id="inspector-layout-choice" value={value.layout} onChange={event => onChange({ ...value, layout: event.target.value as InspectorLayout })}>
        {Object.entries(INSPECTOR_LAYOUTS).map(([id, layout]) => <option key={id} value={id}>{layout.label}</option>)}
        <option value="custom">Benutzerdefiniert ({value.customWidth} px)</option>
      </select>
      <p>Linken Rand ziehen oder Pfeiltasten verwenden. Doppelklick: B (340 px). Router-Tabs passen sich der verfügbaren Breite an.</p>
      <label htmlFor="cable-style-choice">Cable style</label>
      <select id="cable-style-choice" value={cableStyle} onChange={event => useStore.getState().setCableStyle(event.target.value === 'hybrid' ? 'hybrid' : 'straight')}>
        <option value="straight">Straight — Standard</option><option value="hybrid">Hybrid — Experiment</option>
      </select>
    </FloatingPopover>}
  </>;
}
