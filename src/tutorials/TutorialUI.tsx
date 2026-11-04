import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import { TutorialProgressStore } from './tutorialProgress';
import { useStore } from '../store';
import { sim } from '../sim';
import { serializeNetwork } from '../engine/serialize';
import { hasPendingForms } from '../persistence/pendingForms';
import { observeTerminalCommands } from '../terminalCommandEvents';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { requestExerciseViewport } from '../exercises/initialViewport';
import { usePractice } from '../exercises/practice/session';
import { LearningHelpLink } from '../components/LearningHelp';
import { useTranslation, type TranslationKey } from '../i18n';
import { FIRST_CONNECTION } from './firstConnection';
import { TutorialController, type TutorialState, type TutorialHint } from './TutorialController';
import { SubnetTutorialController, type SubnetState } from './SubnetTutorialController';
import { SubnetProgressStore } from './subnetProgress';
import { SubnetTutorialPanel } from './SubnetTutorialPanel';
import { SUBNET_DEMO_COMMAND, SUBNET_PC_ID } from './subnetChapter';
import { getSession } from '../terminals';
import { IpDevice } from '../engine/ipdevice';
import { RouterTutorialController, type RouterState } from './RouterTutorialController';
import { RouterProgressStore } from './routerProgress';
import { RouterTutorialPanel } from './RouterTutorialPanel';
import { ChapterRestartService } from './ChapterRestartService';
import { ChapterRestartButton, ChapterRestartContext } from './ChapterRestartUI';
import type { ChapterId } from './chapterCheckpoints';
import './tutorial.css';

const Context = createContext<{ controller: TutorialController; state: TutorialState; subnet: SubnetTutorialController; subnetState: SubnetState; router:RouterTutorialController; routerState:RouterState } | null>(null);
export function GuidedTutorialProvider({ sessions, repository, children }: { sessions: SessionController; repository: ProjectRepository; children: ReactNode }) {
  const [restart]=useState(()=>new ChapterRestartService(repository,sessions)),status=useSyncExternalStore(restart.subscribe,restart.getState),{t}=useTranslation();
  useEffect(()=>useStore.getState().attachChapterHistory((id,direction)=>void restart.navigate(id,direction)),[restart]);
  useEffect(()=>{if(status.error)useStore.getState().setNotice(t('guidedRestart.storage'));},[status.error]);
  return <GuidedTutorialRuntime key={status.generation} sessions={sessions} repository={repository} restart={restart}>{children}</GuidedTutorialRuntime>;
}
function GuidedTutorialRuntime({sessions,repository,restart,children}:{sessions:SessionController;repository:ProjectRepository;restart:ChapterRestartService;children:ReactNode}){
  const routerRef=useRef<RouterTutorialController|null>(null);
  const subscribeEarlier=(listener:()=>void)=>{const a=useStore.subscribe(listener),b=routerRef.current?.subscribe(listener),c=restart.subscribe(listener);return()=>{a();b?.();c();};};
  const checkpoint=(chapter:ChapterId)=>({before:(id:string)=>restart.before(chapter,id),prepared:(id:string,value:import('../projects/types').MetaValue)=>restart.prepared(chapter,id,value)});
  const [controller] = useState<TutorialController>(() => new TutorialController(sessions, {
    checkpoint:checkpoint('first-connection'),restarting:()=>restart.getState().busy,
    network: () => sim.net, signature: () => JSON.stringify(serializeNetwork(sim.net, {})),
    activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: subscribeEarlier, observeCommands: observeTerminalCommands,
    suspended:()=>restart.getState().busy||(routerRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true),
    renameDevice: (id, name) => useStore.getState().renameDevice(id, name),
    started: requestExerciseViewport,
    hostCreationDraft: draftId => useStore.getState().setTutorialHostCreationDraft(draftId),
  }, new TutorialProgressStore(repository, sessions)));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [subnet] = useState<SubnetTutorialController>(() => new SubnetTutorialController(sessions, controller, {
    checkpoint:checkpoint('subnet-mask'),restarting:()=>restart.getState().busy,
    network: () => sim.net, activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: subscribeEarlier, observeCommands: observeTerminalCommands,
    suspended:()=>restart.getState().busy||(routerRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true),
    insert: pcC => useStore.getState().addSubnetTutorialPC(pcC),
    demonstrate: () => {
      const device = sim.net.devices.get(SUBNET_PC_ID);
      if (!(device instanceof IpDevice)) return 'disposed';
      useStore.getState().openTerminal(device.id);
      const result = getSession(device).executeCommand(SUBNET_DEMO_COMMAND);
      if (result === 'accepted' && useStore.getState().paused) useStore.getState().setPaused(false);
      return result;
    },
  }, new SubnetProgressStore(repository, sessions)));
  const subnetState = useSyncExternalStore(subnet.subscribe, subnet.getState);
  const [router]=useState<RouterTutorialController>(()=>new RouterTutorialController(sessions,subnet,{
    checkpoint:checkpoint('two-networks'),suspended:()=>restart.getState().busy,restarting:()=>restart.getState().busy,
    network:()=>sim.net,activeDraftId:()=>useStore.getState().workspaceIdentity?.draftId??null,pendingForms:hasPendingForms,
    subscribe:listener=>{const a=useStore.subscribe(listener),b=restart.subscribe(listener);return()=>{a();b();};},observeCommands:observeTerminalCommands,insert:pcC=>useStore.getState().addRouterTutorialGroup(pcC),started:requestExerciseViewport,
    repeat:(step,signature,pcC)=>useStore.getState().repeatRouterTutorialTask(step,signature,pcC),
  },new RouterProgressStore(repository,sessions)));
  routerRef.current=router;
  const routerState=useSyncExternalStore(router.subscribe,router.getState);
  useEffect(()=>router.connect(),[router]);
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => subnet.connect(), [subnet]);
  useEffect(()=>{restart.flushControllers=async()=>{await controller.flushProgress();await subnet.flushProgress();await router.flushProgress();};restart.resume();return()=>{restart.flushControllers=async()=>{};};},[restart,controller,subnet,router]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') { void controller.flushProgress(); void subnet.flushProgress(); void router.flushProgress(); } };
    const before = (event: BeforeUnloadEvent) => { if (controller.getState().saving || subnet.getState().saving || router.getState().saving) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', flush); window.addEventListener('beforeunload', before);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('beforeunload', before); };
  }, [controller, subnet, router]);
  const busy=restart.getState().busy;
  return <ChapterRestartContext.Provider value={{service:restart,newAttempt:chapter=>chapter==='two-networks'?router.begin(true):controller.start(true)}}><Context.Provider value={{ controller, state:{...state,busy:state.busy||busy}, subnet, subnetState:{...subnetState,busy:subnetState.busy||busy}, router, routerState:{...routerState,busy:routerState.busy||busy} }}>{children}</Context.Provider></ChapterRestartContext.Provider>;
}

