import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SessionController } from '../persistence/sessionController';
import type { SessionControllerState, SessionError, SessionResult } from '../persistence/sessionTypes';
import type { ProjectRepository } from '../projects/repository';
import type { ProjectDocument, ProjectMetadata } from '../projects/types';
import { hasPendingForms } from '../persistence/pendingForms';

export const emptyPlan: ProjectDocument = { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [], links: [] } };
export function workspaceStatus(state: SessionControllerState): string {
  const draft = state.drafts.find(d => d.id === state.activeDraftId);
  if (state.error || draft?.error) return 'Speicherfehler';
  if (!draft) return 'Kein Plan geöffnet';
  if (draft.saving) return 'Wird gesichert…';
  if (draft.pendingPersistence) return 'Änderungen werden gesichert…';
  return draft.manualSavePending ? 'Entwurf gesichert · nicht gespeichert' : 'Gespeichert';
}
export function sessionErrorMessage(error: SessionError): string {
  if (['conflict', 'draft-conflict', 'session-conflict', 'meta-conflict', 'stale-edit'].includes(error.code)) return 'In einem anderen Tab geändert. Ihre lokale Kopie bleibt erhalten. Bitte zuerst ein Backup exportieren.';
  if (error.code === 'quota-exceeded') return 'Der Speicher ist voll. Ihre Änderungen bleiben geöffnet. Exportieren Sie ein Backup oder versuchen Sie es erneut.';
  if (error.code === 'legacy-recovery-required') return 'Die bisherige Topologie konnte nicht sicher übernommen werden. Das Original bleibt erhalten und kann exportiert werden.';
  if (['incompatible-document', 'incompatible-database', 'corrupt-data', 'invalid-document'].includes(error.code)) return 'Dieser Plan kann nicht sicher geöffnet werden. Vorhandene Daten bleiben unverändert.';
  if (['unavailable', 'blocked', 'closed', 'version-changed'].includes(error.code)) return 'Der lokale Speicher ist nicht verfügbar. Ihre geöffnete Topologie bleibt erhalten. Exportieren Sie ein Backup.';
  if (error.code === 'deleted' || error.code === 'draft-closed') return 'Dieser Plan wurde in einem anderen Tab geschlossen oder gelöscht. Exportieren Sie Ihre lokale Kopie.';
  if (error.code === 'unapplied-forms') return 'Es gibt noch nicht übernommene Formulareingaben. Bitte übernehmen oder ausdrücklich verwerfen.';
  if (error.code === 'runtime-changed') return 'Während des Vorgangs wurden neue Änderungen erkannt. Die geöffnete Topologie bleibt erhalten. Bitte prüfen und erneut versuchen.';
  return 'Der Vorgang konnte nicht abgeschlossen werden. Ihre lokale Kopie bleibt erhalten.';
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null; ref.current?.showModal();
    return () => { ref.current?.close(); focused?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="workspace-dialog" aria-labelledby="workspace-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <header><h2 id="workspace-dialog-title">{title}</h2><button type="button" aria-label="Dialog schließen" disabled={busy} onClick={cancel}>×</button></header>
    {children}
  </dialog>, document.body);
}

