import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import { hasPendingForms } from '../persistence/pendingForms';
import { useStore } from '../store';
import { sim } from '../sim';
import { AVAILABLE_EXERCISES, exerciseChecks, practicalExercise } from './beta';
import { ExerciseController, type ExerciseState } from './exerciseController';
import './exercises.css';
import { useTranslation } from '../i18n';
import { PracticeLauncher } from './practice/PracticeSurface';
import { usePractice } from './practice/session';
import type { PracticalCriterion } from './practicalTypes';

function criterionLabel(c:PracticalCriterion) {
  const name=(id:string)=>sim.net.devices.get(id)?.name??id;
  if(c.kind==='route')return `${name(c.device)}: Weg zu ${c.target}`;
  if(c.kind==='engine') {
    const check=c.check;
    if(check.type==='iface-ip')return `${name(check.device)} / ${check.iface}`;
    if(check.type==='forwarding')return `${name(check.device)}: IP-Forwarding`;
    if(check.type==='ping')return `${name(check.from)} → ${check.toDevice?name(check.toDevice):check.toAddr}`;
  }
  return c.label;
}

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
  const { t, language } = useTranslation();
  useEffect(() => { if (ui) void ui.controller.refresh(); }, [ui?.controller]);
  if (!ui) return <><PracticeLauncher close={close} /><p>{t('exercises.storage')}</p></>;
  const { controller, state } = ui;
  return <>
    <PracticeLauncher close={close} />
    <p className="exercise-note">{t('exercises.note')} {t('exercises.contentLanguage')}</p>
    {state.error && <p role="alert">{state.error} <button className="btn" onClick={() => void controller.retry()}>{t('common.retry')}</button></p>}
    {AVAILABLE_EXERCISES.map(e => {
      const pilot=practicalExercise(e.id);
      const completion = state.progress.completed[e.id], resume = controller.resumable(e.id);
      const started = Object.values(state.progress.attempts).some(a => a.exerciseId === e.id);
      return <section key={e.id} className="exercise-menu-entry" data-exercise={e.id}>
        <strong>{e.student.title}</strong>
        {pilot&&<small>{t('exercises.pilot')}</small>}
        <span className={completion ? 'exercise-completed' : 'exercise-note'}>{completion ? '✓ ' + t(pilot?'exercises.technical':'exercises.completed') : started ? t('exercises.started') : t('exercises.untouched')}</span>
        {completion && <small>{new Date(completion.completedAt).toLocaleDateString(language)} · Version {completion.contentVersion}</small>}
        <div className="exercise-menu-actions">
          {resume && <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { usePractice.getState().close(); void controller.resume(resume.draftId); close(); }}>{t('exercises.resume')}</button>}
          <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { usePractice.getState().close(); void controller.start(e.id); close(); }}>{t(completion ? 'exercises.restart' : resume ? 'exercises.attempt' : 'exercises.start')}</button>
        </div>
      </section>;
    })}
  </>;
}

export function ExercisePanel() {
  const {t}=useTranslation();
  const practiceOpen=usePractice(s=>s.open);
  const ui = useContext(Context), [collapsed, setCollapsed] = useState(false);
  const active = ui?.controller.activeAttempt();
  useEffect(() => setCollapsed(false), [active?.id]);
  if (!ui || practiceOpen) return null;
  const { controller, state } = ui;
  const exercise = AVAILABLE_EXERCISES.find(e => e.id === active?.exerciseId);
  if (!exercise || !active) return state.error ? <aside className="exercise-error" role="alert">{state.error} <button className="btn" onClick={() => void controller.retry()}>Erneut versuchen</button></aside> : null;
  const checks = exerciseChecks(exercise.id), currentVersion = active.contentVersion === exercise.contentVersion, pilot=practicalExercise(exercise.id);
  return <aside className={`exercise-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Übung" data-exercise={exercise.id}>
    <header><strong>{exercise.student.title}</strong><button className="btn btn--icon" aria-label={t(collapsed?'exercises.expand':'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button></header>
    {!collapsed && <>
      <div className="exercise-body">
        <p lang="de">{exercise.student.description}</p><p lang="de">{exercise.student.task}</p>
        <ul>{exercise.student.requirements.map(r => {
          const required = checks.filter(a => a.requirementId === r.id);
          const done = required.length > 0 && required.every(a => state.results[a.id]);
          const pass = done && required.every(a => state.results[a.id].pass);
          const failed = required.some(a => state.results[a.id]?.pass === false);
          return <li key={r.id} data-result={pass ? 'pass' : failed ? 'fail' : 'pending'}>
            <span aria-label={t(pass?'exercises.met':failed?'exercises.failed':'exercises.pending')}>{pass ? '✓' : failed ? '✗' : '○'}</span> <span lang="de">{r.text}</span>
            {pilot? <details className="exercise-check-details"><summary>{t('exercises.details')} ({required.length})</summary><ul className="exercise-criteria">{required.map(c=>{
              const result=state.results[c.id];return <li key={c.id} data-check={c.id}>
                <span>{t(result?result.pass?'exercises.met':'exercises.failed':'exercises.pending')}</span>{'label' in c&&<strong lang="de"> · {criterionLabel(c)}</strong>}
                {result&&<small lang="de">{result.detail}</small>}
              </li>;
            })}</ul></details>:failed && <small>Nicht erfüllt – Konfiguration und Erreichbarkeit prüfen.</small>}
          </li>;
        })}</ul>
        {pilot&&<><details className="exercise-manual"><summary>{t('exercises.manual')}</summary>{pilot.manualReview.map(text=><p lang="de" key={text}>{text}</p>)}</details><small>{t('exercises.persistence')}</small></>}
      </div>
      <footer>
        <button className="btn btn--primary" disabled={!state.ready || state.busy || state.checking || !currentVersion} onClick={() => void controller.verify()}>{state.checking ? t('exercises.checking') : pilot?t('exercises.check'):'Überprüfen'}</button>
        {state.checking && !state.saving && <button className="btn" onClick={() => controller.cancel('Prüfung abgebrochen.')}>{t('exercises.cancel')}</button>}
        <small>{t('exercises.probeNote')}</small>
        <p role="status">{state.message}</p>
        {!currentVersion && <p>{t('exercises.versionChanged')}</p>}
        {state.error && <p role="alert">{state.error}</p>}
        <small>{t('exercises.attemptLabel')} {active.id.slice(0, 8)} · Version {active.contentVersion}</small>
      </footer>
    </>}
  </aside>;
}
