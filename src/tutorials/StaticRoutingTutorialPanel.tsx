import { useState } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation, type TranslationKey } from '../i18n';
import { sim } from '../sim';
import { cidrToString } from '../engine/ip';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterFinished, ChapterProgress, ExploreNetworkButton } from './CompletionUI';
import { staticRoutingCompletion } from './completion';
import { STATIC_IDS, STATIC_PAIRS, staticTarget, type StaticPair } from './staticRoutingChapter';
import type { MissingRouter } from './staticRoutingProgress';
import type { StaticRoutingTutorialController, StaticRoutingState } from './StaticRoutingTutorialController';

export function StaticRoutingTutorialPanel({ controller, state, onExplore }: { controller: StaticRoutingTutorialController; state: StaticRoutingState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const completion = staticRoutingCompletion(r), pairs: readonly StaticPair[] = r.step === 5 ? ['ab', 'ba'] : STATIC_PAIRS;
  const hint: TranslationKey = `guidedStatic.${r.step <= 2 ? 'inspectHint' : r.step === 3 ? 'nextHopHint' : r.step === 4 ? 'returnHint' : r.step === 6 || r.step === 7 ? 'cHint' : 'testHint'}`;
  return <ExercisePanelFrame exerciseId="guided-static-routing" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedStatic.title')}</strong><div className="exercise-summary">{t('guided.progress', { step: r.step, total: 8 })} · <ChapterProgress progress={completion}/></div></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="static-routing" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-static-step={r.step} data-static-saving={state.saving}>
      <small>{t('guidedStatic.scenario', { scenario: r.step <= 5 ? 1 : 2 })} · {t(r.step <= 5 ? 'guidedStatic.lineTitle' : 'guidedStatic.expandedTitle')}</small>
      <h3>{t(`guidedStatic.task${r.step}Title` as TranslationKey)}</h3><p>{t(`guidedStatic.task${r.step}Text` as TranslationKey)}</p>
      {r.step === 2 && <label>{t('guidedStatic.chooseRouter')}<select data-static-missing value={r.missingAnswer ?? ''} disabled={state.busy || state.storageError} onChange={event => controller.chooseMissing(event.target.value as MissingRouter)}>
        <option value="" disabled>{t('guidedStatic.choose')}</option>{(['r1', 'r2', 'r3'] as const).map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}<option value="none">{t('guidedStatic.noMissing')}</option>
      </select></label>}
      {state.answerError && <p role="alert">{t('guidedStatic.wrongAnswer')}</p>}
      <details className="exercise-learning" key={r.step}><summary>{t('guidedStatic.hint')}</summary><p>{t(hint)}</p><details><summary>{t('guidedStatic.moreHint')}</summary><p>{t('guidedStatic.returnHint')}</p><pre><code>{t('guidedStatic.syntax')}</code></pre></details></details>
      <details className="exercise-learning"><summary>{t('guidedStatic.addressPlan')}</summary><div className="guided-static-addresses"><table><thead><tr><th>{t('guidedStatic.device')}</th><th>{t('guidedStatic.interface')}</th><th>{t('guidedStatic.address')}</th></tr></thead><tbody>{Object.values(STATIC_IDS).flatMap(id => {
        const d = sim.net.devices.get(id); return d?.interfaces.filter(i => i.ip).map(i => <tr key={`${id}:${i.name}`}><td>{d.name}</td><td>{i.name}</td><td><code>{cidrToString(i.ip!.addr, i.ip!.prefix)}</code></td></tr>) ?? [];
      })}</tbody></table></div></details>
      {(r.step === 5 || r.step === 8) && <ul className="guided-subnet-replies">{pairs.map(pair => <li key={pair} data-static-reply={pair} data-tutorial-passed={state.replies[pair]}><span aria-hidden="true">{state.replies[pair] ? '✓' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {staticTarget(sim.net, pair[1] as 'a') ?? '—'}</li>)}</ul>}
      {state.warning && <p role="status">{t(`guidedStatic.${state.warning}`)}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(!r.prepared || r.stage === 'expanding') && <button type="button" className="btn" disabled={state.busy || state.saving || state.storageError} onClick={() => void controller.prepare()}>{t('guidedStatic.prepare')}</button>}
      <p className="guided-action-status" role="status" data-static-passed={state.passed} data-tutorial-passed={state.passed}><span className="guided-action-indicator" aria-hidden="true">{state.passed ? '✓' : ''}</span><span>{t(state.passed ? 'guidedStatic.passed' : 'guided.pending')}</span></p>
      {r.step === 8 && state.passed && completion.complete && <ChapterFinished/>}
    </div><footer>
      <button type="button" className="btn" disabled={state.busy || r.step === 1 || r.stage === 'expanding'} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < 8 && <button type="button" className="btn btn--primary" data-static-next disabled={!state.passed || state.busy || state.storageError} onClick={() => void controller.next()}>{t(r.step === 5 && r.stage === 'line' ? 'guidedStatic.expand' : 'guided.next')}</button>}
      {r.step === 8 && state.passed && completion.complete && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
