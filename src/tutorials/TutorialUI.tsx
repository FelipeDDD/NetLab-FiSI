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
import { openNewLearningAttempt } from '../exercises/newAttempt';
import type { ChapterId } from './chapterCheckpoints';
import { firstChapterCompletion, subnetChapterCompletion, routerChapterCompletion } from './completion';
import { correctedSubnet } from './subnetChapter';
import { ChapterStepProgress, ChapterProgress, ChapterFinished, ExploreNetworkButton } from './CompletionUI';
import { loadTutorialMenuProgress, type TutorialMenuProgress } from './menuProgress';
import { StaticRoutingTutorialController, type StaticRoutingState } from './StaticRoutingTutorialController';
import { StaticRoutingProgressStore } from './staticRoutingProgress';
import { StaticRoutingTutorialPanel } from './StaticRoutingTutorialPanel';
import { staticVerificationPresentation } from './staticRoutingVerification';
import { staticRoutingCompletion } from './completion';
import { AlternativePathsController, type AlternativeState } from './AlternativePathsController';
import { AlternativePathsProgressStore } from './alternativePathsProgress';
import { AlternativePathsPanel } from './AlternativePathsPanel';
import { alternativePathsCompletion } from './completion';
import { observeNetworkActivity } from '../networkObservations';
import './tutorial.css';

