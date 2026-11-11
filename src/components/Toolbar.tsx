import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { FloatingPopover } from './FloatingPopover';
import { InspectorSettingsContent } from './InspectorLayoutSettings';
import type { InspectorLayoutPreference } from '../inspectorLayout';
import { confirmReplacement, replacementWarning } from '../persistence/replacement';
import { editorMessage, editorMessageText, historyOperationLabel } from '../editorMessages';
import { useWorkspaceUI } from '../workspace/WorkspaceUI';
import { ExerciseMenu } from '../exercises/ExerciseUI';
import { MarkingsButton } from './AreaMarkings';
import { useTranslation } from '../i18n';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { consumeHomeIntent } from '../home/navigation';
import { useLearningHelp } from './LearningHelp';
import { studioText } from '../export/studio/messages';

const TopologyStudio = lazy(() => import('../export/studio/TopologyStudio'));

const USER_GUIDE_URL = 'https://github.com/michael-borck/netsim/blob/main/docs/USER_GUIDE.md';
const MENUS = [
  { id: 'file', label: 'navigation.file' }, { id: 'labs', label: 'navigation.labs' },
  { id: 'exercises', label: 'navigation.exercises' },
  { id: 'settings', label: 'navigation.settings' }, { id: 'help', label: 'navigation.help' },
] as const;
type MenuId = typeof MENUS[number]['id'];
type MenuPage = Exclude<MenuId, 'settings'> | 'compact';
const EXPORTS = [
  { action: 'exportJson', label: 'navigation.exportTopology', hint: 'navigation.topologyHint' },
  { action: 'exportConfigs', label: 'navigation.exportConfigs', hint: 'navigation.configsHint' },
  { action: 'exportContainerlab', label: 'navigation.exportContainerlab', hint: 'navigation.containerlabHint' },
  { action: 'exportCompose', label: 'navigation.exportCompose', hint: 'navigation.composeHint' },
  { action: 'exportSvg', label: 'navigation.exportSvg', hint: 'navigation.svgHint' },
  { action: 'exportPng', label: 'navigation.exportPng', hint: 'navigation.pngHint' },
  { action: 'exportReport', label: 'navigation.exportReport', hint: 'navigation.reportHint' },
] as const;

