import { useEffect, useState } from 'react';
import { useTranslation, type TranslationKey } from '../i18n';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterStepProgress, ExploreNetworkButton } from './CompletionUI';
import { TutorialCommand } from './TutorialCommand';
import { sim } from '../sim';
import { useStore } from '../store';
import { inspectorRoutingView, observeInspectorRoutingView, requestInspectorRouting } from '../inspectorRouting';
import { LPM_IDS } from './lpmChapter';
import type { LpmController, LpmState } from './LpmController';
import { GuidedVisualHelp } from './GuidedVisualHelp';
import { staticRoutingVisualHelp } from './tutorialVisualHelp';

export function LpmPanel({ controller, state, onExplore }: { controller: LpmController; state: LpmState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  const [prediction, setPrediction] = useState<'short' | 'long' | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setPrediction(''); setConfirmed(false); }, [r?.attemptId]);
  useEffect(() => {
    const inspect = () => { const view = inspectorRoutingView(); if (view?.network === sim.net && view.deviceId === LPM_IDS.r1) controller.inspectRoutes(); };
    inspect(); return observeInspectorRoutingView(inspect);
  }, [controller, r?.step]);
  if (!state.active || !r) return null;
  const key = (suffix: string) => `guidedLpm.${suffix}` as TranslationKey;
  const completion = { completed: r.completed.length, total: 5, complete: r.completed.length === 5 && (r.step!==5||state.passed) };
  const receipt = r.step === 1 ? r.initial : r.step === 4 ? r.short : r.step === 5 ? r.restored : null;
  const choice = (label: TranslationKey, value: string, options: [string, string][]) => <label className="guided-alternative-choice">{t(label)}<select data-lpm-answer value={value} disabled={state.busy || state.storageError || state.historical} onChange={e => controller.answer(e.target.value)}><option value="" disabled>{t('guidedLpm.choose')}</option>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>;
  return <ExercisePanelFrame exerciseId="guided-lpm" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedLpm.title')}</strong><ChapterStepProgress step={r.step} total={5} progress={completion}/></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="longest-prefix-match" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-lpm-step={r.step} data-lpm-saving={state.saving}>
      <h3>{t(key(`step${r.step}Title`))}</h3><p>{t(key(`step${r.step}Text`))}</p>
      {r.step === 1 && <>
        {!r.initial && !confirmed && <div data-lpm-prediction>
          <label className="guided-alternative-choice">{t('guidedLpm.prediction')}<select data-lpm-prediction-choice value={prediction} disabled={state.busy} onChange={e => setPrediction(e.target.value as typeof prediction)}>
            <option value="" disabled>{t('guidedLpm.choose')}</option><option value="short">{t('guidedLpm.shortPath')}</option><option value="long">{t('guidedLpm.longPath')}</option>
          </select></label><button type="button" className="btn" data-lpm-prediction-confirm disabled={!prediction || state.busy} onClick={() => setConfirmed(true)}>{t('guidedLpm.confirmPrediction')}</button>
        </div>}
        {(confirmed || r.initial) && <>
          {confirmed && <p data-lpm-predicted>{t('guidedLpm.predicted', { path: t(prediction === 'short' ? 'guidedLpm.shortPath' : 'guidedLpm.longPath') })}</p>}
          {!r.initial && <p data-lpm-test>{t('guidedLpm.test')}</p>}
          {r.initial && <p className="exercise-learning" data-lpm-surprise>{confirmed ? t(prediction === 'long' ? 'guidedLpm.predictionMatched' : 'guidedLpm.predictionDifferent') : ''} {t('guidedLpm.surprise')}</p>}
        </>}
      </>}
      {r.step === 2 && <>
        {choice('guidedLpm.compare', r.compared ? 'both' : '', [['only24', t('guidedLpm.only24')], ['only25', t('guidedLpm.only25')], ['both', t('guidedLpm.both')]])}
      </>}
      {r.step === 3 && choice('guidedLpm.rule', r.rule ? '25' : '', [['24', '/24'], ['25', '/25']])}
      {[2, 5].includes(r.step) && <details className="exercise-learning" key={r.step} data-lpm-help><summary>{t('guidedLpm.help')}</summary>
        {r.step === 2 && <><pre><TutorialCommand>ip route</TutorialCommand></pre><button type="button" className="btn" data-lpm-table onClick={() => { useStore.getState().select(LPM_IDS.r1); requestInspectorRouting(sim.net, LPM_IDS.r1); }}>{t('guidedLpm.table')}</button></>}
        <p>{t(key(`help${r.step}`))}</p>{r.step===5&&<GuidedVisualHelp help={staticRoutingVisualHelp[4]!}/>}</details>}
      {state.answerError && <p role="status">{t('guidedLpm.wrong')}</p>}
      {state.warning && <p role="status">{t(state.warning === 'forms' ? 'guided.hintForms' : 'guidedLpm.identity')}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {r.step===5?<div role="status" data-lpm-checks>{([['short',state.shortRoute,'guidedLpm.shortCheck'],['long',state.longRouteProved,'guidedLpm.longCheck']] as const).map(([id,valid,label])=><p key={id} className="guided-action-status" data-lpm-check={id} data-tutorial-passed={valid}><span className="guided-action-indicator" aria-hidden="true">{valid?'✓':''}</span><span>{t(label)}<span className="sr-only">: {t(valid?'exercises.completed':'guidedLpm.pending')}</span></span></p>)}</div>:<p className="guided-action-status" role="status" data-lpm-passed={state.historical} data-tutorial-passed={state.historical}><span className="guided-action-indicator" aria-hidden="true">{state.historical ? '✓' : ''}</span><span>{t(state.historical ? key(`success${r.step}`) : 'guidedLpm.pending')}</span></p>}
      {state.historical && !state.passed && <p className="exercise-learning">{t('guidedLpm.history')}</p>}
      {receipt && <div className="exercise-learning" data-lpm-observed><p><strong>{t('guidedLpm.request')}: </strong>{receipt.request.map(id => sim.net.devices.get(id)?.name ?? id).join(' → ')}</p><p><strong>{t('guidedLpm.reply')}: </strong>{receipt.reply.map(id => sim.net.devices.get(id)?.name ?? id).join(' → ')}</p></div>}
      {r.step === 5 && completion.complete && <div className="guided-action-status guided-completion" data-lpm-finished role="status"><span className="guided-action-indicator" aria-hidden="true">✓</span><div><strong>{t('guidedLpm.finished')}</strong><p>{t('guidedLpm.finishedText')}</p></div></div>}
    </div><footer>
      <button type="button" className="btn" disabled={r.step === 1 || state.busy || state.saving || state.storageError} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < 5 && <button type="button" className="btn btn--primary" data-lpm-next disabled={!state.canAdvance || state.busy || state.saving} onClick={() => void controller.next()}>{t('guided.next')}</button>}
      {r.step === 5 && completion.complete && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
