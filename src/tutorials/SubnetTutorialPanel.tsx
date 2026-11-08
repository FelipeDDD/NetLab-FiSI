import { useState, type ReactNode } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation } from '../i18n';
import { useStore } from '../store';
import { SUBNET_DEMO_COMMAND, SUBNET_PC_ID } from './subnetChapter';
import type { SubnetState, SubnetTutorialController } from './SubnetTutorialController';
import { ChapterRestartButton } from './ChapterRestartUI';
import { subnetChapterCompletion } from './completion';
import { correctedSubnet } from './subnetChapter';
import { sim } from '../sim';
import { ChapterStepProgress, ExploreNetworkButton } from './CompletionUI';

const titles = ['maskTitle', 'demoTitle', 'failureTitle', 'correctTitle', 'retestTitle'] as const;
const texts = ['maskText', 'demoText', 'failureText', 'correctText', 'retestText'] as const;
const successes = ['maskPassed', 'demoPassed', 'failurePassed', 'correctPassed', 'finished'] as const;
export function SubnetTutorialPanel({ controller, state, afterCompletion, onExplore }: { controller: SubnetTutorialController; state: SubnetState; afterCompletion?:ReactNode; onExplore?():void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const step = r.step - 1;
  const completion = subnetChapterCompletion(r, correctedSubnet(sim.net, r.pcC));
  return <ExercisePanelFrame exerciseId="guided-subnet-mask" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedSubnet.title')}</strong><ChapterStepProgress step={r.step} total={5} progress={completion}/></div>
    <button className="btn btn--icon" type="button" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="subnet-mask" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-subnet-step={r.step} data-subnet-saving={state.saving}>
      <h3>{t(`guidedSubnet.${titles[step]}`)}</h3><p>{t(`guidedSubnet.${texts[step]}`)}</p>
      {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {state.warning && <p role="status" className="hint">{t(`guidedSubnet.${state.warning}`)}</p>}
      {!r.prepared && <button type="button" className="btn" disabled={state.busy || state.storageError} onClick={() => void controller.begin()}>{t('guidedSubnet.prepare')}</button>}
      <button type="button" className="btn btn--small" onClick={() => useStore.getState().openTerminal(SUBNET_PC_ID)}>{t('guidedSubnet.terminal')}</button>
      {step === 0 && <>
        <pre><code>ip addr</code></pre>
        <form className="guided-subnet-answer" onSubmit={e => { e.preventDefault(); controller.checkAnswer(); }}>
          <label htmlFor="guided-subnet-mask">{t('guidedSubnet.maskLabel')}</label>
          <input id="guided-subnet-mask" className="iface-ip" value={r.answer} inputMode="decimal" autoComplete="off" spellCheck={false} aria-invalid={state.answerError || undefined} aria-describedby={state.answerError ? 'guided-subnet-answer-error' : undefined} onChange={e => controller.answer(e.target.value)} />
          <button className="btn" type="submit" disabled={state.busy || !r.prepared}>{t('guidedSubnet.check')}</button>
        </form>
        {state.answerError && <p id="guided-subnet-answer-error" role="status" className="guided-subnet-error">{t(r.inspected ? 'guidedSubnet.maskWrong' : 'guidedSubnet.inspectFirst')}</p>}
      </>}
      {step === 1 && <>
        <pre><code>{SUBNET_DEMO_COMMAND}</code></pre>
        {state.demoRunning ? <p role="status">{t('guidedSubnet.demoRunning')}</p> : <>
          {r.demoClaimed && !r.demoPassed && <p>{t('guidedSubnet.demoRestored')}</p>}
          <button className="btn" type="button" disabled={state.busy || state.storageError} onClick={() => void controller.demonstrate()}>{t('guidedSubnet.repeat')}</button>
        </>}
      </>}
      {step === 2 && r.unreachable && <p className="exercise-learning" data-subnet-failure-explanation>{t('guidedSubnet.failureExplanation')}</p>}
      {step === 4 && <ul className="guided-subnet-replies">{(['b', 'c'] as const).map(id => <li key={id} data-subnet-reply={id} data-tutorial-passed={!!r.replies[id]}><span aria-hidden="true">{r.replies[id] ? '✓' : '○'}</span> {t('guidedSubnet.reply', { pc: id.toUpperCase() })}</li>)}</ul>}
      <p className="guided-action-status" role="status" data-subnet-passed={state.passed} data-tutorial-passed={state.passed}>
        <span className="guided-action-indicator" aria-hidden="true">{state.passed ? '✓' : ''}</span>
        <span>{state.passed ? t(`guidedSubnet.${successes[step]}`) : t(step === 2 ? 'guidedSubnet.failurePending' : 'guided.pending')}</span>
      </p>
      {step === 4 && state.passed && <p className="exercise-learning" data-subnet-finished>{t('guidedSubnet.explanation')}</p>}
      {step === 4 && completion.complete && <p>{t('guided.exploreInvitation')}</p>}
      {step===4&&state.passed&&afterCompletion}
    </div><footer>
      <button className="btn" type="button" disabled={state.busy} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {step < 4 && <button className="btn btn--primary" type="button" disabled={!state.passed || state.busy || state.storageError} onClick={() => controller.next()}>{t('guided.next')}</button>}
      {step===4&&completion.complete&&onExplore&&<ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
