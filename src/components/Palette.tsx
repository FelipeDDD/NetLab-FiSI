import { useId, useState, type DragEvent } from 'react';
import { useStore } from '../store';
import type { DeviceKind } from '../engine/device';
import { DeviceIcon } from './DeviceNode';
import { InspectorTabs } from './InspectorTabs';
import type { HostCreationMode } from '../hostOs';
import { loadPalettePreference, savePalettePreference, type PaletteCategory, type PalettePreference } from '../paletteLayout';

const CATEGORIES: { id: PaletteCategory; label: string; items: { kind: DeviceKind; label: string; blurb: string }[] }[] = [
  { id: 'basic', label: 'Grundausstattung', items: [
    { kind: 'host', label: 'Host', blurb: 'Arbeitsstation' },
    { kind: 'server', label: 'Server', blurb: 'DHCP / DNS / Web' },
    { kind: 'switch', label: 'Switch', blurb: 'Layer-2-Switch' },
    { kind: 'router', label: 'Router', blurb: 'IP-Routing' },
  ] },
  { id: 'clients', label: 'Endgeräte', items: [
    { kind: 'notebook', label: 'Notebook', blurb: 'Ethernet / WLAN' },
    { kind: 'smartphone', label: 'Smartphone', blurb: 'WLAN-Client' },
  ] },
  { id: 'wlan', label: 'WLAN', items: [
    { kind: 'ap', label: 'Wi-Fi AP', blurb: 'Wireless Bridge (SSID)' },
  ] },
  { id: 'security', label: 'Sicherheit', items: [
    { kind: 'firewall', label: 'Firewall', blurb: 'Router mit nftables' },
  ] },
];

export function Palette() {
  const addDeviceAt = useStore((s) => s.addDeviceAt);
  const nodeCount = useStore((s) => s.nodes.length);
  const hostMode = useStore((s) => s.hostCreationMode);
  const [preference, setPreference] = useState(loadPalettePreference);
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

  const toggleLabel = preference.collapsed ? 'Seitenleiste erweitern' : 'Seitenleiste einklappen';
  return <aside className={`palette${preference.collapsed ? ' is-collapsed' : ''}`} aria-label="Geräte und Werkzeuge">
    <div className="palette-header">
      <span className="palette-title" hidden={preference.collapsed}>Katalog</span>
      <button type="button" className="palette-toggle" aria-label={toggleLabel} title={toggleLabel}
        aria-expanded={!preference.collapsed} aria-controls={`${prefix}-content`}
        onClick={() => update({ ...preference, collapsed: !preference.collapsed })}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M5 4v16" /><path d={preference.collapsed ? 'm11 7 5 5-5 5' : 'm16 7-5 5 5 5'} />
        </svg>
      </button>
    </div>
    <div id={`${prefix}-content`} className="palette-content" hidden={preference.collapsed}>
      <InspectorTabs active={preference.tab} label="Geräte und Werkzeuge"
        onChange={tab => update({ ...preference, tab: tab as PalettePreference['tab'] })}
        tabs={[
          { id: 'devices', label: 'Geräte', content: <>
            <label className="host-creation-mode">Neue Hosts / Notebooks
              <select value={hostMode} onChange={(e) => useStore.getState().setHostCreationMode(e.target.value as HostCreationMode)}>
                <option value="linux">Linux</option><option value="windows">Windows</option><option value="mixed">Mixed (50/50)</option>
              </select>
            </label>
            {CATEGORIES.map(category => {
              const expanded = !preference.collapsedCategories.includes(category.id);
              return <section className="palette-category" key={category.id} aria-labelledby={`${prefix}-${category.id}-heading`}>
                <h2><button type="button" id={`${prefix}-${category.id}-heading`} aria-expanded={expanded}
                  aria-controls={`${prefix}-${category.id}`} onClick={() => toggleCategory(category.id)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d={expanded ? 'm3 4 3 3 3-3' : 'm4 3 3 3-3 3'} />
                  </svg>{category.label}
                </button></h2>
                <div id={`${prefix}-${category.id}`} className="palette-grid" hidden={!expanded}>
                  {category.items.map(it => <button type="button" key={it.kind}
                    className={`palette-item kind-${it.kind}`} draggable aria-label={it.label}
                    onDragStart={e => onDragStart(e, it.kind)}
                    onClick={() => addDeviceAt(it.kind, { x: 140 + (nodeCount % 5) * 60, y: 120 + (nodeCount % 7) * 50 })}
                    title={`${it.blurb} · Zum Hinzufügen klicken oder auf die Arbeitsfläche ziehen`}>
                    <span className="palette-item-icon"><DeviceIcon kind={it.kind} size={26} /></span>
                    <span className="palette-item-label">{it.label}</span>
                  </button>)}
                </div>
              </section>;
            })}
          </> },
          { id: 'tools', label: 'Werkzeuge', content: <p className="palette-empty">Hier ist Platz für zukünftige visuelle Werkzeuge. Derzeit sind keine verfügbar.</p> },
        ]} />
    </div>
  </aside>;
}
