import { useTranslation, type TranslationKey } from '../i18n';
import { useId, useState, type DragEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { canvasWorldBounds } from '../devicePlacement';
import { useStore } from '../store';
import type { DeviceKind } from '../engine/device';
import { DeviceIcon } from './DeviceNode';
import { InspectorTabs } from './InspectorTabs';
import { effectiveHostCreationMode, type HostCreationMode } from '../hostOs';
import { loadPalettePreference, savePalettePreference, type PaletteCategory, type PalettePreference } from '../paletteLayout';

const CATEGORIES: { id: PaletteCategory; label: TranslationKey; items: { kind: DeviceKind; label: TranslationKey; blurb: TranslationKey }[] }[] = [
  { id: 'basic', label: 'navigation.paletteBasic', items: [
    { kind: 'host', label: 'navigation.paletteHost', blurb: 'navigation.paletteWorkstation' },
    { kind: 'server', label: 'navigation.paletteServer', blurb: 'navigation.paletteServerHint' },
    { kind: 'switch', label: 'navigation.paletteSwitch', blurb: 'navigation.paletteSwitchHint' },
    { kind: 'router', label: 'navigation.paletteRouter', blurb: 'navigation.paletteRouterHint' },
  ] },
  { id: 'clients', label: 'navigation.paletteClients', items: [
    { kind: 'notebook', label: 'navigation.paletteNotebook', blurb: 'navigation.paletteNotebookHint' },
    { kind: 'smartphone', label: 'navigation.paletteSmartphone', blurb: 'navigation.palettePhoneHint' },
  ] },
  { id: 'wlan', label: 'navigation.paletteWlan', items: [
    { kind: 'ap', label: 'navigation.paletteAp', blurb: 'navigation.paletteApHint' },
  ] },
  { id: 'security', label: 'navigation.basicSecurity', items: [
    { kind: 'firewall', label: 'navigation.paletteFirewall', blurb: 'navigation.paletteFirewallHint' },
  ] },
];

export function Palette({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation();
  const addDeviceSmart = useStore((s) => s.addDeviceSmart);
  const { screenToFlowPosition } = useReactFlow();
  const add = (kind: DeviceKind) => {
    const canvas=document.querySelector('.react-flow');
    if(canvas) addDeviceSmart(kind,canvasWorldBounds(canvas.getBoundingClientRect(),screenToFlowPosition));
  };
  const hostMode = useStore(effectiveHostCreationMode);
  const [preference, setPreference] = useState(loadPalettePreference);
  const [compactExpanded, setCompactExpanded] = useState(false);
  const collapsed = compact ? !compactExpanded : preference.collapsed;
  const prefix = useId();
  const update = (next: PalettePreference) => { setPreference(next); savePalettePreference(next); };
  const toggleCategory = (id: PaletteCategory) => update({ ...preference,
    collapsedCategories: preference.collapsedCategories.includes(id)
      ? preference.collapsedCategories.filter(other => other !== id) : [...preference.collapsedCategories, id],
  });

  const onDragStart = (e: DragEvent, kind: DeviceKind) => {
    e.dataTransfer.setData('application/netsim', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  const toggleCollapsed = () => compact ? setCompactExpanded(!compactExpanded) : update({ ...preference, collapsed: !preference.collapsed });
  const toggleLabel = t(collapsed ? 'navigation.paletteExpand' : 'navigation.paletteCollapse');
  return <aside className={`palette${collapsed ? ' is-collapsed' : ''}`} aria-label={t('navigation.paletteLabel')}>
    <div className="palette-header">
      <span className="palette-title" hidden={collapsed}>{t('navigation.paletteCatalog')}</span>
      <button type="button" className="palette-toggle" aria-label={toggleLabel} title={toggleLabel}
        aria-expanded={!collapsed} aria-controls={`${prefix}-content`}
        onClick={toggleCollapsed}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M5 4v16" /><path d={collapsed ? 'm11 7 5 5-5 5' : 'm16 7-5 5 5 5'} />
        </svg>
      </button>
    </div>
    {collapsed && <button type="button" className="palette-expand-area" aria-label={t('navigation.paletteExpandArea')}
      title={t('navigation.paletteExpand')} aria-expanded="false" aria-controls={`${prefix}-content`}
      onClick={toggleCollapsed}>
      <span aria-hidden="true" />
    </button>}
    <div id={`${prefix}-content`} className="palette-content" hidden={collapsed}>
      <InspectorTabs active={preference.tab} label={t('navigation.paletteLabel')}
        onChange={tab => update({ ...preference, tab: tab as PalettePreference['tab'] })}
        tabs={[
          { id: 'devices', label: t('navigation.paletteDevices'), content: <>
            <label className="host-creation-mode">{t('navigation.paletteHostMode')}
              <select value={hostMode} onChange={(e) => useStore.getState().setPaletteHostCreationMode(e.target.value as HostCreationMode)}>
                <option value="linux">Linux</option><option value="windows">Windows</option><option value="mixed">{t('navigation.paletteMixed')}</option>
              </select>
            </label>
            {CATEGORIES.map(category => {
              const expanded = !preference.collapsedCategories.includes(category.id);
              return <section className="palette-category" key={category.id} aria-labelledby={`${prefix}-${category.id}-heading`}>
                <h2><button type="button" id={`${prefix}-${category.id}-heading`} aria-expanded={expanded}
                  aria-controls={`${prefix}-${category.id}`} onClick={() => toggleCategory(category.id)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d={expanded ? 'm3 4 3 3 3-3' : 'm4 3 3 3-3 3'} />
                  </svg>{t(category.label)}
                </button></h2>
                <div id={`${prefix}-${category.id}`} className="palette-grid" hidden={!expanded}>
                  {category.items.map(it => <button type="button" key={it.kind}
                    className={`palette-item kind-${it.kind}`} draggable aria-label={t(it.label)}
                    onDragStart={e => onDragStart(e, it.kind)}
                    onClick={() => add(it.kind)}
                    title={t('navigation.paletteAddHint', { description: t(it.blurb) })}>
                    <span className="palette-item-icon"><DeviceIcon kind={it.kind} size={26} /></span>
                    <span className="palette-item-label">{t(it.label)}</span>
                  </button>)}
                </div>
              </section>;
            })}
          </> },
          { id: 'tools', label: t('navigation.paletteTools'), content: <p className="palette-empty">{t('navigation.paletteEmpty')}</p> },
        ]} />
    </div>
  </aside>;
}
