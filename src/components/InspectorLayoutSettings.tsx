import { useWifiCoverage } from '../wifiCoverage';
import { useRef, useState } from 'react';
import { INSPECTOR_LAYOUTS, type InspectorLayout, type InspectorLayoutPreference } from '../inspectorLayout';
import { FloatingPopover } from './FloatingPopover';
import { useStore } from '../store';
import { BackgroundSettings } from './BackgroundSettings';
import { UI_THEMES, useUiTheme, type UiTheme } from '../uiTheme';
import { useAlignmentPreference } from '../alignmentPreferences';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n';

const LAYOUT_LABELS = { compact: 'navigation.settingsCompact', balanced: 'navigation.settingsBalanced', wide: 'navigation.settingsWide' } as const;

export function InspectorLayoutSettings({ value, onChange }: {
  value: InspectorLayoutPreference; onChange: (value: InspectorLayoutPreference) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={anchor} className="btn" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? 'inspector-layout-settings' : undefined} onClick={() => setOpen(!open)}>⚙ {t('navigation.settings')}</button>
    {open && <FloatingPopover anchor={anchor} id="inspector-layout-settings" label={t('navigation.settings')} width={300}
      className="inspector-layout-settings" onClose={() => setOpen(false)}>
      <InspectorSettingsContent value={value} onChange={onChange} />
    </FloatingPopover>}
  </>;
}

export function InspectorSettingsContent({ value, onChange }: {
  value: InspectorLayoutPreference; onChange: (value: InspectorLayoutPreference) => void;
}) {
  const coverage = useWifiCoverage();
  const { t } = useTranslation();
  const cableStyle = useStore(s => s.cableStyle);
  const { theme, setTheme } = useUiTheme();
  const alignment = useAlignmentPreference();
  return <>
      <LanguageSelector />
      <p className="hint">{t('navigation.languageNote')}</p>
      <fieldset className="theme-settings">
        <legend>{t('navigation.settingsAppearance')}</legend>
        <label htmlFor="ui-theme-choice">{t('navigation.settingsTheme')}</label>
        <select id="ui-theme-choice" value={theme} onChange={event => setTheme(event.target.value as UiTheme)}>
          {(['dark', 'light'] as const).map(group => <optgroup key={group} label={t(group === 'light' ? 'navigation.settingsLightThemes' : 'navigation.settingsDarkThemes')}>
            {Object.entries(UI_THEMES).filter(([, option]) => option.group === group).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
          </optgroup>)}
        </select>
      </fieldset>
      <label htmlFor="inspector-layout-choice">{t('navigation.settingsLayout')}</label>
      <select id="inspector-layout-choice" value={value.layout} onChange={event => onChange({ ...value, layout: event.target.value as InspectorLayout })}>
        {(Object.keys(INSPECTOR_LAYOUTS) as (keyof typeof INSPECTOR_LAYOUTS)[]).map(id => <option key={id} value={id}>{t(LAYOUT_LABELS[id])}</option>)}
        <option value="custom">{t('navigation.settingsCustom', { width: value.customWidth })}</option>
      </select>
      <p>{t('navigation.settingsLayoutHint')}</p>
      <label htmlFor="cable-style-choice">{t('navigation.settingsCableStyle')}</label>
      <select id="cable-style-choice" value={cableStyle} onChange={event => useStore.getState().setCableStyle(event.target.value === 'hybrid' ? 'hybrid' : 'straight')}>
        <option value="straight">{t('navigation.settingsStraight')}</option><option value="hybrid">{t('navigation.settingsHybrid')}</option>
      </select>
      <label htmlFor="wifi-coverage-mode">{t('navigation.settingsWifiCoverage')}</label>
      <select id="wifi-coverage-mode" value={coverage.mode} onChange={e => coverage.setMode(e.target.value as 'auto' | 'always' | 'hidden')}>
        <option value="auto">{t('navigation.settingsAuto')}</option><option value="always">{t('navigation.settingsAlways')}</option><option value="hidden">{t('navigation.settingsHidden')}</option>
      </select>
      <label className="alignment-guides-setting" htmlFor="alignment-guides-enabled">
        <input id="alignment-guides-enabled" type="checkbox" checked={alignment.enabled}
          onChange={event => alignment.setEnabled(event.target.checked)} />{t('navigation.settingsAlignment')}
      </label>
      <p className="hint">{t('navigation.settingsAlignmentHint')}</p>
      <BackgroundSettings />
  </>;
}
