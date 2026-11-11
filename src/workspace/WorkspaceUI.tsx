import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SessionController } from '../persistence/sessionController';
import type { DraftControllerState, SessionControllerState, SessionError, SessionResult } from '../persistence/sessionTypes';
import type { ProjectRepository } from '../projects/repository';
import type { ProjectDocument, ProjectMetadata } from '../projects/types';
import { hasPendingForms } from '../persistence/pendingForms';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import { translate, useLanguage, useTranslation, type Language } from '../i18n';
import { createEmptyProjectDocument } from '../projects/projectDocument';

export const emptyPlan: ProjectDocument = createEmptyProjectDocument();
/** An unnamed draft still needs Save As, even when it contains nothing to lose.
 * Keep that persistence meaning intact; this exception belongs to close UX. */
export function canCloseEmptyDraft(draft: DraftControllerState, document: ProjectDocument | null): boolean {
  if (draft.base || draft.pendingPersistence || draft.saving || draft.error || !document) return false;
  try { return encodeDraftDocument(document).json === encodeDraftDocument(emptyPlan).json; }
  catch { return false; } // An unreadable copy must remain recoverable.
}
export function workspaceStatus(state: SessionControllerState, language: Language = useLanguage.getState().language): string {
  const draft = state.drafts.find(d => d.id === state.activeDraftId);
  if (state.error || draft?.error) return translate(language, 'workspace.statusError');
  if (!draft) return translate(language, 'workspace.noPlan');
  if (draft.saving) return translate(language, 'workspace.statusSaving');
  if (draft.pendingPersistence) return translate(language, 'workspace.statusPending');
  return translate(language, draft.manualSavePending ? (draft.base ? 'workspace.statusDraftChanged' : 'workspace.statusDraft') : 'workspace.statusSaved');
}
export function sessionErrorMessage(error: SessionError, language: Language = useLanguage.getState().language): string {
  if (['conflict', 'draft-conflict', 'session-conflict', 'meta-conflict', 'stale-edit'].includes(error.code)) return translate(language, 'workspace.errorConflict');
  if (error.code === 'quota-exceeded') return translate(language, 'workspace.errorQuota');
  if (error.code === 'legacy-recovery-required') return translate(language, 'workspace.errorLegacy');
  if (['incompatible-document', 'incompatible-database', 'corrupt-data', 'invalid-document'].includes(error.code)) return translate(language, 'workspace.errorDocument');
  if (['unavailable', 'blocked', 'closed', 'version-changed'].includes(error.code)) return translate(language, 'workspace.errorUnavailable');
  if (error.code === 'deleted' || error.code === 'draft-closed') return translate(language, 'workspace.errorDeleted');
  if (error.code === 'unapplied-forms') return translate(language, 'workspace.errorForms');
  if (error.code === 'runtime-changed') return translate(language, 'workspace.errorChanged');
  return translate(language, 'workspace.errorGeneric');
}
export function exportWorkspaceDocument(document: ProjectDocument, name = 'NetLab-Backup'): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document.topology, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a'); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g, '-') + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface WorkspaceUIValue {
  state: SessionControllerState;
  busy: boolean;
  status: string;
  newPlan(): void;
  loadPlans(): void;
  openPlan(id: string): void;
  save(as?: boolean): void;
  close(id?: string): void;
  switchTo(id: string): void;
  openDocument(document: ProjectDocument): void;
  importJson(text: string): void;
  reorder(id: string, before: string): void;
}
const WorkspaceContext = createContext<WorkspaceUIValue | null>(null);
export const useWorkspaceUI = () => useContext(WorkspaceContext);
type Dialog = { kind: 'name'; id: string; closeSequence?: number; forms?: boolean } |
  { kind: 'close'; id: string; sequence: number; forms: boolean } | { kind: 'load' } |
  { kind: 'forms'; proceed: () => void } | { kind: 'delete'; plan: ProjectMetadata };

