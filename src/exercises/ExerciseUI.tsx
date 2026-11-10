import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import { hasPendingForms } from '../persistence/pendingForms';
import { useStore } from '../store';
import { sim } from '../sim';
import { AVAILABLE_EXERCISES, exerciseChecks, practicalExercise } from './beta';
import { ExerciseController, type ExerciseState } from './exerciseController';
import { openNewLearningAttempt } from './newAttempt';
import './exercises.css';
import { useTranslation } from '../i18n';
import { PracticeLauncher } from './practice/PracticeSurface';
import { usePractice } from './practice/session';
import type { PracticalCriterion } from './practicalTypes';
import { EXERCISE_MENU_GROUPS } from './menuGroups';
import { ExerciseViewportContext, requestExerciseViewport } from './initialViewport';
import { ExercisePanelFrame } from './ExercisePanelFrame';
import { EXERCISE_PANEL_INTRO, summarizeExerciseChecks } from './panelContent';
import { GuidedTutorialProvider, GuidedTutorialMenu } from '../tutorials/TutorialUI';

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
    openAttempt: document => openNewLearningAttempt(sessions, document),
    network: () => sim.net,
    signature: () => JSON.stringify(useStore.getState().captureWorkspaceDocument()),
    subscribe: listener => useStore.subscribe(listener), pendingForms: hasPendingForms,
    run: () => useStore.getState().setPaused(false),
    started: draftId => requestExerciseViewport(draftId),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const viewport = useMemo(() => ({ loading: !state.ready && !state.error,
    draftIds: new Set(Object.values(state.progress.attempts)
      .filter(attempt => AVAILABLE_EXERCISES.some(exercise => exercise.id === attempt.exerciseId))
      .map(attempt => attempt.draftId)),
  }), [state.ready, state.error, state.progress.attempts]);
  const [, redraw] = useState(0);
  useEffect(() => {
    void controller.initialize();
    const release = sessions.subscribe(() => redraw(v => v + 1));
    const focus = () => { void controller.refresh(); };
    const before = (e: BeforeUnloadEvent) => { if (controller.getState().busy || controller.getState().saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('focus', focus); window.addEventListener('beforeunload', before);
    return () => { release(); window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', before); controller.dispose(); };
  }, [controller, sessions]);
  return <Context.Provider value={{ controller, state }}><ExerciseViewportContext.Provider value={viewport}><GuidedTutorialProvider sessions={sessions} repository={repository}>{children}</GuidedTutorialProvider></ExerciseViewportContext.Provider></Context.Provider>;
}

export function ExerciseMenu({ close,entryPopup }: { close(): void;entryPopup?:React.MutableRefObject<HTMLDivElement|null> }) {
  const ui = useContext(Context);
  const { t, language } = useTranslation();
  useEffect(() => { if (ui) void ui.controller.refresh(); }, [ui?.controller]);
  if (!ui) return <><PracticeLauncher close={close} /><p>{t('exercises.storage')}</p></>;
  const { controller, state } = ui;
  return <>
    <PracticeLauncher close={close} />
    <GuidedTutorialMenu close={close} entryPopup={entryPopup}/>
    <p className="exercise-note">{t('exercises.note')}</p>
    {state.error && <p role="alert">{state.error} <button className="btn" onClick={() => void controller.retry()}>{t('common.retry')}</button></p>}
    {EXERCISE_MENU_GROUPS.map(group => <details className="exercise-menu-group" key={group.id} open>
      <summary>{t(group.label)}</summary>
      {group.exercises.flatMap(id => AVAILABLE_EXERCISES.filter(e => e.id === id)).map(e => {
      const pilot=practicalExercise(e.id);
      const completion = state.progress.completed[e.id], resume = controller.resumable(e.id);
      const started = Object.values(state.progress.attempts).some(a => a.exerciseId === e.id);
      const active = controller.activeAttempt(), current = active?.id === resume?.id && active?.exerciseId === e.id;
      const summary = current ? summarizeExerciseChecks(e.student.requirements, exerciseChecks(e.id), state.results) : null;
      const confirmed = completion && (!resume || completion.attemptId === resume.id);
      const passed = current && state.outcome === 'passed' && !state.checking && !state.saving && !state.error && summary?.total && summary.passed === summary.total;
      const completed = !!confirmed || !!passed;
      return <section key={e.id} className="exercise-menu-entry" data-exercise={e.id}>
        <strong>{e.student.title}</strong>
        {pilot&&<small>{t('exercises.pilot')}</small>}
        <span className={completed ? 'exercise-completed' : 'exercise-note'}>{completed ? '✓ ' + t('exercises.completed') : summary && summary.checked > 0 ? t('guided.tasksCompleted', { completed: summary.passed, total: summary.total }) : started ? t('exercises.started') : t('exercises.untouched')}</span>
        {completed && pilot && <small>{t('exercises.technical')} · {t('exercises.manual')}</small>}
        {confirmed && <small>{new Date(completion.completedAt).toLocaleDateString(language)} · Version {completion.contentVersion}</small>}
        <div className="exercise-menu-actions">
          {resume && <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { usePractice.getState().close(); void controller.resume(resume.draftId); close(); }}>{t('exercises.resume')}</button>}
          <button role="menuitem" className="btn" disabled={!state.ready || state.busy} onClick={() => { usePractice.getState().close(); void controller.start(e.id); close(); }}>{t(completion ? 'exercises.restart' : resume ? 'exercises.attempt' : 'exercises.start')}</button>
        </div>
      </section>;
    })}</details>)}
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
  const checkSummary = summarizeExerciseChecks(exercise.student.requirements, checks, state.results);
  const hasCheckResults = checkSummary.checked > 0;
  const completed = currentVersion && state.outcome === 'passed' && !state.checking && !state.saving && !state.error && checkSummary.total > 0 && checkSummary.passed === checkSummary.total;
  const countText = hasCheckResults
    ? t('guided.tasksCompleted', { completed: checkSummary.passed, total: checkSummary.total })
    : t('exercises.checksPending').replace('{count}', String(checkSummary.total));
  return <ExercisePanelFrame key={active.id} exerciseId={exercise.id} collapsed={collapsed} header={<><div className="exercise-heading"><strong>{exercise.student.title}</strong>
      <div className="exercise-summary" role="status" aria-live="polite" title={hasCheckResults ? t('exercises.checksCount', { passed: checkSummary.passed, total: checkSummary.total }) : undefined} data-outcome={currentVersion ? state.outcome : 'unverified'}>
        <span>{state.checking ? t('exercises.checking') : completed ? '✓ ' + t('exercises.completed') : currentVersion ? countText : t('exercises.pending')}</span>
      </div>
    </div><button className="btn btn--icon" aria-label={t(collapsed?'exercises.expand':'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button></>}>
    {!collapsed && <>
      <div className="exercise-body">
        <p className="exercise-intro" lang="de">{EXERCISE_PANEL_INTRO[exercise.id] ?? `${exercise.student.description} ${exercise.student.task}`}</p>
        {completed && pilot && <p className="exercise-note">{t('exercises.technical')} · {t('exercises.manual')}</p>}
        <details className="exercise-requirements"><summary>{t('exercises.details')}</summary><ul>{exercise.student.requirements.map(r => {
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
        })}</ul></details>
        {pilot&&<>
          {exercise.id === 'pilot-e06-v1' ? Object.keys(state.results).length > 0 && !state.checking && <details className="exercise-learning" lang="de">
            <summary>Was bedeutet /16?</summary><p>192.168.10.50/16 und 192.168.11.60/16 gehören beide zu 192.168.0.0/16 (Maske 255.255.0.0). Das dritte Oktett unterscheidet hier keine Subnetze. Im vorgesehenen gemeinsamen LAN ermitteln die Hosts die Ziel-MAC per ARP und können direkt über den Switch kommunizieren, ohne Gateway.</p>
            <small>Die technischen Tests prüfen die Konfiguration und ICMP, nicht Ihr Verständnis dieser Erklärung.</small>
          </details> : <details className="exercise-manual"><summary>{t('exercises.manual')}</summary>{pilot.manualReview.map(text=><p lang="de" key={text}>{text}</p>)}</details>}
        </>}
      </div>
      <footer>
        <button className="btn btn--primary" disabled={!state.ready || state.busy || state.checking || !currentVersion} onClick={() => void controller.verify()}>{state.checking ? t('exercises.checking') : pilot?t('exercises.check'):'Überprüfen'}</button>
        {state.checking && !state.saving && <button className="btn" onClick={() => controller.cancel('Prüfung abgebrochen.')}>{t('exercises.cancel')}</button>}
        <details className="exercise-help"><summary>{t('exercises.help')}</summary>
          <p>{t('exercises.probeNote')}</p><p>{t('exercises.persistence')}</p>
        </details>
        {state.message && state.outcome !== 'passed' && state.outcome !== 'incomplete' && <p role="status">{state.message}</p>}
        {!currentVersion && <p>{t('exercises.versionChanged')}</p>}
        {state.error && <p role="alert">{state.error}</p>}
      </footer>
    </>}
  </ExercisePanelFrame>;
}
