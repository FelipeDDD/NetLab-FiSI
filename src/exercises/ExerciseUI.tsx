import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import { hasPendingForms } from '../persistence/pendingForms';
import { useStore } from '../store';
import { sim } from '../sim';
import { BETA_EXERCISES, betaChecks } from './beta';
import { ExerciseController, type ExerciseState } from './exerciseController';
import './exercises.css';

const Context = createContext<{ controller: ExerciseController; state: ExerciseState } | null>(null);
export function ExerciseProvider({ sessions, repository, children }: { sessions: SessionController; repository: ProjectRepository; children: ReactNode }) {
  const [controller] = useState(() => new ExerciseController(sessions, repository, {
    network: () => sim.net,
    signature: () => JSON.stringify(useStore.getState().captureWorkspaceDocument()),
    subscribe: listener => useStore.subscribe(listener), pendingForms: hasPendingForms,
    run: () => useStore.getState().setPaused(false),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [, redraw] = useState(0);
  useEffect(() => {
    void controller.initialize();
    const release = sessions.subscribe(() => redraw(v => v + 1));
    const focus = () => { void controller.refresh(); };
    const before = (e: BeforeUnloadEvent) => { if (controller.getState().busy || controller.getState().saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('focus', focus); window.addEventListener('beforeunload', before);
    return () => { release(); window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', before); controller.dispose(); };
  }, [controller, sessions]);
  return <Context.Provider value={{ controller, state }}>{children}</Context.Provider>;
}

export function ExerciseMenu({ close }: { close(): void }) {
  const ui = useContext(Context);
  useEffect(() => { if (ui) void ui.controller.refresh(); }, [ui?.controller]);
  if (!ui) return <p>Übungen benötigen den lokalen Planspeicher.</p>;
  const { controller, state } = ui;
  return <>
    <p className="exercise-note">Experimentelle Übungen · Fortschritt nur auf diesem Browserprofil.</p>
    {state.error && <p role="alert">{state.error} <button className="btn" onClick={() => void controller.retry()}>Erneut versuchen</button></p>}
    {BETA_EXERCISES.map(e => {
      const completion = state.progress.completed[e.id], resume = controller.resumable(e.id);
      const started = Object.values(state.progress.attempts).some(a => a.exerciseId === e.id);
      return <section key={e.id} className="exercise-menu-entry" data-exercise={e.id}>
        <strong>{e.student.title}</strong>
        <span className={completion ? 'exercise-completed' : 'exercise-note'}>{completion ? '✓ Abgeschlossen' : started ? 'In Bearbeitung' : 'Noch nicht begonnen'}</span>
        {completion && <small>{new Date(completion.completedAt).toLocaleDateString('de-DE')} · Version {completion.contentVersion}</small>}
        <div className="exercise-menu-actions">
          {resume && <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { void controller.resume(resume.draftId); close(); }}>Fortsetzen</button>}
          <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { void controller.start(e.id); close(); }}>{completion ? 'Erneut starten' : resume ? 'Neuer Versuch' : 'Starten'}</button>
        </div>
      </section>;
    })}
  </>;
}

export function ExercisePanel() {
  const ui = useContext(Context), [collapsed, setCollapsed] = useState(false);
  const active = ui?.controller.activeAttempt();
  useEffect(() => setCollapsed(false), [active?.id]);
  if (!ui) return null;
  const { controller, state } = ui;
  const exercise = BETA_EXERCISES.find(e => e.id === active?.exerciseId);
  if (!exercise || !active) return state.error ? <aside className="exercise-error" role="alert">{state.error} <button className="btn" onClick={() => void controller.retry()}>Erneut versuchen</button></aside> : null;
  const checks = betaChecks[exercise.id], currentVersion = active.contentVersion === exercise.contentVersion;
  return <aside className={`exercise-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Übung" data-exercise={exercise.id}>
    <header><strong>{exercise.student.title}</strong><button className="btn btn--icon" aria-label={collapsed ? 'Übung erweitern' : 'Übung einklappen'} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button></header>
    {!collapsed && <>
      <div className="exercise-body">
        <p>{exercise.student.description}</p><p>{exercise.student.task}</p>
        <ul>{exercise.student.requirements.map(r => {
          const required = checks.filter(a => a.requirementId === r.id);
          const done = required.length > 0 && required.every(a => state.results[a.id]);
          const pass = done && required.every(a => state.results[a.id].pass);
          const failed = required.some(a => state.results[a.id]?.pass === false);
          return <li key={r.id} data-result={pass ? 'pass' : failed ? 'fail' : 'pending'}>
            <span aria-label={pass ? 'Erfüllt' : failed ? 'Nicht erfüllt' : 'Noch nicht geprüft'}>{pass ? '✓' : failed ? '✗' : '○'}</span> {r.text}
            {failed && <small>Nicht erfüllt – Konfiguration und Erreichbarkeit prüfen.</small>}
          </li>;
        })}</ul>
      </div>
      <footer>
        <button className="btn btn--primary" disabled={!state.ready || state.busy || state.checking || !currentVersion} onClick={() => void controller.verify()}>{state.checking ? 'Prüfung läuft…' : 'Überprüfen'}</button>
        {state.checking && !state.saving && <button className="btn" onClick={() => controller.cancel('Prüfung abgebrochen.')}>Abbrechen</button>}
        <small>Prüfung startet die Simulation und sendet Testpakete. Bei Pause mit Run fortsetzen.</small>
        <p role="status">{state.message}</p>
        {!currentVersion && <p>Inhaltsversion geändert. Bitte einen neuen Versuch starten.</p>}
        {state.error && <p role="alert">{state.error}</p>}
        <small>Versuch {active.id.slice(0, 8)} · Version {active.contentVersion}</small>
      </footer>
    </>}
  </aside>;
}