export function WorkspaceProvider({ controller, repository, children }: { controller: SessionController; repository: ProjectRepository; children: ReactNode }) {
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
    if (as || !draft.base) { setName(as && draft.base ? draft.base.planName + ' – Kopie' : draft.base?.planName ?? ''); setDialog({ kind: 'name', id }); }
    else void run(() => controller.saveOpenDraft(id), id);
  };
  const close = (id = controller.getState().activeDraftId ?? undefined) => {
    if (!id || working.current) return;
    const current = controller.getState(), draft = current.drafts.find(d => d.id === id); if (!draft) return;
    const forms = current.activeDraftId === id && hasPendingForms();
    if (draft.manualSavePending || forms || draft.pendingPersistence) setDialog({ kind: 'close', id, sequence: draft.editSequence, forms });
    else void run(() => controller.closeDraft(id, { expectedEditSequence: draft.editSequence }), id).then(result => {
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
  const value: WorkspaceUIValue = { state, busy, status: workspaceStatus(state), newPlan: () => openDocument(emptyPlan), loadPlans, save, close, openDocument,
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
    {!state.activeDraftId && <aside className="workspace-empty-state"><h2>Kein Plan geöffnet</h2><p>Erstellen Sie einen neuen Plan oder öffnen Sie einen gespeicherten.</p><button className="btn btn--primary" onClick={value.newPlan}>Neuer Plan</button><button className="btn" onClick={loadPlans}>Gespeicherte Pläne…</button></aside>}
    {problem && <aside className="workspace-recovery" role="alert" data-error-code={problem.code}>
      <div><strong>Änderungen bleiben erhalten</strong><p>{sessionErrorMessage(problem)}</p></div>
      {retryOperation && <button type="button" className="btn" disabled={busy} onClick={() => void run(retryOperation.work, retryOperation.draftId)}>Erneut versuchen</button>}
      <button type="button" className="btn" onClick={backup}>Backup exportieren</button>
      <button type="button" className="btn" onClick={() => { setError(null); setMuted(state.error?.message ?? ''); }}>Abbrechen</button>
    </aside>}
    {state.pendingShare && <aside className="workspace-share" role="status"><span>Geteilte Topologie öffnen? Ihre Pläne bleiben erhalten.</span><button className="btn" onClick={() => guarded(discard => controller.acceptShare({ discardUnappliedForms: discard }))}>In neuer Registerkarte öffnen</button><button className="btn" onClick={() => controller.dismissShare()}>Abbrechen</button></aside>}
    {dialog && <Modal key={dialog.kind} title={dialog.kind === 'name' ? 'Plan speichern' : dialog.kind === 'load' ? 'Gespeicherte Pläne' : dialog.kind === 'forms' ? 'Nicht übernommene Eingaben' : dialog.kind === 'delete' ? 'Gespeicherten Plan löschen?' : 'Plan schließen?'} cancel={() => setDialog(null)} busy={busy}>
      {problem && <div className="workspace-dialog-error" role="alert"><p>{sessionErrorMessage(problem)}</p><button className="btn" type="button" onClick={backup}>Backup exportieren</button></div>}
      {dialog.kind === 'name' && <form onSubmit={event => { event.preventDefault(); if (!name.trim() || busy) return; if (dialog.closeSequence !== undefined) void saveThenClose(dialog.id, dialog.closeSequence, !!dialog.forms, name.trim()); else void run(() => controller.saveOpenDraft(dialog.id, name.trim()), dialog.id).then(r => { if (r?.ok) setDialog(null); }); }}>
        <label className="workspace-name-label">Name des Plans<input autoFocus maxLength={200} value={name} placeholder="z. B. Büro-Netzwerk" onChange={e => setName(e.target.value)} /></label>
        <p className="workspace-dialog-note">Speichert die übernommenen Einstellungen dieses Plans.</p>
        <footer><button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className="btn btn--primary" disabled={busy || !name.trim()}>{busy ? 'Speichert…' : 'Speichern'}</button></footer>
      </form>}
      {dialog.kind === 'close' && <>
        <p>Änderungen an „{state.drafts.find(d => d.id === dialog.id)?.base?.planName ?? 'Unbenannt'}“ vor dem Schließen speichern?</p>
        {dialog.forms && <p className="workspace-dialog-warning">Nicht übernommene Formulareingaben werden verworfen. Speichern sichert nur bereits übernommene Einstellungen.</p>}
        <footer><button className="btn" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className="btn" disabled={busy} onClick={() => void finishClose(dialog.id, dialog.sequence, true, dialog.forms)}>Verwerfen</button>
          <button className="btn btn--primary" disabled={busy} onClick={() => { const draft = state.drafts.find(d => d.id === dialog.id); if (!draft?.base) { setName(''); setDialog({ kind: 'name', id: dialog.id, closeSequence: dialog.sequence, forms: dialog.forms }); } else void saveThenClose(dialog.id, dialog.sequence, dialog.forms); }}>Speichern</button></footer>
      </>}
      {dialog.kind === 'forms' && <><p>Einige Eingaben wurden noch nicht übernommen. Übernehmen Sie diese im Formular oder verwerfen Sie sie ausdrücklich.</p><footer><button className="btn" onClick={() => setDialog(null)}>Abbrechen</button><button className="btn btn--primary" onClick={dialog.proceed}>Verwerfen und fortfahren</button></footer></>}
      {dialog.kind === 'load' && <><p className="workspace-dialog-note">Öffnet einen Plan, ohne Ihre anderen Entwürfe zu ersetzen.</p><div className="workspace-plan-list">
        {!plans.length && <p className="workspace-empty-list">Noch keine gespeicherten Pläne. Mit „Speichern unter…“ legen Sie den ersten an.</p>}
        {plans.map(plan => <div className="workspace-plan-row" key={plan.id}><button className="workspace-plan-open" disabled={busy} onClick={() => { setDialog(null); guarded(discard => controller.openPlan(plan.id, { discardUnappliedForms: discard })); }}><strong>{plan.name}</strong><span>{new Date(plan.updatedAt).toLocaleString('de-DE')} · {state.drafts.some(d => d.base?.planId === plan.id) ? 'Bereits geöffnet' : 'Gespeichert'}</span></button><button className="btn" disabled={busy} aria-label={`${plan.name} löschen`} onClick={() => setDialog({ kind: 'delete', plan })}>Löschen</button></div>)}
      </div><footer><button className="btn" onClick={() => setDialog(null)}>Abbrechen</button></footer></>}
      {dialog.kind === 'delete' && <><p>„{dialog.plan.name}“ löschen? Geöffnete Entwürfe bleiben erhalten. Der gespeicherte Plan wird nicht mehr in dieser Liste angezeigt.</p><footer><button className="btn" disabled={busy} onClick={loadPlans}>Abbrechen</button><button className="btn" disabled={busy} onClick={() => void run(() => repository.deleteProject(dialog.plan.id, dialog.plan.revision)).then(r => { if (r?.ok) loadPlans(); })}>Löschen</button></footer></>}
    </Modal>}
  </WorkspaceContext.Provider>;
}

export function WorkspaceTabs() {
  const ui = useWorkspaceUI(); const focus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { focus.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); focus.current?.focus({ preventScroll: true }); }, [ui?.state.activeDraftId]);
  if (!ui) return null;
  const ids = ui.state.session?.draftIds ?? [];
  return <div className="workspace-tabs-bar"><div role="tablist" aria-label="Geöffnete Pläne" className="workspace-tabs">
    {ui.state.drafts.map((draft, index) => <div className="workspace-tab-wrap" key={draft.id} data-active={draft.id === ui.state.activeDraftId} draggable={!ui.busy}
      onDragStart={e => e.dataTransfer.setData('application/x-netlab-draft', draft.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('application/x-netlab-draft'); if (ids.includes(id) && id !== draft.id) ui.reorder(id, draft.id); }}>
      <button role="tab" aria-selected={draft.id === ui.state.activeDraftId} tabIndex={draft.id === ui.state.activeDraftId ? 0 : -1}
        ref={element => { if (draft.id === ui.state.activeDraftId) focus.current = element; }}
        onMouseDown={e => e.preventDefault()} onClick={() => ui.switchTo(draft.id)} title={`${draft.base?.planName ?? 'Unbenannt'}${draft.manualSavePending ? ' · Nicht gespeichert' : ''}`}
        onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const next = ids[index + (e.key === 'ArrowLeft' ? -1 : 1)]; if (next) ui.reorder(e.key === 'ArrowLeft' ? draft.id : next, e.key === 'ArrowLeft' ? next : draft.id); } else { const next = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1)! : ids[(index + (e.key === 'ArrowLeft' ? -1 : 1) + ids.length) % ids.length]; ui.switchTo(next); } } }}>
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="12" y="12" width="4" height="4" rx="1"/><path d="M4 6v8h8M6 4h8v8"/></svg>
        <span className="workspace-tab-name">{draft.base?.planName ?? 'Unbenannt'}</span>{draft.manualSavePending && <span className="workspace-dirty" aria-label="Nicht gespeichert">●</span>}
      </button><button className="workspace-tab-close" aria-label={`${draft.base?.planName ?? 'Unbenannt'} schließen`} onMouseDown={e => e.preventDefault()} onClick={() => ui.close(draft.id)}>×</button>
    </div>)}
    {!ids.length && <span className="workspace-no-tabs">Kein Plan geöffnet</span>}
  </div><button type="button" className="workspace-add" title="Neuer Plan" aria-label="Neuer Plan" disabled={ui.busy} onMouseDown={e => e.preventDefault()} onClick={ui.newPlan}>+<span> Neuer Plan</span></button></div>;
}
