import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { FloatingPopover } from './FloatingPopover';
import { PacketAnimationControl } from './PacketAnimationControl';
import { InspectorSettingsContent } from './InspectorLayoutSettings';
import type { InspectorLayoutPreference } from '../inspectorLayout';

const USER_GUIDE_URL = 'https://github.com/michael-borck/netsim/blob/main/docs/USER_GUIDE.md';
const MENUS = [
  { id: 'file', label: 'Datei' }, { id: 'labs', label: 'Labs' },
  { id: 'settings', label: 'Einstellungen' }, { id: 'help', label: 'Hilfe' },
] as const;
type MenuId = typeof MENUS[number]['id'];
type MenuPage = Exclude<MenuId, 'settings'> | 'compact';
const SIM_SPEEDS = [0.25, 0.5, 1, 2, 4];
const EXPORTS = [
  { action: 'exportJson', label: 'Topology (.json)', hint: 'Speichern und Importieren in NetLab' },
  { action: 'exportConfigs', label: 'Device configs (.zip)', hint: 'setup.sh, nftables.conf, dnsmasq.conf' },
  { action: 'exportContainerlab', label: 'containerlab (.clab.yml)', hint: 'Topologie mit echten Containern starten' },
  { action: 'exportCompose', label: 'docker-compose (.yml)', hint: 'Vereinfachtes Layer 2 — Hinweise in der Datei' },
  { action: 'exportSvg', label: 'Diagram (.svg)', hint: 'Topologie als Vektorgrafik' },
  { action: 'exportPng', label: 'Diagram (.png)', hint: 'Diagramm als PNG in doppelter Auflösung' },
  { action: 'exportReport', label: 'Network report (.html)', hint: 'Druckbarer Bericht mit Tabellen und Diagramm' },
] as const;

