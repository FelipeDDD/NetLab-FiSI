import { useEffect, useState } from 'react';
import { GuidedVisualHelp } from './GuidedVisualHelp';
import { staticRoutingVisualHelp } from './tutorialVisualHelp';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation, type TranslationKey } from '../i18n';
import { sim } from '../sim';
import { useStore } from '../store';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterFinished, ChapterStepProgress, ExploreNetworkButton } from './CompletionUI';
import { staticRoutingCompletion } from './completion';
import { STATIC_PAIRS, staticRoutingConditions, staticTarget, type StaticPair } from './staticRoutingChapter';
import type { MissingRouter } from './staticRoutingProgress';
import type { StaticRoutingTutorialController, StaticRoutingState } from './StaticRoutingTutorialController';

function FinalRoutingVerification({ controller, state }: { controller: StaticRoutingTutorialController; state: StaticRoutingState }) {
  const { t } = useTranslation();
  const paused = useStore(s => s.paused);
  useEffect(() => { controller.enterFinalVerification(); return controller.cancelFinalVerification; }, [controller]);
  return <>
    <ul className="guided-subnet-replies" aria-live="polite">{STATIC_PAIRS.map(pair => {
      const status = state.verification.running ? state.verification.statuses[pair] : state.replies[pair] ? 'confirmed' : state.verification.statuses[pair] === 'confirmed' ? 'pending' : state.verification.statuses[pair];
      return <li key={pair} data-static-reply={pair} data-static-verification={status} data-tutorial-passed={status === 'confirmed'}>
        <span aria-hidden="true">{status === 'confirmed' ? '✓' : status === 'failed' ? '×' : status === 'running' ? '◌' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {t(`guidedStaticLine.verification${status}`)}
      </li>;
    })}</ul>
    {state.verification.running && paused && <p role="status">{t('guidedStaticLine.verificationPaused')}</p>}
    {!state.verification.running && !state.passed && <button type="button" className="btn" data-static-verify disabled={state.busy || state.storageError || !!state.warning} onClick={() => controller.startFinalVerification()}>{t('guidedStaticLine.verificationRetry')}</button>}
  </>;
}

export function StaticRoutingTutorialPanel({ controller, state, onExplore }: { controller: StaticRoutingTutorialController; state: StaticRoutingState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const completion = staticRoutingCompletion(r), line = r.step <= 8;
  const pairs: readonly StaticPair[] = r.step === 8 ? ['ab', 'ba'] : STATIC_PAIRS;
  const key = (suffix: string) => `guidedStaticLine.step${r.step}${suffix}` as TranslationKey;
  const visualHelp = staticRoutingVisualHelp[r.step];
  const hasHelp = [2, 3, 4, 5, 6, 7, 9, 10].includes(r.step);
  return <ExercisePanelFrame exerciseId="guided-static-routing" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedStatic.title')}</strong><ChapterStepProgress step={line ? r.step : r.step - 8} total={line ? 8 : 3} progress={completion} scenarioProgress={{ completed: r.completed.filter(n => line ? n <= 8 : n > 8).length, total: line ? 8 : 3 }} scenario={`${t('guidedStatic.scenario', { scenario: line ? 1 : 2 })} · ${t(line ? 'guidedStatic.lineTitle' : 'guidedStatic.expandedTitle')}`}/></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="static-routing" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-static-step={r.step} data-static-saving={state.saving}>
      <h3>{t(key('Title'))}</h3><p>{t(key('Text'))}</p>
      {r.step === 3 && <label>{t('guidedStatic.chooseRouter')}<select data-static-missing value={r.missingAnswer ?? ''} disabled={state.busy || state.storageError} onChange={event => controller.chooseMissing(event.target.value as MissingRouter)}>
        <option value="" disabled>{t('guidedStatic.choose')}</option>{(['r1', 'r2', 'r3'] as const).map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}<option value="none">{t('guidedStatic.noMissing')}</option>
      </select></label>}
      {state.answerError && <p role="alert">{t('guidedStatic.wrongAnswer')}</p>}
      {hasHelp && <div className={visualHelp ? 'guided-help-with-image' : undefined} key={r.step}><details className="exercise-learning" data-static-help><summary>{t('guidedStaticLine.help')}</summary>
        {r.step === 2 ? <>
          <strong>{t('guidedStaticLine.readTable')}</strong><p>{t('guidedStaticLine.routeIntro')}</p>
          <pre><code>{'192.168.10.0/24 dev eth0 proto kernel scope link src 192.168.10.1\n10.0.12.0/30 dev eth1 proto kernel scope link src 10.0.12.1'}</code></pre>
          <ul>
            <li><code>192.168.10.0/24</code> — {t('guidedStaticLine.targetNetwork')}</li>
            <li><code>dev eth0</code> — {t('guidedStaticLine.networkInterface')}</li>
            <li><code>proto kernel</code> — {t('guidedStaticLine.kernelRoute')}</li>
            <li><code>scope link</code> — {t('guidedStaticLine.directlyReachable')}</li>
            <li><code>src 192.168.10.1</code> — {t('guidedStaticLine.sourceAddress')}</li>
          </ul>
          {!staticRoutingConditions(sim.net).r1Forward && <p>{t('guidedStaticLine.missingLanB')}</p>}
          <strong>{t('guidedStaticLine.addRoute')}</strong><pre><code>ip route add 192.168.20.0/24 via 10.0.12.2</code></pre>
          <p>{t('guidedStaticLine.routeMeaning')}</p><p>{t('guidedStaticLine.returnMeaning')}</p>
        </> : <p>{t(key('Help'))}</p>}
      </details>{visualHelp && <GuidedVisualHelp help={visualHelp}/>}</div>}
      {r.step === 8 && <ul className="guided-subnet-replies">{pairs.map(pair => <li key={pair} data-static-reply={pair} data-tutorial-passed={state.replies[pair]}><span aria-hidden="true">{state.replies[pair] ? '✓' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {staticTarget(sim.net, pair[1] as 'a') ?? '—'}</li>)}</ul>}
      {r.step === 11 && <FinalRoutingVerification controller={controller} state={state}/>}
      {state.warning && <p role="status">{t(`guidedStatic.${state.warning}`)}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(!r.prepared || r.stage === 'expanding') && <button type="button" className="btn" disabled={state.busy || state.saving || state.storageError} onClick={() => void controller.prepare()}>{t('guidedStatic.prepare')}</button>}
      <div data-static-passed={state.passed} data-tutorial-passed={state.passed}>{state.passed && <p className="guided-action-status" role="status"><span className="guided-action-indicator" aria-hidden="true">✓</span><span>{t('guidedStatic.passed')}</span></p>}</div>
      {r.step === 11 && state.passed && completion.complete && <ChapterFinished/>}
    </div><footer>
      <button type="button" className="btn" disabled={state.busy || r.step === 1 || r.stage === 'expanding'} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < 11 && <button type="button" className="btn btn--primary" data-static-next disabled={!state.passed || state.busy || state.storageError} onClick={() => void controller.next()}>{t(r.step === 8 && r.stage === 'line' ? 'guidedStatic.expand' : 'guided.next')}</button>}
      {r.step === 11 && state.passed && completion.complete && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