const Context = createContext<{ sessions: SessionController; repository: ProjectRepository; controller: TutorialController; state: TutorialState; subnet: SubnetTutorialController; subnetState: SubnetState; router:RouterTutorialController; routerState:RouterState; routing: StaticRoutingTutorialController; routingState: StaticRoutingState; alternative: AlternativePathsController; alternativeState: AlternativeState; hiddenPanels: ReadonlySet<string>; hidePanel(chapter: ChapterId, draftId: string): void; showPanels(draftId: string): void } | null>(null);
export function GuidedTutorialProvider({ sessions, repository, children }: { sessions: SessionController; repository: ProjectRepository; children: ReactNode }) {
  const [restart]=useState(()=>new ChapterRestartService(repository,sessions)),status=useSyncExternalStore(restart.subscribe,restart.getState),{t}=useTranslation();
  useEffect(()=>useStore.getState().attachChapterHistory((id,direction)=>void restart.navigate(id,direction)),[restart]);
  useEffect(()=>{if(status.error)useStore.getState().setNotice(t('guidedRestart.storage'));},[status.error]);
  return <GuidedTutorialRuntime key={status.generation} sessions={sessions} repository={repository} restart={restart}>{children}</GuidedTutorialRuntime>;
}
function GuidedTutorialRuntime({sessions,repository,restart,children}:{sessions:SessionController;repository:ProjectRepository;restart:ChapterRestartService;children:ReactNode}){
  const [hiddenPanels, setHiddenPanels] = useState<ReadonlySet<string>>(() => new Set());
  const hidePanel = (chapter: ChapterId, draftId: string) => setHiddenPanels(previous => new Set([...previous, `${draftId}:${chapter}`]));
  const showPanels = (draftId: string) => setHiddenPanels(previous => new Set([...previous].filter(key => !key.startsWith(`${draftId}:`))));
  const routerRef=useRef<RouterTutorialController|null>(null);
  const routingRef=useRef<StaticRoutingTutorialController|null>(null);
  const alternativeRef=useRef<AlternativePathsController|null>(null);
  const routingOwnsDraft=()=>(alternativeRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true)||(routingRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true);
  const subscribeEarlier=(listener:()=>void)=>{const a=useStore.subscribe(listener),b=routerRef.current?.subscribe(listener),c=restart.subscribe(listener),d=routingRef.current?.subscribe(listener),e=alternativeRef.current?.subscribe(listener);return()=>{a();b?.();c();d?.();e?.();};};
  const checkpoint=(chapter:ChapterId)=>({before:(id:string)=>restart.before(chapter,id),prepared:(id:string,value:import('../projects/types').MetaValue)=>restart.prepared(chapter,id,value)});
  const [controller] = useState<TutorialController>(() => new TutorialController(sessions, {
    openAttempt: document => openNewLearningAttempt(sessions, document),
    checkpoint:checkpoint('first-connection'),restarting:()=>restart.getState().busy,
    network: () => sim.net, signature: () => JSON.stringify(serializeNetwork(sim.net, {})),
    activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: subscribeEarlier, observeCommands: observeTerminalCommands,
    suspended:()=>restart.getState().busy||routingOwnsDraft()||(routerRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true),
    renameDevice: (id, name) => useStore.getState().renameDevice(id, name),
    started: requestExerciseViewport,
    hostCreationDraft: draftId => useStore.getState().setTutorialHostCreationDraft(draftId),
  }, new TutorialProgressStore(repository, sessions)));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [subnet] = useState<SubnetTutorialController>(() => new SubnetTutorialController(sessions, controller, {
    checkpoint:checkpoint('subnet-mask'),restarting:()=>restart.getState().busy,
    network: () => sim.net, activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: subscribeEarlier, observeCommands: observeTerminalCommands,
    suspended:()=>restart.getState().busy||routingOwnsDraft()||(routerRef.current?.holdsDraft(useStore.getState().workspaceIdentity?.draftId??null)??true),
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
    openAttempt: document => openNewLearningAttempt(sessions, document),
    checkpoint:checkpoint('two-networks'),suspended:()=>restart.getState().busy||routingOwnsDraft(),restarting:()=>restart.getState().busy,
    network:()=>sim.net,activeDraftId:()=>useStore.getState().workspaceIdentity?.draftId??null,pendingForms:hasPendingForms,
    subscribe:listener=>{const a=useStore.subscribe(listener),b=restart.subscribe(listener),c=routingRef.current?.subscribe(listener),d=alternativeRef.current?.subscribe(listener);return()=>{a();b();c?.();d?.();};},observeCommands:observeTerminalCommands,insert:pcC=>useStore.getState().addRouterTutorialGroup(pcC),started:requestExerciseViewport,
    repeat:(step,signature,pcC)=>useStore.getState().repeatRouterTutorialTask(step,signature,pcC),
  },new RouterProgressStore(repository,sessions)));
  routerRef.current=router;
  const routerState=useSyncExternalStore(router.subscribe,router.getState);
  const [routing]=useState(()=>new StaticRoutingTutorialController(sessions,{
    openAttempt:document=>openNewLearningAttempt(sessions,document),checkpoint:checkpoint('static-routing'),restarting:()=>restart.getState().busy,
    network:()=>sim.net,activeDraftId:()=>useStore.getState().workspaceIdentity?.draftId??null,pendingForms:hasPendingForms,
    subscribe:listener=>{const a=useStore.subscribe(listener),b=restart.subscribe(listener);return()=>{a();b();};},observeCommands:observeTerminalCommands,
    expand:()=>useStore.getState().addStaticRoutingLan(),started:requestExerciseViewport, verificationPresentation:staticVerificationPresentation,
  },new StaticRoutingProgressStore(repository,sessions)));
  routingRef.current=routing;
  const routingState=useSyncExternalStore(routing.subscribe,routing.getState);
  const [alternative]=useState(()=>new AlternativePathsController(sessions,{
    openAttempt:document=>openNewLearningAttempt(sessions,document),checkpoint:checkpoint('alternative-paths'),restarting:()=>restart.getState().busy,
    network:()=>sim.net,activeDraftId:()=>useStore.getState().workspaceIdentity?.draftId??null,pendingForms:hasPendingForms,
    subscribe:listener=>{const a=useStore.subscribe(listener),b=restart.subscribe(listener);return()=>{a();b();};},observeCommands:observeTerminalCommands,observeActivity:observeNetworkActivity,
    insert:()=>useStore.getState().addAlternativeRoutingPCs(),started:requestExerciseViewport,
  },new AlternativePathsProgressStore(repository,sessions)));
  alternativeRef.current=alternative;
  const alternativeState=useSyncExternalStore(alternative.subscribe,alternative.getState);
  useEffect(()=>alternative.connect(),[alternative]);
  useEffect(()=>routing.connect(),[routing]);
  useEffect(()=>router.connect(),[router]);
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => subnet.connect(), [subnet]);
  useEffect(()=>{restart.flushControllers=async()=>{await controller.flushProgress();await subnet.flushProgress();await router.flushProgress();await routing.flushProgress();await alternative.flushProgress();};restart.resume();return()=>{restart.flushControllers=async()=>{};};},[restart,controller,subnet,router,routing,alternative]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') { void controller.flushProgress(); void subnet.flushProgress(); void router.flushProgress(); void routing.flushProgress(); void alternative.flushProgress(); } };
    const before = (event: BeforeUnloadEvent) => { if (controller.getState().saving || subnet.getState().saving || router.getState().saving || routing.getState().saving || alternative.getState().saving) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', flush); window.addEventListener('beforeunload', before);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('beforeunload', before); };
  }, [controller, subnet, router, routing, alternative]);
  const busy=restart.getState().busy;
  return <ChapterRestartContext.Provider value={{service:restart,newAttempt:chapter=>chapter==='alternative-paths'?alternative.begin():chapter==='static-routing'?routing.begin():chapter==='two-networks'?router.begin(true):controller.start(true)}}><Context.Provider value={{ sessions, repository, controller, state:{...state,busy:state.busy||busy}, subnet, subnetState:{...subnetState,busy:subnetState.busy||busy}, router, routerState:{...routerState,busy:routerState.busy||busy}, routing, routingState:{...routingState,busy:routingState.busy||busy}, alternative, alternativeState:{...alternativeState,busy:alternativeState.busy||busy}, hiddenPanels, hidePanel, showPanels }}>{children}</Context.Provider></ChapterRestartContext.Provider>;
}