function Modal({ title, children, cancel, busy }: { title: string; children: ReactNode; cancel(): void; busy: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null; ref.current?.showModal();
    return () => { ref.current?.close(); focused?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="workspace-dialog" aria-labelledby="workspace-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <header><h2 id="workspace-dialog-title">{title}</h2><button type="button" aria-label={t('common.close')} disabled={busy} onClick={cancel}>×</button></header>
    {children}
  </dialog>, document.body);
}

export function WorkspaceProvider({ controller, repository, children }: { controller: SessionController; repository: ProjectRepository; children: ReactNode }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState(() => controller.getState()), [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null), [name, setName] = useState(''), [plans, setPlans] = useState<ProjectMetadata[]>([]);
  const [error, setError] = useState<SessionError | null>(null), [muted, setMuted] = useState('');
  const [errorDraftId, setErrorDraftId] = useState<string>();
  const working = useRef(false), retry = useRef<{ work: () => Promise<SessionResult<unknown>>; draftId?: string } | null>(null);
  useEffect(() => { setState(controller.getState()); return controller.subscribe(() => setState(controller.getState())); }, [controller]);
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app'); if (app) app.inert = busy;
    return () => { if (app) app.inert = false; };
  }, [busy]);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.main'); if (main) main.inert = state.activeDraftId === null;
    return () => { if (main) main.inert = false; };
  }, [state.activeDraftId]);
  const run = async <T,>(work: () => Promise<SessionResult<T>>, draftId = controller.getState().activeDraftId ?? undefined): Promise<SessionResult<T> | undefined> => {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); setErrorDraftId(draftId); retry.current = { work, draftId }; }
      else { setError(null); setErrorDraftId(undefined); retry.current = null; setMuted(''); }
      return result;
    } catch { const detail: SessionError = { code: 'storage-error', message: 'Operation failed.' }; setError(detail); setErrorDraftId(draftId); retry.current = { work, draftId }; return { ok: false, error: detail }; }
    finally { working.current = false; setBusy(false); }
  };
  const guarded = (work: (discard: boolean) => Promise<SessionResult<unknown>>) => {
    if (working.current) return;
    if (hasPendingForms()) setDialog({ kind: 'forms', proceed: () => { setDialog(null); void run(() => work(true)); } });
    else void run(() => work(false));
  };
  const openDocument = (document: ProjectDocument) => guarded(discard => controller.openDocument(document, { discardUnappliedForms: discard }));
  const save = (as = false, id = controller.getState().activeDraftId) => {
    if (!id) return;
    const draft = controller.getState().drafts.find(d => d.id === id); if (!draft) return;
    if (as || !draft.base) { setName(as && draft.base ? t('workspace.copyName', { name: draft.base.planName }) : draft.base?.planName ?? ''); setDialog({ kind: 'name', id }); }
    else void run(() => controller.saveOpenDraft(id), id);
  };
  const close = (id = controller.getState().activeDraftId ?? undefined) => {
    if (!id || working.current) return;
    const current = controller.getState(), draft = current.drafts.find(d => d.id === id); if (!draft) return;
    const forms = current.activeDraftId === id && hasPendingForms();
    const empty = !forms && draft.base === null && canCloseEmptyDraft(draft, controller.recoveryDocument(current.activeDraftId === id ? undefined : id));
    if (!empty && (draft.manualSavePending || forms || draft.pendingPersistence)) setDialog({ kind: 'close', id, sequence: draft.editSequence, forms });
    else void run(() => controller.closeDraft(id, { expectedEditSequence: draft.editSequence, discardChanges: empty }), id).then(result => {
      if (result && !result.ok && result.error.code === 'deleted') setDialog({ kind: 'close', id, sequence: draft.editSequence, forms });
    });
  };
  const finishClose = async (id: string, sequence: number, discardChanges: boolean, forms: boolean) => {
    const result = await run(() => controller.closeDraft(id, { expectedEditSequence: sequence, discardChanges, discardUnappliedForms: forms }), id);
    if (result?.ok) setDialog(null);
  };
  const saveThenClose = async (id: string, sequence: number, forms: boolean, inputName?: string) => {
    const saved = await run(() => controller.saveOpenDraft(id, inputName), id);
    if (!saved?.ok) return;
    if (saved.value.hasNewerEdits || controller.getState().drafts.find(d => d.id === id)?.editSequence !== sequence) {
      retry.current = null; setErrorDraftId(id); setError({ code: 'runtime-changed', message: 'New changes after close confirmation.' }); return;
    }
    await finishClose(id, sequence, false, forms);
  };
  const loadPlans = () => {
    setDialog({ kind: 'load' });
    void run(async () => { const listed = await repository.listProjects(); if (listed.ok) setPlans(listed.value); return listed; });
  };
  const active = state.drafts.find(d => d.id === state.activeDraftId), problem = error ?? (state.error?.message !== muted ? state.error : null);
  const value: WorkspaceUIValue = { state, busy, status: workspaceStatus(state, language), newPlan: () => openDocument(emptyPlan), loadPlans, save, close, openDocument,
    openPlan: id => guarded(discard => controller.openPlan(id, { discardUnappliedForms: discard })),
    switchTo: id => { if (id !== controller.getState().activeDraftId) guarded(discard => controller.switchDraft(id, { discardUnappliedForms: discard })); },
    importJson: text => { try { openDocument({ schemaVersion: 1, topology: JSON.parse(text) }); } catch { retry.current = null; setErrorDraftId(undefined); setError({ code: 'invalid-document', message: 'Invalid JSON.' }); } },
    reorder: (id, before) => { const ids = controller.getState().session?.draftIds ?? []; const order = ids.filter(d => d !== id); order.splice(order.indexOf(before), 0, id); void run(() => controller.reorderTabs(order)); },
  };
  const failedId = error ? errorDraftId : state.drafts.find(d => d.error)?.id;
  const retryOperation = error ? retry.current : { work: () => controller.flush(failedId), draftId: failedId };
  const backup = () => {
    const copy = controller.recoveryDocument(failedId === state.activeDraftId ? undefined : failedId);
    const draft = state.drafts.find(d => d.id === failedId) ?? active;
    if (copy) exportWorkspaceDocument(copy, draft?.base?.planName);
  };
  return <WorkspaceContext.Provider value={value}>
    {children}
    {!state.activeDraftId && <aside className="workspace-empty-state"><h2>{t('workspace.noPlan')}</h2><p>{t('workspace.newNote')}</p><button className="btn btn--primary" onClick={value.newPlan}>{t('workspace.new')}</button><button className="btn" onClick={loadPlans}>{t('navigation.plans')}</button></aside>}
    {problem && <aside className="workspace-recovery" role="alert" data-error-code={problem.code}>
      <div><strong>{t('workspace.changesKept')}</strong><p>{sessionErrorMessage(problem, language)}</p></div>
      {retryOperation && <button type="button" className="btn" disabled={busy} onClick={() => void run(retryOperation.work, retryOperation.draftId)}>{t('workspace.retry')}</button>}
      <button type="button" className="btn" onClick={backup}>{t('workspace.exportBackup')}</button>
      <button type="button" className="btn" onClick={() => { setError(null); setMuted(state.error?.message ?? ''); }}>{t('common.cancel')}</button>
    </aside>}
    {state.pendingShare && <aside className="workspace-share" role="status"><span>{t('workspace.shareOffer')}</span><button className="btn" onClick={() => guarded(discard => controller.acceptShare({ discardUnappliedForms: discard }))}>{t('workspace.openNewTab')}</button><button className="btn" onClick={() => controller.dismissShare()}>{t('common.cancel')}</button></aside>}
    {dialog && <Modal key={dialog.kind} title={t(dialog.kind === 'name' ? 'workspace.saveTitle' : dialog.kind === 'load' ? 'workspace.plans' : dialog.kind === 'forms' ? 'workspace.formsTitle' : dialog.kind === 'delete' ? 'workspace.deleteTitle' : 'workspace.closeTitle')} cancel={() => setDialog(null)} busy={busy}>
      {problem && <div className="workspace-dialog-error" role="alert"><p>{sessionErrorMessage(problem, language)}</p><button className="btn" type="button" onClick={backup}>{t('workspace.exportBackup')}</button></div>}
      {dialog.kind === 'name' && <form onSubmit={event => { event.preventDefault(); if (!name.trim() || busy) return; if (dialog.closeSequence !== undefined) void saveThenClose(dialog.id, dialog.closeSequence, !!dialog.forms, name.trim()); else void run(() => controller.saveOpenDraft(dialog.id, name.trim()), dialog.id).then(r => { if (r?.ok) setDialog(null); }); }}>
        <label className="workspace-name-label">{t('workspace.name')}<input autoFocus maxLength={200} value={name} placeholder={t('workspace.placeholder')} onChange={e => setName(e.target.value)} /></label>
        <p className="workspace-dialog-note">{t('workspace.saveNote')}</p>
        <footer><button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>{t('common.cancel')}</button><button className="btn btn--primary" disabled={busy || !name.trim()}>{t(busy ? 'common.loading' : 'navigation.save')}</button></footer>
      </form>}
      {dialog.kind === 'close' && <>
        <p>{t('workspace.closeNote', { name: state.drafts.find(d => d.id === dialog.id)?.base?.planName ?? t('workspace.untitled') })}</p>
        {dialog.forms && <p className="workspace-dialog-warning">{t('workspace.closeFormsWarning')}</p>}
        <footer><button className="btn" disabled={busy} onClick={() => setDialog(null)}>{t('common.cancel')}</button><button className="btn" disabled={busy} onClick={() => void finishClose(dialog.id, dialog.sequence, true, dialog.forms)}>{t('workspace.discard')}</button>
          <button className="btn btn--primary" disabled={busy} onClick={() => { const draft = state.drafts.find(d => d.id === dialog.id); if (!draft?.base) { setName(''); setDialog({ kind: 'name', id: dialog.id, closeSequence: dialog.sequence, forms: dialog.forms }); } else void saveThenClose(dialog.id, dialog.sequence, dialog.forms); }}>{t('navigation.save')}</button></footer>
      </>}
      {dialog.kind === 'forms' && <><p>{t('workspace.formsNote')}</p><footer><button className="btn" onClick={() => setDialog(null)}>{t('common.cancel')}</button><button className="btn btn--primary" onClick={dialog.proceed}>{t('workspace.discardContinue')}</button></footer></>}
      {dialog.kind === 'load' && <><p className="workspace-dialog-note">{t('workspace.loadNote')}</p><div className="workspace-plan-list">
        {!plans.length && <p className="workspace-empty-list">{t('workspace.empty')}</p>}
        {plans.map(plan => <div className="workspace-plan-row" key={plan.id}><button className="workspace-plan-open" disabled={busy} onClick={() => { setDialog(null); value.openPlan(plan.id); }}><strong>{plan.name}</strong><span>{new Date(plan.updatedAt).toLocaleString(language)} · {t(state.drafts.some(d => d.base?.planId === plan.id) ? 'workspace.opened' : 'workspace.saved')}</span></button><button className="btn" disabled={busy} aria-label={t('workspace.deleteNamed', { name: plan.name })} onClick={() => setDialog({ kind: 'delete', plan })}>{t('workspace.delete')}</button></div>)}
      </div><footer><button className="btn" onClick={() => setDialog(null)}>{t('common.cancel')}</button></footer></>}
      {dialog.kind === 'delete' && <><p>{t('workspace.deleteNote', { name: dialog.plan.name })}</p><footer><button className="btn" disabled={busy} onClick={loadPlans}>{t('common.cancel')}</button><button className="btn" disabled={busy} onClick={() => void run(() => repository.deleteProject(dialog.plan.id, dialog.plan.revision)).then(r => { if (r?.ok) loadPlans(); })}>{t('workspace.delete')}</button></footer></>}
    </Modal>}
  </WorkspaceContext.Provider>;
}

