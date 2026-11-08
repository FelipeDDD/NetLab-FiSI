import { useState } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation, type TranslationKey } from '../i18n';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString, parseIp } from '../engine/ip';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterStepProgress, ChapterFinished, ExploreNetworkButton } from './CompletionUI';
import { alternativePathsCompletion } from './completion';
import { TRANSIT_PLAN, NEIGHBOR_TESTS, ALTERNATIVE_TOTAL, ALTERNATIVE_IDS as I, alternativePart, alternativeTarget, expectedPcPath } from './alternativePathsChapter';
import type { AlternativeState, AlternativePathsController } from './AlternativePathsController';

export function AlternativePathsPanel({ controller, state, onExplore }: { controller: AlternativePathsController; state: AlternativeState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const completion = alternativePathsCompletion(r), target = alternativeTarget(sim.net, I.b) ?? '192.168.20.20', router = sim.net.devices.get(I.r1);
  const selected = router instanceof IpDevice ? router.lookupRoute(parseIp(target)!) : null;
  const part = alternativePart(r.step), key = (suffix: string) => `guidedAlternative.step${r.step}${suffix}` as TranslationKey;
  const hasHelp = [1, 2, 3, 4, 5, 8, 9, 10, 13, 14, 15, 16].includes(r.step);
  const transit = r.step <= 3 ? TRANSIT_PLAN.slice((r.step - 1) * 2, r.step * 2).map(row => `${sim.net.devices.get(row.device)?.name} ${row.iface} (${row.address})`) : [];
  const commands = r.step === 1 ? `ip addr\n${t('guidedAlternative.addressSyntax')}`
    : r.step === 5 ? 'ip route add default via <gateway>'
    : r.step === 8 ? t('guidedAlternative.routeSyntax')
    : r.step === 15 ? 'ip link set <interface> down'
    : r.step === 16 ? t('guidedAlternative.replaceSyntax') : null;
  const choice = (kind: 'remote' | 'hop' | 'lpm', label: TranslationKey, value: string, options: { value: string; label: string }[]) => <label className="guided-alternative-choice">{t(label)}<select data-alternative-answer={kind} value={value} disabled={state.busy || state.storageError} onChange={event => controller.answer(kind, event.target.value)}><option value="" disabled>{t('guidedAlternative.choose')}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <ExercisePanelFrame exerciseId="guided-alternative-paths" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedAlternative.title')}</strong><ChapterStepProgress step={r.step - part.start + 1} total={part.total} progress={completion} scenario={t(`guidedAlternative.part${part.part}` as TranslationKey)} scenarioProgress={{ completed: r.completed.filter(step => step >= part.start && step < part.start + part.total).length, total: part.total }}/></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="alternative-paths" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-alternative-step={r.step} data-alternative-saving={state.saving}>
      <h3>{t(key('Title'))}</h3><p>{t(key('Text'), { first: transit[0] ?? '', second: transit[1] ?? '' })}</p>
      {r.step <= 3 && <ul className="guided-subnet-replies">{NEIGHBOR_TESTS.slice((r.step - 1) * 2, r.step * 2).map(test => <li key={test.key} data-alternative-neighbor={test.key} data-tutorial-passed={state.neighbors[test.key]}><span aria-hidden="true">{state.neighbors[test.key] ? '✓' : '○'}</span> {sim.net.devices.get(test.from)?.name} → {sim.net.devices.get(test.to)?.name} · {test.target}</li>)}</ul>}
      {r.step === 4 && choice('remote', 'guidedAlternative.remoteQuestion', r.remoteUnderstood ? '23' : '', ['12', '13', '23'].map(value => ({ value, label: `10.0.${value}.0/30` })))}
      {(r.step === 12 || r.step === 17) && <ul className="guided-subnet-replies" data-alternative-proven-path={state.pathStatus}>{(['ab', 'ba'] as const).map(pair => <li key={pair} data-alternative-reply={pair} data-tutorial-passed={state.replies[pair]}><span aria-hidden="true">{state.replies[pair] ? '✓' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {alternativeTarget(sim.net, pair[1] === 'a' ? I.a : I.b) ?? '—'}</li>)}</ul>}
      {r.step === 13 && choice('hop', 'guidedAlternative.hopQuestion', r.hopUnderstood ? 'r2' : '', [{ value: 'r2', label: '10.0.12.2 · R2' }, { value: 'r3', label: '10.0.13.2 · R3' }, { value: 'destination', label: `${target} · ${t('guidedAlternative.destination')}` }])}
      {r.step === 14 && choice('lpm', 'guidedAlternative.lpmQuestion', r.lpmUnderstood ? 'specific' : '', [{ value: 'static', label: t('guidedAlternative.staticAlways') }, { value: 'specific', label: t('guidedAlternative.specific') }, { value: 'cables', label: t('guidedAlternative.shortestCable') }])}
      {r.step === 4 && r.remoteUnderstood && <p className="exercise-learning" data-alternative-feedback="remote">{t('guidedAlternative.connectedExplanation')}</p>}
      {r.step === 13 && r.hopUnderstood && <p className="exercise-learning" data-alternative-feedback="hop">{t('guidedAlternative.routeExplanation')}</p>}
      {r.step === 14 && r.lpmUnderstood && <p className="exercise-learning" data-alternative-feedback="lpm">{t('guidedAlternative.lpmExplanation', { target })}</p>}
      {hasHelp && <details className="exercise-learning" key={r.step} data-alternative-help><summary>{t('guidedAlternative.help')}</summary>
        <p>{t(key('Help'))}</p>
        {commands && <pre><code>{commands}</code></pre>}
        {r.step === 14 && <><p>{t('guidedAlternative.lpmHint')}</p><pre><code>ip route add 192.168.0.0/16 via 10.0.13.2</code></pre></>}
        {[4, 13, 14].includes(r.step) && <><strong>{t('guidedAlternative.table')}</strong><div className="guided-alternative-table"><table><thead><tr><th>{t('guidedAlternative.route')}</th><th>{t('guidedAlternative.nextHop')}</th><th>{t('guidedAlternative.outgoing')}</th><th>{t('guidedAlternative.origin')}</th></tr></thead><tbody>{router instanceof IpDevice && router.routes().map((route, index) => {
        const chosen = route.dest === selected?.dest && route.prefix === selected.prefix && route.via === selected.via && route.ifaceName === selected.ifaceName && route.kind === selected.kind;
        return <tr key={index} data-alternative-selected-route={chosen}><td>{chosen && <span title={t('guidedAlternative.selected')} aria-label={t('guidedAlternative.selected')}>✓ </span>}<code>{cidrToString(route.dest, route.prefix)}</code></td><td><code>{route.via === null ? t('guidedAlternative.none') : ipToString(route.via)}</code></td><td>{route.ifaceName}</td><td>{route.kind === 'rip' ? 'RIP' : t(route.kind === 'connected' ? 'guidedAlternative.connected' : 'guidedAlternative.static')}</td></tr>;
        })}</tbody></table></div></>}
      </details>}
      {[12, 17].includes(r.step) && state.pathStatus === 'verified' && <p className="exercise-learning">{expectedPcPath('ab', r.step === 17 ? 'direct' : 'via').map(id => sim.net.devices.get(id)?.name ?? id).join(' → ')}</p>}
      {[12, 13, 14, 17].includes(r.step) && state.pathStatus === 'invalidated' && <p role="status" data-alternative-proven-path={r.step === 13 || r.step === 14 ? 'invalidated' : undefined}>{t('guidedAlternative.invalidatedPath')}</p>}
      {r.step === 15 && state.passed && <p className="exercise-learning">{t('guidedAlternative.failureExplanation')}</p>}
      {state.failureMismatch && <p className="exercise-learning" data-alternative-failure-mismatch>{t('guidedAlternative.breakMismatch')}</p>}
      {state.answerError && <p role="alert">{t('guidedAlternative.wrong')}</p>}
      {state.warning && <p role="status">{t(`guidedAlternative.${state.warning}`)}</p>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button type="button" className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(!r.prepared || r.stage === 'adding-pcs') && <button type="button" className="btn" disabled={state.busy || state.saving || state.storageError} onClick={() => void controller.prepare()}>{t('guidedAlternative.prepare')}</button>}
      <div data-alternative-passed={state.passed} data-tutorial-passed={state.passed}>{state.passed && r.step !== ALTERNATIVE_TOTAL && <p className="guided-action-status" role="status"><span className="guided-action-indicator" aria-hidden="true">✓</span><span>{t('guidedAlternative.passed')}</span></p>}</div>
      {r.step === ALTERNATIVE_TOTAL && state.passed && completion.complete && <ChapterFinished/>}
    </div><footer><button type="button" className="btn" disabled={state.busy || r.step === 1 || r.stage === 'adding-pcs'} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < ALTERNATIVE_TOTAL && <button type="button" className="btn btn--primary" data-alternative-next disabled={!state.passed || state.busy || state.storageError} onClick={() => void controller.next()}>{t(r.step === 4 && r.stage === 'triangle' ? 'guidedAlternative.addPcs' : 'guided.next')}</button>}
      {r.step === ALTERNATIVE_TOTAL && state.passed && completion.complete && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
