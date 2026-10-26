import { useWifiCoverage } from '../wifiCoverage';
import { useRef, useState } from 'react';
import { INSPECTOR_LAYOUTS, type InspectorLayout, type InspectorLayoutPreference } from '../inspectorLayout';
import { FloatingPopover } from './FloatingPopover';
import { useStore } from '../store';
import { BackgroundSettings } from './BackgroundSettings';
import { UI_THEMES, useUiTheme, type UiTheme } from '../uiTheme';
import { useAlignmentPreference } from '../alignmentPreferences';

export function InspectorLayoutSettings({ value, onChange }: {
  value: InspectorLayoutPreference; onChange: (value: InspectorLayoutPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchor} className="btn" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? 'inspector-layout-settings' : undefined} onClick={() => setOpen(!open)}>⚙ Settings</button>
    {open && <FloatingPopover anchor={anchor} id="inspector-layout-settings" label="Settings" width={300}
      className="inspector-layout-settings" onClose={() => setOpen(false)}>
      <InspectorSettingsContent value={value} onChange={onChange} />
    </FloatingPopover>}
  </>;
}

export function InspectorSettingsContent({ value, onChange }: {
  value: InspectorLayoutPreference; onChange: (value: InspectorLayoutPreference) => void;
}) {
  const coverage = useWifiCoverage();
  const cableStyle = useStore(s => s.cableStyle);
  const { theme, setTheme } = useUiTheme();
  const alignment = useAlignmentPreference();
  return <>
      <fieldset className="theme-settings">
        <legend>Darstellung</legend>
        <label htmlFor="ui-theme-choice">UI Theme</label>
        <select id="ui-theme-choice" value={theme} onChange={event => setTheme(event.target.value as UiTheme)}>
          {(['dark', 'light'] as const).map(group => <optgroup key={group} label={group === 'light' ? 'Helle Themes' : 'Dunkle Themes'}>
            {Object.entries(UI_THEMES).filter(([, option]) => option.group === group).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
          </optgroup>)}
        </select>
      </fieldset>
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
      <label htmlFor="wifi-coverage-mode">Wi-Fi Coverage</label>
      <select id="wifi-coverage-mode" value={coverage.mode} onChange={e => coverage.setMode(e.target.value as 'auto' | 'always' | 'hidden')}>
        <option value="auto">Auto</option><option value="always">Always</option><option value="hidden">Hidden</option>
      </select>
      <label className="alignment-guides-setting" htmlFor="alignment-guides-enabled">
        <input id="alignment-guides-enabled" type="checkbox" checked={alignment.enabled}
          onChange={event => alignment.setEnabled(event.target.checked)} />Ausrichtungshilfen
      </label>
      <p className="hint">Mittelpunkte beim Ziehen ausrichten. Alt gedrückt halten: frei bewegen.</p>
      <BackgroundSettings />
  </>;
}