export function Toolbar({ inspectorLayout, onInspectorLayoutChange }: {
  inspectorLayout: InspectorLayoutPreference; onInspectorLayoutChange: (value: InspectorLayoutPreference) => void;
}) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches);
  const [menu, setMenu] = useState<MenuPage | null>(null);
  const [dialog, setDialog] = useState<'settings' | 'animation' | null>(null);
  const [menuFocus, setMenuFocus] = useState<'first' | 'last'>('first');
  const [focusedMenu, setFocusedMenu] = useState<MenuId>('file');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFocus, setExportFocus] = useState<'first' | 'none'>('none');
  const triggers = useRef<Partial<Record<MenuId | 'compact', HTMLButtonElement | null>>>({});
  const anchor = useRef<HTMLElement | null>(null);
  const packetAnchor = useRef<HTMLElement | null>(null);
  const exportAnchor = useRef<HTMLButtonElement>(null);
  const parentPopup = useRef<HTMLDivElement | null>(null);
  const exportPopup = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootMenu = useRef<MenuId>('file');
  const fileRef = useRef<HTMLInputElement>(null);
  const previousCompact = useRef(compact);
  const history = useStore(s => s.topologyHistory);
  const paused = useStore(s => s.paused);
  const speed = useStore(s => s.speed);
  const clock = useStore(s => s.clock);
  const notice = useStore(s => s.notice);
  const packetInspectorOpen = useStore(s => s.packetInspectorOpen);

  const cancelHoverClose = () => { if (hoverTimer.current !== null) clearTimeout(hoverTimer.current); hoverTimer.current = null; };
  const closeExport = () => { cancelHoverClose(); setExportOpen(false); };
  const scheduleExportClose = () => { cancelHoverClose(); hoverTimer.current = setTimeout(() => setExportOpen(false), 200); };
  const openExport = (focus: 'first' | 'none') => { cancelHoverClose(); setExportFocus(focus); setExportOpen(true); };

  useEffect(() => () => { if (hoverTimer.current !== null) clearTimeout(hoverTimer.current); }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)');
    const update = () => setCompact(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (previousCompact.current === compact) return;
    previousCompact.current = compact;
    const wasOpen = menu !== null || dialog === 'settings';
    setMenu(null); closeExport();
    setDialog(current => current === 'settings' ? null : current);
    if (wasOpen) triggers.current[compact ? 'compact' : rootMenu.current]?.focus({ preventScroll: true });
  }, [compact]);

  const closeMenu = (restore = false) => {
    closeExport(); setMenu(null);
    if (restore) anchor.current?.focus({ preventScroll: true });
  };
  const openMenu = (id: MenuId | 'compact', focus: 'first' | 'last' = 'first') => {
    anchor.current = triggers.current[compact ? 'compact' : id] ?? null;
    closeExport();
    if (id !== 'compact') { rootMenu.current = id; setFocusedMenu(id); }
    setMenuFocus(focus);
    setDialog(id === 'settings' ? 'settings' : null);
    setMenu(id === 'settings' ? null : id);
  };
  const perform = (action: () => void) => {
    try { action(); }
    catch (error) { useStore.getState().setNotice('Aktion fehlgeschlagen: ' + (error instanceof Error ? error.message : String(error))); }
    finally { closeMenu(true); }
  };
  const nextMenu = (direction: -1 | 1) => {
    const index = MENUS.findIndex(item => item.id === rootMenu.current);
    const next = MENUS[(index + direction + MENUS.length) % MENUS.length].id;
    rootMenu.current = next; setFocusedMenu(next);
    triggers.current[next]?.focus({ preventScroll: true });
    if (next === 'settings') closeMenu(); else openMenu(next);
  };
  const typeAhead = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key.length !== 1 || event.key === ' ') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
    const match = ordered.find(item => item.textContent?.trim().toLocaleLowerCase('de').startsWith(event.key.toLocaleLowerCase('de')));
    if (match) { event.preventDefault(); event.stopPropagation(); match.focus(); }
  };
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && exportOpen) {
      event.preventDefault(); event.stopPropagation(); closeExport(); exportAnchor.current?.focus(); return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'ArrowRight' && document.activeElement === exportAnchor.current) openExport('first');
      else if (event.key === 'ArrowRight' && document.activeElement?.getAttribute('aria-haspopup') === 'menu') (document.activeElement as HTMLElement).click();
      else if (compact) {
        if (event.key === 'ArrowLeft' && menu !== 'compact') { closeExport(); setMenu('compact'); }
      } else nextMenu(event.key === 'ArrowLeft' ? -1 : 1);
    } else {
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.key.length === 1) closeExport();
      typeAhead(event);
    }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const error = useStore.getState().importJson(await file.text());
    if (error) useStore.getState().setNotice('Import failed: ' + error);
    if (fileRef.current) fileRef.current.value = '';
  };
  const action = (label: string, handler: () => void) =>
    <button type="button" className="labs-menu-item toolbar-menu-action" role="menuitem"
      onPointerEnter={closeExport} onClick={() => perform(handler)}>{label}</button>;
  const togglePackets = () => useStore.getState().setPacketInspectorOpen(!packetInspectorOpen);
  const openPacketSettings = () => { closeMenu(); setDialog(current => current === 'animation' ? null : 'animation'); };
  const runTitle = paused ? 'Run — Simulationsuhr fortsetzen' : 'Pause — Simulationsuhr anhalten';
  const popupLabel = menu === 'compact' ? 'Menü' : MENUS.find(item => item.id === menu)?.label;

  return <header className="toolbar">
    <div className="brand"><span className="brand-name">NetLab - FiSi</span></div>
    <nav className="toolbar-navigation" aria-label="Hauptmenü">
      {compact ? <button type="button" className="toolbar-menu-trigger" ref={el => { triggers.current.compact = el; }}
        aria-haspopup="menu" aria-expanded={menu !== null} aria-controls={menu ? 'toolbar-' + menu + '-menu' : undefined}
        onClick={() => menu ? closeMenu() : openMenu('compact')}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault(); openMenu('compact', event.key === 'ArrowUp' ? 'last' : 'first');
        }}>Menü <span aria-hidden="true">▾</span></button>
        : <div role="menubar" aria-label="Hauptmenü">
          {MENUS.map((item, index) => <button type="button" role="menuitem" className="toolbar-menu-trigger" key={item.id}
            ref={el => { triggers.current[item.id] = el; }} tabIndex={focusedMenu === item.id ? 0 : -1}
            aria-haspopup={item.id === 'settings' ? 'dialog' : 'menu'}
            aria-expanded={item.id === 'settings' ? dialog === 'settings' : menu === item.id}
            aria-controls={item.id === 'settings' && dialog === 'settings' ? 'inspector-layout-settings'
              : menu === item.id ? 'toolbar-' + item.id + '-menu' : undefined}
            onFocus={() => setFocusedMenu(item.id)}
            onPointerEnter={() => { if (menu && item.id !== 'settings' && menu !== item.id) openMenu(item.id); }}
            onClick={() => {
              if (menu === item.id || (item.id === 'settings' && dialog === 'settings')) { closeMenu(); setDialog(null); }
              else openMenu(item.id);
            }}
            onKeyDown={event => {
              if (event.ctrlKey || event.metaKey || event.altKey) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); openMenu(item.id, event.key === 'ArrowUp' ? 'last' : 'first');
              } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? MENUS.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length;
                triggers.current[MENUS[next].id]?.focus({ preventScroll: true });
                if (menu) { if (MENUS[next].id === 'settings') closeMenu(); else openMenu(MENUS[next].id); }
              }
            }}>{item.label}</button>)}
        </div>}
    </nav>

    <div className="toolbar-group toolbar-quick-actions" aria-label="Schnellaktionen">
      <div className="toolbar-group toolbar-quick-history">
        <button type="button" className="btn topology-history-action toolbar-history-button" disabled={!history.past.length} aria-label="Undo"
          title={history.past.length ? 'Undo: ' + history.past.at(-1)!.label + ' (Ctrl+Z / Cmd+Z)' : 'Undo (Ctrl+Z / Cmd+Z)'}
          onClick={() => useStore.getState().undoTopology()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2l-3 3" />
          </svg><span className="toolbar-history-label">Undo</span>
        </button>
        <button type="button" className="btn topology-history-action toolbar-history-button" disabled={!history.future.length} aria-label="Redo"
          title={history.future.length ? 'Redo: ' + history.future.at(-1)!.label + ' (Ctrl+Shift+Z / Cmd+Shift+Z)' : 'Redo (Ctrl+Shift+Z / Cmd+Shift+Z)'}
          onClick={() => useStore.getState().redoTopology()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2l3 3" />
          </svg><span className="toolbar-history-label">Redo</span>
        </button>
      </div>
      <button type="button" className="btn toolbar-run" title={runTitle} aria-label={paused ? 'Run' : 'Pause'}
        onClick={() => useStore.getState().setPaused(!paused)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {paused ? <path d="m3 1 8 5-8 5Z" /> : <path d="M2 1h3v10H2zm5 0h3v10H7z" />}
        </svg><span className="toolbar-run-label">{paused ? 'Run' : 'Pause'}</span>
      </button>
      <select className="speed toolbar-quick-speed" aria-label="Simulation speed" title="Geschwindigkeit der Simulationsuhr"
        value={speed} onChange={event => useStore.getState().setSpeed(Number(event.target.value))}>
        {SIM_SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}
      </select>
      <div className="toolbar-packets">
        <button type="button" id="packets-toggle" className="btn packets-toggle" aria-expanded={packetInspectorOpen}
          aria-controls={packetInspectorOpen ? 'packet-inspector' : undefined} onClick={togglePackets}>Packets</button>
        <button type="button" className="btn packet-settings-toggle" ref={el => { packetAnchor.current = el; }}
          aria-label="Paketanimation einstellen" title="Animationsgeschwindigkeit, Live / Guided und Wiedergabe"
          aria-haspopup="dialog" aria-expanded={dialog === 'animation'}
          aria-controls={dialog === 'animation' ? 'packet-visualization-settings' : undefined} onClick={openPacketSettings}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
        </button>
      </div>
      <span className="clock toolbar-clock">t = {(clock / 1000).toFixed(1)}s</span>
    </div>

    {menu && <FloatingPopover key={menu} anchor={anchor} id={'toolbar-' + menu + '-menu'} label={popupLabel ?? 'Menü'}
      role="menu" width={menu === 'labs' ? 360 : menu === 'help' ? 200 : 210} initialFocus={menuFocus}
      popupRef={parentPopup} relatedRefs={[exportPopup]} className="labs-menu toolbar-command-menu"
      onClose={() => closeMenu()} onKeyDown={menuKeys}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && exportOpen) scheduleExportClose(); }}>
      {compact && menu !== 'compact' && <button type="button" role="menuitem" className="labs-menu-item toolbar-menu-back"
        onClick={() => { closeExport(); setMenuFocus('first'); setMenu('compact'); }}>‹ Menü</button>}
      {menu === 'compact' && MENUS.map(item => <button type="button" role="menuitem" className="labs-menu-item toolbar-menu-action"
        aria-haspopup={item.id === 'settings' ? 'dialog' : 'menu'} key={item.id} onClick={() => openMenu(item.id)}>
        <span>{item.label}</span><span aria-hidden="true">{item.id === 'settings' ? '' : '›'}</span>
      </button>)}
      {menu === 'file' && <>
        {action('New', () => useStore.getState().newTopology())}
        {action('Import', () => fileRef.current?.click())}
        <button type="button" role="menuitem" ref={exportAnchor} className="labs-menu-item toolbar-menu-action" aria-haspopup="menu"
          aria-expanded={exportOpen} aria-controls={exportOpen ? 'toolbar-export-menu' : undefined}
          onPointerEnter={event => { if (event.pointerType === 'mouse') openExport('none'); }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleExportClose(); }}
          onClick={() => openExport('first')}><span>Export</span><span className="toolbar-submenu-arrow" aria-hidden="true">›</span></button>
        {action('Share link', () => useStore.getState().shareUrl())}
      </>}
      {menu === 'labs' && <>
        {action('Demo', () => useStore.getState().loadDemo())}
        <div className="labs-menu-section">Übungen</div>
        {LABS.map((lab, index) => <button type="button" key={lab.lab!.id} role="menuitem" className="labs-menu-item"
          onClick={() => perform(() => useStore.getState().loadBundledLab(index))}>
          <span className="labs-menu-title">{lab.lab!.title}</span><span className="labs-menu-blurb">{lab.lab!.blurb}</span>
        </button>)}
        <div className="labs-menu-section">Example networks</div>
        {EXAMPLES.map((example, index) => <button type="button" key={example.title} role="menuitem" className="labs-menu-item"
          onClick={() => perform(() => useStore.getState().loadExample(index))}>
          <span className="labs-menu-title">{example.title}</span><span className="labs-menu-blurb">{example.blurb}</span>
        </button>)}
        <div className="labs-menu-note">Loading a lab or example replaces the current canvas.</div>
      </>}
      {menu === 'help' && <a className="labs-menu-item toolbar-help-link" role="menuitem" href={USER_GUIDE_URL}
        target="_blank" rel="noopener noreferrer" onClick={() => closeMenu(true)}>Help / Dokumentation ↗</a>}
    </FloatingPopover>}

    {menu === 'file' && exportOpen && <FloatingPopover anchor={exportAnchor} id="toolbar-export-menu" label="Export" role="menu"
      width={300} preferredSide="right" initialFocus={exportFocus} popupRef={exportPopup} relatedRefs={[parentPopup]}
      className="labs-menu toolbar-command-menu toolbar-export-submenu" onClose={closeExport}
      onPointerEnter={cancelHoverClose}
      onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleExportClose(); }}
      onKeyDown={event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); closeExport(); exportAnchor.current?.focus(); }
        else typeAhead(event);
      }}>
      {EXPORTS.map(item => <button key={item.action} type="button" className="labs-menu-item" role="menuitem"
        onClick={() => perform(() => useStore.getState()[item.action]())}>
        <span className="labs-menu-title">{item.label}</span><span className="labs-menu-blurb">{item.hint}</span>
      </button>)}
    </FloatingPopover>}

    {dialog === 'settings' && <FloatingPopover anchor={anchor} id="inspector-layout-settings" label="Settings" width={300}
      className="inspector-layout-settings" onClose={() => setDialog(null)}>
      <h2 className="toolbar-dialog-title">Einstellungen</h2>
      <InspectorSettingsContent value={inspectorLayout} onChange={onInspectorLayoutChange} />
    </FloatingPopover>}
    <PacketAnimationControl menuAnchor={packetAnchor} settingsOpen={dialog === 'animation'}
      onSettingsClose={() => setDialog(current => current === 'animation' ? null : current)} />
    <input ref={fileRef} type="file" accept="application/json" hidden onChange={event => onFile(event.target.files?.[0])} />
    {notice && <div className="notice toolbar-notice" role="status" aria-live="polite">{notice}</div>}
  </header>;
}
