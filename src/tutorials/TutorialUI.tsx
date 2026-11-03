import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
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
import './tutorial.css';

const Context = createContext<{ controller: TutorialController; state: TutorialState; subnet: SubnetTutorialController; subnetState: SubnetState } | null>(null);
export function GuidedTutorialProvider({ sessions, repository, children }: { sessions: SessionController; repository: ProjectRepository; children: ReactNode }) {
  const [controller] = useState(() => new TutorialController(sessions, {
    network: () => sim.net, signature: () => JSON.stringify(serializeNetwork(sim.net, {})),
    activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: listener => useStore.subscribe(listener), observeCommands: observeTerminalCommands,
    renameDevice: (id, name) => useStore.getState().renameDevice(id, name),
    started: requestExerciseViewport,
    hostCreationDraft: draftId => useStore.getState().setTutorialHostCreationDraft(draftId),
  }, new TutorialProgressStore(repository, sessions)));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [subnet] = useState(() => new SubnetTutorialController(sessions, controller, {
    network: () => sim.net, activeDraftId: () => useStore.getState().workspaceIdentity?.draftId ?? null,
    pendingForms: hasPendingForms, subscribe: listener => useStore.subscribe(listener), observeCommands: observeTerminalCommands,
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
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => subnet.connect(), [subnet]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') { void controller.flushProgress(); void subnet.flushProgress(); } };
    const before = (event: BeforeUnloadEvent) => { if (controller.getState().saving || subnet.getState().saving) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', flush); window.addEventListener('beforeunload', before);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('beforeunload', before); };
  }, [controller, subnet]);
  return <Context.Provider value={{ controller, state, subnet, subnetState }}>{children}</Context.Provider>;
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
  if (ui.subnetState.active) return <SubnetTutorialPanel key={ui.subnetState.record?.draftId} controller={ui.subnet} state={ui.subnetState} />;
  if (!ui.state.active) return ui.state.error ? <aside className="exercise-error" role="alert">{t('guided.error')} <button type="button" className="btn" onClick={() => void ui.controller.start()}>{t('common.retry')}</button></aside> : null;
  const { controller, state } = ui, step = steps[state.step];
  return <ExercisePanelFrame key={state.draftId} exerciseId="guided-first-connection" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guided.title')}</strong><div className="exercise-summary">{t('guided.progress', { step: state.step + 1, total: FIRST_CONNECTION.steps.length })}</div></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed}
      onClick={() => setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button>
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
