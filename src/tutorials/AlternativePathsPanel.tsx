import { useState } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation, type TranslationKey } from '../i18n';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString, parseIp } from '../engine/ip';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterProgress, ChapterFinished, ExploreNetworkButton } from './CompletionUI';
import { alternativePathsCompletion } from './completion';
import { TRANSIT_PLAN, NEIGHBOR_TESTS, ALTERNATIVE_IDS as I, alternativeTarget, expectedPcPath } from './alternativePathsChapter';
import type { AlternativeState, AlternativePathsController } from './AlternativePathsController';

export function AlternativePathsPanel({ controller, state, onExplore }: { controller: AlternativePathsController; state: AlternativeState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const completion = alternativePathsCompletion(r), target = alternativeTarget(sim.net, I.b) ?? '192.168.20.20', router = sim.net.devices.get(I.r1);
  const selected = router instanceof IpDevice ? router.lookupRoute(parseIp(target)!) : null;
  const hint: TranslationKey = `guidedAlternative.${r.step === 1 || r.step === 4 ? 'addressHint' : r.step === 2 ? 'neighborHint' : r.step === 6 ? 'lpmHint' : r.step === 7 ? 'breakHint' : r.step === 8 ? 'directHint' : 'routeHint'}`;
  const choice = (kind: 'remote' | 'hop' | 'lpm', label: TranslationKey, value: string, options: { value: string; label: string }[]) => <label className="guided-alternative-choice">{t(label)}<select data-alternative-answer={kind} value={value} disabled={state.busy || state.storageError} onChange={event => controller.answer(kind, event.target.value)}><option value="" disabled>{t('guidedAlternative.choose')}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <ExercisePanelFrame exerciseId="guided-alternative-paths" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedAlternative.title')}</strong><div className="exercise-summary">{t('guided.progress', { step: r.step, total: 8 })} · <ChapterProgress progress={completion}/></div></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="alternative-paths" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-alternative-step={r.step} data-alternative-saving={state.saving}>
      <h3>{t(`guidedAlternative.task${r.step}Title` as TranslationKey)}</h3><p>{t(`guidedAlternative.task${r.step}Text` as TranslationKey)}</p>
      {r.step === 1 && <details className="exercise-learning" open><summary>{t('guidedAlternative.plan')}</summary><div className="guided-alternative-table"><table><thead><tr><th>{t('guidedAlternative.device')}</th><th>{t('guidedAlternative.interface')}</th><th>{t('guidedAlternative.address')}</th></tr></thead><tbody>{TRANSIT_PLAN.map(row => <tr key={`${row.device}:${row.iface}`}><td>{sim.net.devices.get(row.device)?.name}</td><td>{row.iface}</td><td><code>{row.address}</code></td></tr>)}</tbody></table></div></details>}
      {r.step === 2 && <ul className="guided-subnet-replies">{NEIGHBOR_TESTS.map(test => <li key={test.key} data-alternative-neighbor={test.key} data-tutorial-passed={state.neighbors[test.key]}><span aria-hidden="true">{state.neighbors[test.key] ? '✓' : '○'}</span> {sim.net.devices.get(test.from)?.name} → {sim.net.devices.get(test.to)?.name} · {test.target}</li>)}</ul>}
      {r.step === 3 && <><p className="exercise-learning">{t('guidedAlternative.connectedExplanation')}</p>{choice('remote', 'guidedAlternative.remoteQuestion', r.remoteUnderstood ? '23' : '', ['12', '13', '23'].map(value => ({ value, label: `10.0.${value}.0/30` })))}</>}
      {(r.step === 5 || r.step === 8) && <ul className="guided-subnet-replies">{(['ab', 'ba'] as const).map(pair => <li key={pair} data-alternative-reply={pair} data-tutorial-passed={state.replies[pair]}><span aria-hidden="true">{state.replies[pair] ? '✓' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {alternativeTarget(sim.net, pair[1] === 'a' ? I.a : I.b) ?? '—'}</li>)}</ul>}
      {r.step === 6 && <><p className="exercise-learning">{t('guidedAlternative.routeExplanation')}</p><p className="exercise-learning">{t('guidedAlternative.lpmExplanation', { target })}</p>
        {choice('hop', 'guidedAlternative.hopQuestion', r.hopUnderstood ? 'r2' : '', [{ value: 'r2', label: '10.0.12.2 · R2' }, { value: 'r3', label: '10.0.13.2 · R3' }, { value: 'destination', label: `${target} · ${t('guidedAlternative.destination')}` }])}
        {choice('lpm', 'guidedAlternative.lpmQuestion', r.lpmUnderstood ? 'specific' : '', [{ value: 'static', label: t('guidedAlternative.staticAlways') }, { value: 'specific', label: t('guidedAlternative.specific') }, { value: 'cables', label: t('guidedAlternative.shortestCable') }])}
      </>}
      {r.step >= 5 && <details className="exercise-learning" open={r.step === 6}><summary>{t('guidedAlternative.table')}</summary><div className="guided-alternative-table"><table><thead><tr><th>{t('guidedAlternative.route')}</th><th>{t('guidedAlternative.nextHop')}</th><th>{t('guidedAlternative.outgoing')}</th><th>{t('guidedAlternative.origin')}</th></tr></thead><tbody>{router instanceof IpDevice && router.routes().map((route, index) => {
        const chosen = route.dest === selected?.dest && route.prefix === selected.prefix && route.via === selected.via && route.ifaceName === selected.ifaceName && route.kind === selected.kind;
        return <tr key={index} data-alternative-selected-route={chosen}><td>{chosen && <span title={t('guidedAlternative.selected')} aria-label={t('guidedAlternative.selected')}>✓ </span>}<code>{cidrToString(route.dest, route.prefix)}</code></td><td><code>{route.via === null ? t('guidedAlternative.none') : ipToString(route.via)}</code></td><td>{route.ifaceName}</td><td>{route.kind === 'rip' ? 'RIP' : t(route.kind === 'connected' ? 'guidedAlternative.connected' : 'guidedAlternative.static')}</td></tr>;
      })}</tbody></table></div></details>}
      {(r.step === 6 || r.step === 8 && state.passed) && <p className="exercise-learning" data-alternative-proven-path>{t('guidedAlternative.provenPath')}:<br/>{expectedPcPath('ab', r.step === 8 ? 'direct' : 'via').map(id => sim.net.devices.get(id)?.name ?? id).join(' → ')}</p>}
      {r.step === 7 && state.passed && <p className="exercise-learning">{t('guidedAlternative.failureExplanation')}</p>}
      {r.step === 7 && !state.passed && r.viaBaseline && <p className="exercise-learning">{t('guidedAlternative.breakMismatch')}</p>}
      <details className="exercise-learning" key={r.step}><summary>{t('guidedAlternative.hint')}</summary><p>{t(hint)}</p><details><summary>{t('guidedAlternative.moreHint')}</summary><pre><code>{t(r.step === 1 || r.step === 4 ? 'guidedAlternative.addressSyntax' : 'guidedAlternative.routeSyntax')}</code></pre></details></details>
      {state.answerError && <p role="alert">{t('guidedAlternative.wrong')}</p>}
      {state.warning && <p role="status">{t(`guidedAlternative.${state.warning}`)}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button type="button" className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(!r.prepared || r.stage === 'adding-pcs') && <button type="button" className="btn" disabled={state.busy || state.saving || state.storageError} onClick={() => void controller.prepare()}>{t('guidedAlternative.prepare')}</button>}
      <p className="guided-action-status" role="status" data-alternative-passed={state.passed} data-tutorial-passed={state.passed}><span className="guided-action-indicator" aria-hidden="true">{state.passed ? '✓' : ''}</span><span>{t(state.passed ? 'guidedAlternative.passed' : 'guidedAlternative.pending')}</span></p>
      {r.step === 8 && state.passed && completion.complete && <><p className="exercise-learning">{t('guidedAlternative.finishExplanation')}</p><ChapterFinished/></>}
    </div><footer><button type="button" className="btn" disabled={state.busy || r.step === 1 || r.stage === 'adding-pcs'} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < 8 && <button type="button" className="btn btn--primary" data-alternative-next disabled={!state.passed || state.busy || state.storageError} onClick={() => void controller.next()}>{t(r.step === 3 && r.stage === 'triangle' ? 'guidedAlternative.addPcs' : 'guided.next')}</button>}
      {r.step === 8 && state.passed && completion.complete && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