export function WorkspaceTabs() {
  const { t } = useTranslation();
  const ui = useWorkspaceUI(); const focus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { focus.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); focus.current?.focus({ preventScroll: true }); }, [ui?.state.activeDraftId]);
  if (!ui) return null;
  const ids = ui.state.session?.draftIds ?? [];
  return <div className="workspace-tabs-bar"><div role="tablist" aria-label={t('workspace.openPlans')} className="workspace-tabs">
    {ui.state.drafts.map((draft, index) => <div className="workspace-tab-wrap" key={draft.id} data-active={draft.id === ui.state.activeDraftId} draggable={!ui.busy}
      onDragStart={e => e.dataTransfer.setData('application/x-netlab-draft', draft.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('application/x-netlab-draft'); if (ids.includes(id) && id !== draft.id) ui.reorder(id, draft.id); }}>
      <button role="tab" aria-selected={draft.id === ui.state.activeDraftId} tabIndex={draft.id === ui.state.activeDraftId ? 0 : -1}
        ref={element => { if (draft.id === ui.state.activeDraftId) focus.current = element; }}
        onMouseDown={e => e.preventDefault()} onClick={() => ui.switchTo(draft.id)} title={`${draft.base?.planName ?? t('workspace.untitled')}${draft.manualSavePending ? ' · ' + t('workspace.unsaved') : ''}`}
        onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const next = ids[index + (e.key === 'ArrowLeft' ? -1 : 1)]; if (next) ui.reorder(e.key === 'ArrowLeft' ? draft.id : next, e.key === 'ArrowLeft' ? next : draft.id); } else { const next = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1)! : ids[(index + (e.key === 'ArrowLeft' ? -1 : 1) + ids.length) % ids.length]; ui.switchTo(next); } } }}>
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="12" y="12" width="4" height="4" rx="1"/><path d="M4 6v8h8M6 4h8v8"/></svg>
        <span className="workspace-tab-name">{draft.base?.planName ?? t('workspace.untitled')}</span>{draft.manualSavePending && <span className="workspace-dirty" aria-label={t('workspace.unsaved')}>●</span>}
      </button><button className="workspace-tab-close" aria-label={t('workspace.closeNamed', { name: draft.base?.planName ?? t('workspace.untitled') })} onMouseDown={e => e.preventDefault()} onClick={() => ui.close(draft.id)}>×</button>
    </div>)}
    {!ids.length && <span className="workspace-no-tabs">{t('workspace.noPlan')}</span>}
  </div><button type="button" className="workspace-add" title={t('workspace.new')} aria-label={t('workspace.new')} disabled={ui.busy} onMouseDown={e => e.preventDefault()} onClick={ui.newPlan}>+<span> {t('workspace.new')}</span></button></div>;
}