export function GuidedTutorialMenu({ close }: { close(): void }) {
  const ui = useContext(Context), { t } = useTranslation();
  if (!ui) return null;
  const { controller, state } = ui;
  return <section className="guided-tutorial-menu" aria-label={t('guided.group')}>
    <strong>{t('guided.group')}</strong><p>{t('guided.title')}</p>
    <button type="button" role="menuitem" className="btn" data-start-tutorial="first-connection" disabled={state.busy || !state.ready} onClick={() => {
      usePractice.getState().close(); void controller.start(); close();
    }}>{t(state.draftId ? 'guided.resume' : 'guided.start')}</button>
    {state.draftId && <button type="button" role="menuitem" className="btn" data-restart-tutorial disabled={state.busy || !state.ready} onClick={() => { usePractice.getState().close(); void controller.start(true); close(); }}>{t('guided.restart')}</button>}
    <small>{t('guided.prototype')}</small>{state.error && <p role="alert">{t('guided.error')}</p>}
    <p>{t('guidedRouter.title')}</p><button type="button" role="menuitem" className="btn" data-router-direct disabled={ui.routerState.busy} onClick={()=>{usePractice.getState().close();void ui.router.begin(true);close();}}>{t('guidedRouter.direct')}</button>
    {ui.routerState.warning&&<p role="status">{t(`guidedRouter.${ui.routerState.warning}`)}</p>}
    {ui.routerState.storageError&&<p role="alert">{t('guided.storageError')} <button className="btn" onClick={()=>void ui.router.retryProgress()}>{t('common.retry')}</button></p>}
    {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
  </section>;
}
const steps = [
  { title: 'guided.cableTitle', text: 'guided.cableText', success: 'guided.cableSuccess' },
  { title: 'guided.ipv4Title', text: 'guided.ipv4Text', success: 'guided.ipv4Success' },
  { title: 'guided.pingTitle', text: 'guided.pingText', success: 'guided.pingSuccess' },
  { title: 'guided.stopPingTitle', text: 'guided.stopPingText', success: 'guided.stopPingSuccess' },
  { title: 'guided.addCTitle', text: 'guided.addCText', success: 'guided.addCSuccess' },
  { title: 'guided.cableTitle', text: 'guided.cableCText', success: 'guided.cableCSuccess' },
  { title: 'guided.ipv4CTitle', text: 'guided.ipv4CText', success: 'guided.ipv4CSuccess' },
  { title: 'guided.pingTitle', text: 'guided.pingCText', success: 'guided.pingCSuccess' },
] as const;
const hints: Record<TutorialHint, TranslationKey> = {
  cable: 'guided.hintCable', ipv4: 'guided.hintIpv4', ping: 'guided.hintPing', network: 'guided.hintNetwork', missing: 'guided.hintMissing',
  forms: 'guided.hintForms', wrongTarget: 'guided.hintWrongTarget', pingFailed: 'guided.hintPingFailed', stopPing: 'guided.hintStopPing',
  addC: 'guided.addCText', cableC: 'guided.cableCText', ipv4C: 'guided.hintIpv4CInitial', ipv4CExisting: 'guided.hintIpv4C', pingC: 'guided.hintPingC',
};
export function GuidedTutorialPanel() {
  const ui = useContext(Context), { t } = useTranslation(), practiceOpen = usePractice(s => s.open);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [ui?.state.draftId]);
  if (!ui || practiceOpen) return null;
  if(ui.routerState.active)return <RouterTutorialPanel key={ui.routerState.record?.draftId} controller={ui.router} state={ui.routerState}/>;
  if (ui.subnetState.active) return <SubnetTutorialPanel key={ui.subnetState.record?.draftId} controller={ui.subnet} state={ui.subnetState} afterCompletion={<>
    {ui.routerState.warning&&<p role="status">{t(`guidedRouter.${ui.routerState.warning}`)}</p>}
    {ui.routerState.storageError&&<p role="alert">{t('guided.storageError')}</p>}
    <button className="btn btn--primary" data-router-continue disabled={ui.subnetState.saving||ui.subnetState.storageError||ui.routerState.busy||ui.routerState.storageError} onClick={()=>void ui.router.begin()}>{t('guidedRouter.transition')}</button>
  </>} />;
  if (!ui.state.active) return ui.state.error ? <aside className="exercise-error" role="alert">{t('guided.error')} <button type="button" className="btn" onClick={() => void ui.controller.start()}>{t('common.retry')}</button></aside> : null;
  const { controller, state } = ui, step = steps[state.step];
  return <ExercisePanelFrame key={state.draftId} exerciseId="guided-first-connection" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guided.title')}</strong><div className="exercise-summary">{t('guided.progress', { step: state.step + 1, total: FIRST_CONNECTION.steps.length })}</div></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed}
      onClick={() => setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="first-connection" draftId={state.draftId} step={state.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-guided-step={state.step + 1} data-guided-saving={state.saving}>
      <h3>{t(step.title)}</h3>{!(state.step === 3 && state.passed) && <p>{t(step.text)}</p>}
      {state.repeatPing && <p role="status" data-guided-repeat>{t('guided.repeatPing')}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(state.step === 1 || state.step === 6) && <LearningHelpLink page="ipv4" />}
      {state.step === 7 && !state.passed && <section className="exercise-learning"><strong>{t('guided.arpTitle')}</strong><p>{t('guided.arpText')}</p><p>{t('guided.arpCached')}</p></section>}
      {(state.step === 2 || state.step === 7) && <pre><code>ping 192.168.10.20</code></pre>}
      {state.step === 6 && <pre><code>ip address add 192.168.10.30/24 dev eth0</code></pre>}
      {state.step === 3 && !state.passed && <p><kbd className="guided-shortcut">{t('guided.shortcut')}</kbd></p>}
      <p className="guided-action-status" role="status" data-tutorial-passed={state.passed}>
        <span className="guided-action-indicator" aria-hidden="true">{state.passed ? '✓' : ''}</span>
        <span>{state.passed ? t(step.success).replace(/^✓\s*/, '') : state.hint === 'addC' || state.hint === 'cableC' ? t('guided.pending') : t(hints[state.hint])}</span>
        {state.passed && state.step === 4 && <code>{sim.net.devices.get(state.pcC ?? '')?.name}</code>}
      </p>
      {state.step === 3 && state.passed && <p className="exercise-learning">{t('guided.explanation')}</p>}
      {state.step === 7 && state.passed && (state.finished ? <div role="status" className="guided-action-status" data-tutorial-finished="true"><span className="guided-action-indicator" aria-hidden="true">✓</span><div><strong>{t('guided.finished')}</strong><p>{t('guided.finishedText')}</p></div></div> : <><p className="exercise-learning">{t('guided.explanationC')}</p><p>{t('guided.stopReminder')} <kbd className="guided-shortcut">{t('guided.shortcut')}</kbd>.</p></>)}
      {state.step === 7 && controller.hasCompletedChapter() && ui.subnetState.warning && <p role="status">{t(`guidedSubnet.${ui.subnetState.warning}`)}</p>}
      {state.step === 7 && controller.hasCompletedChapter() && ui.subnetState.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void ui.subnet.retryProgress()}>{t('common.retry')}</button></p>}
    </div><footer>
      <button type="button" className="btn" disabled={state.step === 0} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {state.step < steps.length - 1 && <button type="button" className="btn btn--primary" disabled={!state.passed || state.busy} onClick={() => controller.next()}>{t('guided.next')}</button>}
      {state.step === 7 && controller.hasCompletedChapter() && <button type="button" className="btn btn--primary" data-start-subnet disabled={state.saving || state.storageError || ui.subnetState.busy || ui.subnetState.storageError} onClick={() => void ui.subnet.begin()}>{t('guidedSubnet.transition')}</button>}
    </footer></>}
  </ExercisePanelFrame>;
}