export function Toolbar({ inspectorLayout, onInspectorLayoutChange }: {
  inspectorLayout: InspectorLayoutPreference; onInspectorLayoutChange: (value: InspectorLayoutPreference) => void;
}) {
  const workspace = useWorkspaceUI();
  const learningHelp = useLearningHelp();
  const { t, language } = useTranslation();
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches);
  const [menu, setMenu] = useState<MenuPage | null>(null);
  const [dialog, setDialog] = useState<'settings' | 'packets' | null>(null);
  const [menuFocus, setMenuFocus] = useState<'first' | 'last'>('first');
  const [focusedMenu, setFocusedMenu] = useState<MenuId>('file');
  const [exportOpen, setExportOpen] = useState(false);
  const [studio, setStudio] = useState<{ origin: HTMLElement | null } | null>(null);
  const [exportFocus, setExportFocus] = useState<'first' | 'none'>('none');
  const triggers = useRef<Partial<Record<MenuId | 'compact', HTMLButtonElement | null>>>({});
  const anchor = useRef<HTMLElement | null>(null);
  const packetAnchor = useRef<HTMLElement | null>(null);
  const exportAnchor = useRef<HTMLButtonElement>(null);
  const parentPopup = useRef<HTMLDivElement | null>(null);
  const exportPopup = useRef<HTMLDivElement | null>(null);
  const tutorialEntryPopup = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootMenu = useRef<MenuId>('file');
  const fileRef = useRef<HTMLInputElement>(null);
  const previousCompact = useRef(compact);
  const history = useStore(s => s.topologyHistory);
  const paused = useStore(s => s.paused);
  const clock = useStore(s => s.clock);
  const notice = useStore(s => s.notice);
  const autosavePending = useStore(s => s.autosavePending);
  const autosaveBlocked = useStore(s => s.autosaveBlocked);
  const autosaveError = useStore(s => s.autosaveError);
  const packetInspectorOpen = useStore(s => s.packetInspectorOpen);
  const captureStatus = useStore(s => s.packetCapture.status);

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
  useEffect(() => {
    if (!workspace) return;
    const intent = consumeHomeIntent();
    if (!intent) return;
    if (workspace.state.pendingShare) return;
    if (intent.action === 'new') workspace.newPlan();
    else if (intent.action === 'load') workspace.loadPlans();
    else if (intent.action === 'plan') workspace.openPlan(intent.id);
    else openMenu(intent.action);
  }, [!!workspace]);
  const perform = (action: () => void) => {
    try { action(); }
    catch { useStore.getState().setNotice(editorMessage('navigation.actionFailed')); }
    finally { closeMenu(true); }
  };
  const replace = (action: () => void) => confirmReplacement(action, message => window.confirm(message));
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
    const match = ordered.find(item => item.textContent?.trim().toLocaleLowerCase(language).startsWith(event.key.toLocaleLowerCase(language)));
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
    try {
      if (workspace) { workspace.importJson(await file.text()); return; }
      const error = useStore.getState().importJson(await file.text(), () => window.confirm(replacementWarning()));
      if (error) useStore.getState().setNotice(editorMessage('navigation.importFailed'));
    } catch {
      useStore.getState().setNotice(editorMessage('navigation.fileReadFailed'));
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const action = (label: string, handler: () => void, disabled = false) =>
    <button type="button" className="labs-menu-item toolbar-menu-action" role="menuitem"
      disabled={disabled}
      onPointerEnter={closeExport} onClick={() => perform(handler)}>{label}</button>;
  const togglePackets = () => useStore.getState().setPacketInspectorOpen(!packetInspectorOpen);
  const openPacketSettings = () => { closeMenu(); setDialog(current => current === 'packets' ? null : 'packets'); };
  const runTitle = t(paused ? 'navigation.runHint' : 'navigation.pauseHint');
  const popupLabel = menu === 'compact' ? 'navigation.menu' : MENUS.find(item => item.id === menu)?.label;
  const saveStatus = workspace ? workspace.status : t(autosaveBlocked ? 'workspace.legacyProtected' : autosaveError ? 'workspace.statusError' : autosavePending ? 'workspace.legacyPending' : 'workspace.legacySaved');

  return <header className="toolbar">
    <div className="brand"><span className="brand-name">NetLab - FiSi</span>
      <span className="autosave-state" role="status" title={saveStatus}>{saveStatus}</span>
    </div>
    <nav className="toolbar-navigation" aria-label={t('navigation.main')}>
      {compact ? <button type="button" className="toolbar-menu-trigger" ref={el => { triggers.current.compact = el; }}
        aria-haspopup="menu" aria-expanded={menu !== null} aria-controls={menu ? 'toolbar-' + menu + '-menu' : undefined}
        onClick={() => menu ? closeMenu() : openMenu('compact')}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault(); openMenu('compact', event.key === 'ArrowUp' ? 'last' : 'first');
        }}>{t('navigation.menu')} <span aria-hidden="true">▾</span></button>
        : <div role="menubar" aria-label={t('navigation.main')}>
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
            }}>{t(item.label)}</button>)}
        </div>}
    </nav>
    <LanguageSelector compact id="toolbar-language" />

    <div className="toolbar-group toolbar-quick-actions" aria-label={t('navigation.quickActions')}>
      <MarkingsButton onOpen={() => { closeMenu(); setDialog(null); }} />
      <div className="toolbar-group toolbar-quick-history">
        <button type="button" className="btn topology-history-action toolbar-history-button" data-history-action="undo" disabled={!history.past.length} aria-label={t('navigation.undo')}
          title={(history.past.length ? t('navigation.undoAction', { action: historyOperationLabel(history.past.at(-1)!, t) }) : t('navigation.undo')) + ' (Ctrl+Z / Cmd+Z)'}
          onClick={() => useStore.getState().undoTopology()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2l-3 3" />
          </svg><span className="toolbar-history-label">{t('navigation.undo')}</span>
        </button>
        <button type="button" className="btn topology-history-action toolbar-history-button" data-history-action="redo" disabled={!history.future.length} aria-label={t('navigation.redo')}
          title={(history.future.length ? t('navigation.redoAction', { action: historyOperationLabel(history.future.at(-1)!, t) }) : t('navigation.redo')) + ' (Ctrl+Shift+Z / Cmd+Shift+Z)'}
          onClick={() => useStore.getState().redoTopology()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2l3 3" />
          </svg><span className="toolbar-history-label">{t('navigation.redo')}</span>
        </button>
      </div>
      <button type="button" className="btn btn--primary btn--toolbar toolbar-run" title={runTitle} aria-label={t(paused ? 'navigation.run' : 'navigation.pause')}
        onClick={() => useStore.getState().setPaused(!paused)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {paused ? <path d="m3 1 8 5-8 5Z" /> : <path d="M2 1h3v10H2zm5 0h3v10H7z" />}
        </svg><span className="toolbar-run-label">{t(paused ? 'navigation.run' : 'navigation.pause')}</span>
      </button>
      <div className="toolbar-packets">
        <button type="button" id="packets-toggle" className="btn packets-toggle" aria-expanded={packetInspectorOpen}
          title={t(packetInspectorOpen ? 'navigation.hidePackets' : 'navigation.openPackets')} aria-label={t(packetInspectorOpen ? 'navigation.hidePackets' : 'navigation.openPackets')}
          aria-controls={packetInspectorOpen ? 'packet-inspector' : undefined} onClick={togglePackets}>{t('navigation.packets')}</button>
        <button type="button" className="btn packet-settings-toggle" ref={el => { packetAnchor.current = el; }}
          aria-label={t('navigation.packetSettings')} title={t('navigation.packetSettings')}
          aria-haspopup="menu" aria-expanded={dialog === 'packets'}
          aria-controls={dialog === 'packets' ? 'packet-capture-menu' : undefined} onClick={openPacketSettings}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
        </button>
      </div>
      <span className="clock toolbar-clock">t = {(clock / 1000).toFixed(1)}s</span>
    </div>

    {menu && <FloatingPopover key={menu} anchor={anchor} id={'toolbar-' + menu + '-menu'} label={t(popupLabel ?? 'navigation.menu')}
      role="menu" width={menu === 'labs' || menu === 'exercises' ? 360 : menu === 'help' ? 200 : 210} initialFocus={menuFocus}
      popupRef={parentPopup} relatedRefs={[exportPopup,tutorialEntryPopup]} className="labs-menu toolbar-command-menu"
      onClose={() => closeMenu()} onKeyDown={menuKeys}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && exportOpen) scheduleExportClose(); }}>
      {compact && menu !== 'compact' && <button type="button" role="menuitem" className="labs-menu-item toolbar-menu-back"
        onClick={() => { closeExport(); setMenuFocus('first'); setMenu('compact'); }}>‹ {t('navigation.menu')}</button>}
      {menu === 'compact' && MENUS.map(item => <button type="button" role="menuitem" className="labs-menu-item toolbar-menu-action"
        aria-haspopup={item.id === 'settings' ? 'dialog' : 'menu'} key={item.id} onClick={() => openMenu(item.id)}>
        <span>{t(item.label)}</span><span aria-hidden="true">{item.id === 'settings' ? '' : '›'}</span>
      </button>)}
      {menu === 'exercises' && <ExerciseMenu close={() => closeMenu(true)} entryPopup={tutorialEntryPopup}/>}
      {menu === 'file' && <>
        {workspace ? <>
          {action(t('navigation.new'), workspace.newPlan)}
          {action(t('navigation.open'), workspace.loadPlans)}
          {action(t('navigation.save'), () => workspace.save(), !workspace.state.activeDraftId)}
          {action(t('navigation.saveAs'), () => workspace.save(true), !workspace.state.activeDraftId)}
          {action(t('navigation.closePlan'), () => workspace.close(), !workspace.state.activeDraftId)}
          {action(t('navigation.plans'), workspace.loadPlans)}
          <div className="labs-menu-section">{t('navigation.exchange')}</div>
          {action(t('navigation.import'), () => fileRef.current?.click())}
        </> : <>
          {action(t('navigation.new'), () => replace(() => useStore.getState().newTopology()))}
          {action(t('navigation.import'), () => fileRef.current?.click())}
        </>}
        <button type="button" role="menuitem" ref={exportAnchor} className="labs-menu-item toolbar-menu-action" aria-haspopup="menu"
          aria-expanded={exportOpen} aria-controls={exportOpen ? 'toolbar-export-menu' : undefined}
          onPointerEnter={event => { if (event.pointerType === 'mouse') openExport('none'); }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleExportClose(); }}
          onClick={() => openExport('first')}><span>{t('navigation.export')}</span><span className="toolbar-submenu-arrow" aria-hidden="true">›</span></button>
        {action(t('navigation.share'), () => useStore.getState().shareUrl())}
      </>}
      {menu === 'labs' && <>
        {action(t('navigation.demo'), () => workspace ? workspace.openDocument(useStore.getState().createDemoDocument()) : replace(() => useStore.getState().loadDemo()))}
        <div className="labs-menu-section">{t('navigation.labsExercises')}</div>
        {LABS.map((lab, index) => <button type="button" key={lab.lab!.id} role="menuitem" className="labs-menu-item"
          onClick={() => perform(() => workspace ? workspace.openDocument({ schemaVersion: 1, topology: lab }) : replace(() => useStore.getState().loadBundledLab(index)))}>
          <span className="labs-menu-title">{lab.lab!.title}</span><span className="labs-menu-blurb">{lab.lab!.blurb}</span>
        </button>)}
        <div className="labs-menu-section">{t('navigation.labsExamples')}</div>
        {EXAMPLES.map((example, index) => <button type="button" key={example.title} role="menuitem" className="labs-menu-item"
          onClick={() => perform(() => workspace ? workspace.openDocument({ schemaVersion: 1, topology: example.file }) : replace(() => useStore.getState().loadExample(index)))}>
          <span className="labs-menu-title">{example.title}</span><span className="labs-menu-blurb">{example.blurb}</span>
        </button>)}
        <div className="labs-menu-note">{t(workspace ? 'navigation.labsNewPlanNote' : 'navigation.labsReplaceNote')}</div>
      </>}
      {menu === 'help' && <>
        <button type="button" className="labs-menu-item toolbar-menu-action" role="menuitem" data-help-page="ipv4" aria-haspopup="dialog"
          onClick={() => { closeMenu(true); learningHelp?.open('ipv4', anchor.current); }}>{t('learningHelp.title')}</button>
        <a className="labs-menu-item toolbar-help-link" role="menuitem" href={USER_GUIDE_URL}
          target="_blank" rel="noopener noreferrer" onClick={() => closeMenu(true)}>{t('navigation.documentation')} ↗</a>
      </>}
    </FloatingPopover>}

    {menu === 'file' && exportOpen && <FloatingPopover anchor={exportAnchor} id="toolbar-export-menu" label={t('navigation.export')} role="menu"
      width={300} preferredSide="right" initialFocus={exportFocus} popupRef={exportPopup} relatedRefs={[parentPopup]}
      className="labs-menu toolbar-command-menu toolbar-export-submenu" onClose={closeExport}
      onPointerEnter={cancelHoverClose}
      onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleExportClose(); }}
      onKeyDown={event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); closeExport(); exportAnchor.current?.focus(); }
        else typeAhead(event);
      }}>
      <button type="button" className="labs-menu-item" role="menuitem" data-open-topology-studio aria-haspopup="dialog"
        onClick={() => { const origin = anchor.current; closeMenu(); setStudio({ origin }); }}>
        <span className="labs-menu-title">{studioText(language, 'open')}</span><span className="labs-menu-blurb">{studioText(language, 'hint')}</span>
      </button>
      {EXPORTS.map(item => <button key={item.action} type="button" className="labs-menu-item" role="menuitem" data-export-action={item.action}
        onClick={() => perform(() => useStore.getState()[item.action]())}>
        <span className="labs-menu-title">{t(item.label)}</span><span className="labs-menu-blurb">{t(item.hint)}</span>
      </button>)}
    </FloatingPopover>}

    {studio && <Suspense fallback={null}><TopologyStudio origin={studio.origin} onClose={() => setStudio(null)}/></Suspense>}
    {dialog === 'settings' && <FloatingPopover anchor={anchor} id="inspector-layout-settings" label={t('navigation.settings')} width={300}
      className="inspector-layout-settings" onClose={() => setDialog(null)}>
      <h2 className="toolbar-dialog-title">{t('navigation.settings')}</h2>
      <InspectorSettingsContent value={inspectorLayout} onChange={onInspectorLayoutChange} />
    </FloatingPopover>}
    {dialog === 'packets' && <FloatingPopover anchor={packetAnchor} id="packet-capture-menu" label={t('navigation.packetSettings')}
      role="menu" width={250} className="labs-menu" onClose={() => setDialog(null)}>
      {[
        { action: 'inspector', label: t(packetInspectorOpen ? 'navigation.hidePackets' : 'navigation.openPackets'), run: togglePackets, disabled: false },
        { action: 'start', label: t('navigation.startCapture'), run: () => useStore.getState().startPacketCapture(), disabled: captureStatus !== 'stopped' },
        { action: 'pause', label: t('navigation.pauseCapture'), run: () => useStore.getState().pausePacketCapture(), disabled: captureStatus !== 'capturing' },
        { action: 'resume', label: t('navigation.resumeCapture'), run: () => useStore.getState().resumePacketCapture(), disabled: captureStatus !== 'paused' },
        { action: 'stop', label: t('navigation.stopCapture'), run: () => useStore.getState().stopPacketCapture(), disabled: captureStatus === 'stopped' },
      ].map(item => <button key={item.action} type="button" role="menuitem" className="labs-menu-item" data-capture-action={item.action}
        disabled={item.disabled} onClick={() => { item.run(); setDialog(null); }}>{item.label}</button>)}
    </FloatingPopover>}
    <input ref={fileRef} type="file" accept="application/json" hidden onChange={event => onFile(event.target.files?.[0])} />
    {notice && <div className="notice toolbar-notice" role="status" aria-live="polite">{editorMessageText(notice, t)}</div>}
  </header>;
}