export function GuidedTutorialMenu({ close }: { close(): void }) {
  const ui = useContext(Context), { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<TutorialMenuProgress>({ first: null, subnet: null, router: null, routing: null, alternative: null });
  const [progressError, setProgressError] = useState(false);
  const [progressLoading, setProgressLoading] = useState(true);
  useEffect(() => {
    if (!ui || !expanded) return;
    let cancelled = false;
    const { sessions, repository } = ui, session = sessions.getState();
    const drafts = [...session.drafts].sort((a, b) => Number(b.id === session.activeDraftId) - Number(a.id === session.activeDraftId));
    setProgressError(false);
    setProgressLoading(true);
    void loadTutorialMenuProgress(repository, drafts.map(draft => draft.id), ui.state.draftId, id => sessions.recoveryDocument(id === session.activeDraftId ? undefined : id))
      .then(value => { if (!cancelled) setProgress(value); })
      .catch(() => { if (!cancelled) setProgressError(true); })
      .finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, ui?.sessions, ui?.repository, ui?.state.draftId, ui?.routerState.loadedDraft, ui?.routingState.loadedDraft, ui?.alternativeState.loadedDraft]);
  if (!ui) return null;
  const { controller, state } = ui;
  const basicsDraft = progress.first?.draftId ?? state.draftId;
  const firstProgress = state.draftId && state.draftId === basicsDraft ? firstChapterCompletion({ completed: controller.completedSteps() }) : progress.first?.progress;
  const subnetProgress = ui.subnetState.active && ui.subnetState.record?.draftId === basicsDraft ? subnetChapterCompletion(ui.subnetState.record, correctedSubnet(sim.net, ui.subnetState.record.pcC)) : progress.subnet?.progress;
  const routerDraft = progress.router?.draftId ?? null;
  const routerProgress = progress.router && ui.routerState.record?.draftId === progress.router.draftId ? routerChapterCompletion(ui.routerState.record) : progress.router?.progress;
  const routingDraft=progress.routing?.draftId;
  const routingProgress=progress.routing&&ui.routingState.record&&ui.routingState.record.draftId===routingDraft?staticRoutingCompletion(ui.routingState.record):progress.routing?.progress;
  const alternativeDraft=progress.alternative?.draftId;
  const alternativeProgress=progress.alternative&&ui.alternativeState.record&&ui.alternativeState.record.draftId===alternativeDraft?alternativePathsCompletion(ui.alternativeState.record):progress.alternative?.progress;
  return <section className="guided-tutorial-menu" aria-label={t('guided.group')}>
    <button type="button" role="menuitem" className="labs-menu-item guided-menu-toggle" data-guided-menu-toggle aria-expanded={expanded} aria-controls="guided-tutorial-groups" onClick={() => setExpanded(value => !value)}>
      <svg className="guided-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 6.5c-2-1.5-4.8-2-8-1v12c3.2-1 6-.5 8 1m0-12c2-1.5 4.8-2 8-1v12c-3.2-1-6-.5-8 1m0-12v12"/></svg>
      <span className="guided-menu-heading"><strong>{t('guided.group')}</strong><span className="guided-menu-summary">{t('guided.menuSummary')}</span></span>
      <svg className="guided-menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}/></svg>
    </button>
    {expanded && <div id="guided-tutorial-groups">
    <section className="guided-menu-chapter" aria-label={t('guided.basicsGroup')}>
    <strong>{t('guided.basicsGroup')}</strong>
    <div className="guided-menu-progress" data-chapter-progress="first-connection"><span>{t('guided.title')}</span>{firstProgress && <ChapterProgress progress={firstProgress}/>}</div>
    <div className="guided-menu-progress" data-chapter-progress="subnet-mask"><span>{t('guided.subnetMenuTitle')}</span>{subnetProgress && <ChapterProgress progress={subnetProgress}/>}</div>
    <button type="button" role="menuitem" className="btn" data-start-tutorial="first-connection" disabled={state.busy || !state.ready || progressLoading || progressError} onClick={() => {
      if (basicsDraft) {
        void ui.sessions.switchDraft(basicsDraft).then(result => { if (result.ok) { ui.showPanels(basicsDraft); usePractice.getState().close(); close(); } });
      } else { usePractice.getState().close(); void controller.start(); close(); }
    }}>{t(firstProgress?.complete && subnetProgress?.complete ? 'guided.openNetwork' : basicsDraft ? 'guided.resume' : 'guided.start')}</button>
    {basicsDraft && <button type="button" role="menuitem" className="btn" data-restart-tutorial disabled={state.busy || !state.ready || progressLoading || progressError} onClick={() => { usePractice.getState().close(); void controller.start(true); close(); }}>{t('guided.restart')}</button>}
    <small>{t('guided.prototype')}</small>{state.error && <p role="alert">{t('guided.error')}</p>}
    {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
    </section>
    <section className="guided-menu-chapter" aria-label={t('guidedRouter.title')}>
    <strong>{t('guidedRouter.title')}</strong><p>{t('guided.routerMenuDescription')}</p>
    {routerProgress && <div className="guided-menu-progress" data-chapter-progress="two-networks"><ChapterProgress progress={routerProgress}/></div>}
    {routerProgress?.complete ? <div className="guided-router-completed-actions" data-router-completed-actions>
      <button type="button" role="menuitem" className="btn" data-router-resume disabled={ui.routerState.busy} onClick={() => { if (!routerDraft) return; void ui.sessions.switchDraft(routerDraft).then(result => { if (result.ok) { ui.showPanels(routerDraft); usePractice.getState().close(); close(); } }); }}>{t('guided.openNetwork')}</button>
      <button type="button" role="menuitem" className="btn" data-router-direct title={t('guidedRouter.direct')} disabled={ui.routerState.busy} onClick={()=>{usePractice.getState().close();void ui.router.begin(true);close();}}>{t('guided.directStart')}</button>
    </div> : <>
      {routerDraft && <button type="button" role="menuitem" className="btn" data-router-resume disabled={ui.routerState.busy} onClick={() => { void ui.sessions.switchDraft(routerDraft).then(result => { if (result.ok) { ui.showPanels(routerDraft); usePractice.getState().close(); close(); } }); }}>{t('guided.resume')}</button>}
      <button type="button" role="menuitem" className="btn" data-router-direct title={t('guidedRouter.direct')} disabled={ui.routerState.busy} onClick={()=>{usePractice.getState().close();void ui.router.begin(true);close();}}>{t('guided.directStart')}</button>
    </>}
    {ui.routerState.warning&&<p role="status">{t(`guidedRouter.${ui.routerState.warning}`)}</p>}
    {ui.routerState.storageError&&<p role="alert">{t('guided.storageError')} <button className="btn" onClick={()=>void ui.router.retryProgress()}>{t('common.retry')}</button></p>}
    </section>
    <section className="guided-menu-chapter" aria-label={t('guidedStatic.title')}>
      <strong>{t('guidedStatic.title')}</strong><p>{t('guidedStatic.menuDescription')}</p>
      {routingProgress&&<div className="guided-menu-progress" data-chapter-progress="static-routing"><ChapterProgress progress={routingProgress}/></div>}
      {routingDraft&&<button type="button" role="menuitem" className="btn" data-static-resume disabled={ui.routingState.busy||progressLoading||progressError} onClick={()=>{void ui.sessions.switchDraft(routingDraft).then(result=>{if(result.ok){ui.showPanels(routingDraft);usePractice.getState().close();close();}});}}>{t(routingProgress?.complete?'guided.openNetwork':'guided.resume')}</button>}
      <button type="button" role="menuitem" className="btn" data-static-direct disabled={ui.routingState.busy||progressLoading||progressError} onClick={()=>{usePractice.getState().close();void ui.routing.begin();close();}}>{t('guided.directStart')}</button>
      {ui.routingState.storageError&&<p role="alert">{t('guided.storageError')} <button className="btn" onClick={()=>void ui.routing.retryProgress()}>{t('common.retry')}</button></p>}
    </section>
    <section className="guided-menu-chapter" aria-label={t('guidedAlternative.title')}>
      <strong>{t('guidedAlternative.title')}</strong><p>{t('guidedAlternative.menuDescription')}</p>
      {alternativeProgress&&<div className="guided-menu-progress" data-chapter-progress="alternative-paths"><ChapterProgress progress={alternativeProgress}/></div>}
      {alternativeDraft&&<button type="button" role="menuitem" className="btn" data-alternative-resume disabled={ui.alternativeState.busy||progressLoading||progressError} onClick={()=>{void ui.sessions.switchDraft(alternativeDraft).then(result=>{if(result.ok){ui.showPanels(alternativeDraft);usePractice.getState().close();close();}});}}>{t(alternativeProgress?.complete?'guided.openNetwork':'guided.resume')}</button>}
      <button type="button" role="menuitem" className="btn" data-alternative-direct disabled={ui.alternativeState.busy||progressLoading||progressError} onClick={()=>{usePractice.getState().close();void ui.alternative.begin();close();}}>{t('guided.directStart')}</button>
      {ui.alternativeState.storageError&&<p role="alert">{t('guided.storageError')} <button className="btn" onClick={()=>void ui.alternative.retryProgress()}>{t('common.retry')}</button></p>}
    </section>{progressError && <p role="alert">{t('guided.storageError')}</p>}</div>}
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
  if(ui.alternativeState.active&&ui.alternativeState.record)return ui.hiddenPanels.has(`${ui.alternativeState.record.draftId}:alternative-paths`)?null:<AlternativePathsPanel key={ui.alternativeState.record.draftId} controller={ui.alternative} state={ui.alternativeState} onExplore={()=>ui.hidePanel('alternative-paths',ui.alternativeState.record!.draftId)}/>;
  if(ui.routingState.active&&ui.routingState.record)return ui.hiddenPanels.has(`${ui.routingState.record.draftId}:static-routing`)?null:<StaticRoutingTutorialPanel key={ui.routingState.record.draftId} controller={ui.routing} state={ui.routingState} onExplore={()=>ui.hidePanel('static-routing',ui.routingState.record!.draftId)}/>;
  if(ui.routerState.active && ui.routerState.record) return ui.hiddenPanels.has(`${ui.routerState.record.draftId}:two-networks`) ? null : <RouterTutorialPanel key={ui.routerState.record.draftId} controller={ui.router} state={ui.routerState} onExplore={() => ui.hidePanel('two-networks', ui.routerState.record!.draftId)}/>;
  if (ui.subnetState.active && ui.subnetState.record && ui.hiddenPanels.has(`${ui.subnetState.record.draftId}:subnet-mask`)) return null;
  if (ui.subnetState.active) return <SubnetTutorialPanel key={ui.subnetState.record?.draftId} controller={ui.subnet} state={ui.subnetState} afterCompletion={<>
    {ui.routerState.warning&&<p role="status">{t(`guidedRouter.${ui.routerState.warning}`)}</p>}
    {ui.routerState.storageError&&<p role="alert">{t('guided.storageError')}</p>}
    <button className="btn" data-router-continue disabled={ui.subnetState.saving||ui.subnetState.storageError||ui.routerState.busy||ui.routerState.storageError} onClick={()=>void ui.router.begin()}>{t('guidedRouter.transition')}</button>
  </>} onExplore={() => ui.hidePanel('subnet-mask', ui.subnetState.record!.draftId)} />;
  if (!ui.state.active) return ui.state.error ? <aside className="exercise-error" role="alert">{t('guided.error')} <button type="button" className="btn" onClick={() => void ui.controller.start()}>{t('common.retry')}</button></aside> : null;
  const { controller, state } = ui, step = steps[state.step];
  if (state.draftId && ui.hiddenPanels.has(`${state.draftId}:first-connection`)) return null;
  const completion = firstChapterCompletion({ completed: controller.completedSteps() });
  return <ExercisePanelFrame key={state.draftId} exerciseId="guided-first-connection" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guided.title')}</strong><ChapterStepProgress step={state.step + 1} total={FIRST_CONNECTION.steps.length} progress={completion}/></div>
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
      {state.step === 7 && completion.complete && <div data-tutorial-finished={state.finished ? 'true' : undefined}><ChapterFinished/><p className="exercise-learning">{t('guided.finishedText')}</p>{!state.finished && <p>{t('guided.stopReminder')} <kbd className="guided-shortcut">{t('guided.shortcut')}</kbd>.</p>}</div>}
      {state.step === 7 && state.passed && !completion.complete && <p className="exercise-learning">{t('guided.explanationC')}</p>}
      {state.step === 7 && controller.hasCompletedChapter() && ui.subnetState.warning && <p role="status">{t(`guidedSubnet.${ui.subnetState.warning}`)}</p>}
      {state.step === 7 && controller.hasCompletedChapter() && ui.subnetState.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void ui.subnet.retryProgress()}>{t('common.retry')}</button></p>}
    </div><footer>
      <button type="button" className="btn" disabled={state.step === 0} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {state.step < steps.length - 1 && <button type="button" className="btn btn--primary" disabled={!state.passed || state.busy} onClick={() => controller.next()}>{t('guided.next')}</button>}
      {state.step === 7 && controller.hasCompletedChapter() && <button type="button" className="btn" data-start-subnet disabled={state.saving || state.storageError || ui.subnetState.busy || ui.subnetState.storageError} onClick={() => void ui.subnet.begin()}>{t('guidedSubnet.transition')}</button>}
      {state.step === 7 && completion.complete && <ExploreNetworkButton onClick={() => ui.hidePanel('first-connection', state.draftId!)}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
