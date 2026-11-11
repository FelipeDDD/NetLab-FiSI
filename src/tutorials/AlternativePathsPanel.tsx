import { TutorialCommand, TutorialText } from './TutorialCommand';
import { useState } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation, type TranslationKey } from '../i18n';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString, parseIp } from '../engine/ip';
import { ChapterRestartButton } from './ChapterRestartUI';
import { ChapterStepProgress, ChapterFinished, ExploreNetworkButton } from './CompletionUI';
import { alternativePathsCompletion, alternativePracticeCompletion } from './completion';
import { TRANSIT_PLAN, NEIGHBOR_TESTS, ALTERNATIVE_TOTAL, ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, alternativePart, alternativeTarget, expectedPcPath, alternativeConditions } from './alternativePathsChapter';
import { alternativeReviewEvidence } from './alternativeReviewEvidence';
import type { AlternativeState, AlternativePathsController } from './AlternativePathsController';
import { LPM_ADDRESS, lpmPaths } from './alternativeLpm';

export function AlternativePathsPanel({ controller, state, onExplore }: { controller: AlternativePathsController; state: AlternativeState; onExplore(): void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), r = state.record;
  if (!state.active || !r) return null;
  const completion = alternativePathsCompletion(r), target = r.step >= 16 && r.step <= 19 ? LPM_ADDRESS : alternativeTarget(sim.net, I.b) ?? '192.168.20.20', router = sim.net.devices.get(I.r1);
  const practice=alternativePracticeCompletion(r),partialFinished=!!r.entry&&practice.complete,finished=completion.complete||partialFinished;
  const selected = router instanceof IpDevice ? router.lookupRoute(parseIp(target)!) : null;
  const part = alternativePart(r.step), key = (suffix: string) => `guidedAlternative.step${r.step}${suffix}` as TranslationKey;
  const history = alternativeReviewEvidence(r), reviewing = state.reviewing;
  const legacyLpm = r.lpm.legacy && r.step >= 14 && r.step <= 19 || r.lpm.experiment.legacy && r.step >= 16 && r.step <= 19;
  const unavailable = !sim.net.links.get(L.right)?.operational, recovery = alternativeConditions(sim.net);
  const hasHelp = [1, 2, 3, 4, 5, 6, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19].includes(r.step);
  const credited = new Set([...r.completed, ...(r.lpm.legacy ? [14, 15] : []), ...(r.lpm.experiment.legacy ? [16, 17, 18, 19] : [])]);
  const experimentKey = r.step === 16 ? 'r2' : r.step === 17 ? 'broad' : 'specific';
  const receipt = r.lpm.experiment[experimentKey];
  const experimentPing = r.step === 16 ? state.experiment.r2Ping : r.step === 17 ? state.experiment.broadPing : state.experiment.specificPing;
  const recordedPing = !!receipt && r.completed.includes(r.step) && !legacyLpm;
  const showComparison = state.lpmObserved || history.comparison;
  const experimentRoute = r.step === 16 ? state.experiment.r2Route : r.step === 17 ? state.experiment.broadRoute : state.experiment.specificRoute;
  const requestPath = r.lpm.pc ? r.step === 16 ? [I.r2, I.r3, r.lpm.pc.id] : r.step === 17 ? [I.a, I.r1, I.r2, I.r3, r.lpm.pc.id] : lpmPaths(r.lpm.pc.id).request : [];
  const pathNames = (ids: string[]) => ids.map(id => id === r.lpm.pc?.id ? 'PC C' : sim.net.devices.get(id)?.name ?? id).join(' → ');
  const transit = r.step <= 3 ? TRANSIT_PLAN.slice((r.step - 1) * 2, r.step * 2).map(row => `${sim.net.devices.get(row.device)?.name} ${row.iface} (${row.address})`) : [];
  const instruction = t(r.step === 20 && r.storm === 'legacy' ? 'guidedAlternative.stormLegacy' : key('Text'), { first: transit[0] ?? '', second: transit[1] ?? '' });
  const commands = r.step === 1 ? `ip addr\n${t('guidedAlternative.addressSyntax')}`
    : r.step === 5 || r.step === 6 ? 'ip route add default via <gateway>'
    : r.step === 8 ? t('guidedAlternative.routeSyntax')
    : r.step === 16 ? t('guidedAlternative.routeSyntax') : null;
  const choice = (kind: 'remote' | 'hop' | 'lpm', label: TranslationKey, value: string, options: { value: string; label: string }[]) => <label className="guided-alternative-choice">{t(label)}<select data-alternative-answer={kind} value={value} disabled={state.busy || state.storageError} onChange={event => controller.answer(kind, event.target.value)}><option value="" disabled>{t('guidedAlternative.choose')}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <ExercisePanelFrame exerciseId="guided-alternative-paths" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedAlternative.title')}</strong><ChapterStepProgress step={r.step - part.start + 1} total={part.total} progress={completion} scenario={t(`guidedAlternative.part${part.part}` as TranslationKey)} scenarioProgress={{ completed: [...credited].filter(step => step >= part.start && step < part.start + part.total).length, total: part.total }}/></div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '+' : '−'}</button>
    <ChapterRestartButton chapter="alternative-paths" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed && <><div className="exercise-body" data-alternative-step={r.step} data-alternative-saving={state.saving}>
      <h3>{t(key('Title'))}</h3><p><TutorialText>{instruction}</TutorialText></p>
      {r.entry && <p className="exercise-learning" data-alternative-entry={r.entry.point}>{t('guidedAlternative.suppliedEntry',{last:r.entry.firstTask-1})}</p>}
      {reviewing && <aside className="exercise-learning guided-review-note" role="status" data-alternative-history><strong><span className="guided-history-check" aria-hidden="true">✓ </span>{t('guidedAlternative.historicalTitle')}</strong><p>{t(legacyLpm ? r.lpm.legacy ? 'guidedAlternative.lpmLegacy' : 'guidedAlternative.experimentLegacy' : 'guidedAlternative.historicalStep')}</p></aside>}
      {r.step >= 14 && r.step <= 19 && r.lpm.pc && <p data-alternative-host><code>PC C</code></p>}
      {r.step === 20 && r.storm !== 'legacy' && r.storm !== 'pending' && <p className="exercise-learning" role="status" data-alternative-storm={unavailable ? 'down' : 'restored'}>{t(!unavailable ? r.failure ? 'guidedAlternative.stormRestoredAfterProof' : 'guidedAlternative.stormRestored' : r.storm === 'adopted' ? 'guidedAlternative.stormAlreadyDown' : 'guidedAlternative.stormMessage')}</p>}
      {r.step === 20 && r.storm === 'legacy' && !r.failure && <p className="exercise-learning"><TutorialText>{t('guidedAlternative.stormLegacyHelp')}</TutorialText></p>}
      {[7, 10].includes(r.step) && state.investigationResult && <p className="exercise-learning" role="status" data-alternative-investigation={state.investigationResult}>{t(state.investigationResult === 'missing-route' ? 'guidedAlternative.investigatedMissing' : state.investigationResult === 'missing-return' ? 'guidedAlternative.investigatedReturn' : state.investigationResult === 'reply' ? 'guidedAlternative.investigatedReply' : 'guidedAlternative.investigatedOther')}</p>}
      {[12, 22].includes(r.step) && (state.pathStatus === 'verified' || (r.step === 12 ? history.via : history.direct)) && <p className="exercise-learning" data-alternative-observed-path><strong>{t('guidedAlternative.observedPath')}: </strong>{expectedPcPath('ab', r.step === 22 ? 'direct' : 'via').map(id => sim.net.devices.get(id)?.name ?? id).join(' → ')}</p>}
      {!legacyLpm && r.step >= 16 && r.step <= 18 && (experimentPing || recordedPing) && receipt && <>
        <p data-lpm-path="request">{t('guidedAlternative.requestPath')}: {pathNames(requestPath)}</p>
        <p data-lpm-path="reply">{t('guidedAlternative.replyPath')}: {pathNames(receipt.reply)}</p>
      </>}
      {!legacyLpm && r.step >= 16 && r.step <= 18 && <>{reviewing && <strong>{t('guidedAlternative.currentState')}</strong>}<ul className="guided-subnet-replies" data-lpm-checkpoints>{[["route", experimentRoute, 'guidedAlternative.routeConfigured'], ["ping", experimentPing, 'guidedAlternative.pingProved']].map(([id, passed, label]) => <li key={String(id)} data-lpm-check={id} data-tutorial-passed={!!passed}><span aria-hidden="true">{passed ? '✓' : '○'}</span> {t(label as TranslationKey)}</li>)}</ul></>}
      {r.step === 17 && (state.experiment.broadPing || history.broad) && <p className="exercise-learning" data-lpm-covered><TutorialText>{t('guidedAlternative.broadExplanation')}</TutorialText></p>}
      {r.step === 17 && !state.historical && !legacyLpm && state.experiment.broadBlocked && <p className="exercise-learning" role="status" data-lpm-recovery><TutorialText>{t('guidedAlternative.broadRecovery')}</TutorialText></p>}
      {r.step <= 3 && <ul className="guided-subnet-replies">{NEIGHBOR_TESTS.slice((r.step - 1) * 2, r.step * 2).map(test => <li key={test.key} data-alternative-neighbor={test.key} data-tutorial-passed={state.neighbors[test.key]}><span aria-hidden="true">{state.neighbors[test.key] ? '✓' : '○'}</span> {sim.net.devices.get(test.from)?.name} → {sim.net.devices.get(test.to)?.name} · {test.target}</li>)}</ul>}
      {r.step === 4 && choice('remote', 'guidedAlternative.remoteQuestion', r.remoteUnderstood ? '23' : '', ['12', '13', '23'].map(value => ({ value, label: `10.0.${value}.0/30` })))}
      {(r.step === 12 || r.step === 22) && <ul className="guided-subnet-replies" data-alternative-proven-path={state.pathStatus}>{(['ab', 'ba'] as const).map(pair => <li key={pair} data-alternative-reply={pair} data-tutorial-passed={state.replies[pair]}><span aria-hidden="true">{state.replies[pair] ? '✓' : '○'}</span> PC {pair[0].toUpperCase()} → PC {pair[1].toUpperCase()} · {alternativeTarget(sim.net, pair[1] === 'a' ? I.a : I.b) ?? '—'}</li>)}</ul>}
      {r.step === 13 && choice('hop', 'guidedAlternative.hopQuestion', r.hopUnderstood ? 'r2' : '', [{ value: 'r2', label: '10.0.12.2' }, { value: 'r3', label: '10.0.13.2' }, { value: 'destination', label: `${target} · ${t('guidedAlternative.destination')}` }])}
      {r.step === 19 && !legacyLpm && showComparison && <>
        <p data-lpm-comparison><TutorialText>{t('guidedAlternative.pathComparison')}</TutorialText></p>
        <p data-lpm-before>{t('guidedAlternative.beforePath')} (/24): {pathNames([I.a, I.r1, I.r2, I.r3, r.lpm.pc!.id])}</p>
        <p data-lpm-path="request">{t('guidedAlternative.afterPath')} (/25): {pathNames(lpmPaths(r.lpm.pc!.id).request)}</p>
        <p data-lpm-path="reply">{t('guidedAlternative.replyPath')}: {pathNames(r.lpm.experiment.specific!.reply)}</p>
        {choice('lpm', 'guidedAlternative.lpmQuestion', r.lpmUnderstood ? 'specific' : '', [{ value: 'static', label: t('guidedAlternative.staticAlways') }, { value: 'specific', label: t('guidedAlternative.specific') }, { value: 'cables', label: t('guidedAlternative.shortestCable') }])}
      </>}
      {r.step === 4 && r.remoteUnderstood && <p className="exercise-learning" data-alternative-feedback="remote"><TutorialText>{t('guidedAlternative.connectedExplanation')}</TutorialText></p>}
      {r.step === 13 && (state.passed || history.hop) && r.hopUnderstood && <p className="exercise-learning" data-alternative-feedback="hop"><TutorialText>{t('guidedAlternative.routeExplanation')}</TutorialText></p>}
      {r.step === 19 && showComparison && r.lpmUnderstood && <p className="exercise-learning" data-alternative-feedback="lpm"><TutorialText>{t(JSON.stringify(r.lpm.experiment.specific?.reply) === JSON.stringify(r.lpm.pc && lpmPaths(r.lpm.pc.id).reply) ? 'guidedAlternative.lpmExplanation' : 'guidedAlternative.lpmRuleExplanation')}</TutorialText></p>}
      {hasHelp && <details className="exercise-learning" key={r.step} data-alternative-help><summary>{t('guidedAlternative.help')}</summary>
        <p><TutorialText>{t(key('Help'))}</TutorialText></p>
        {commands && <pre><TutorialCommand>{commands}</TutorialCommand></pre>}
        {[4, 13, 19].includes(r.step) && <><strong>{t('guidedAlternative.table')}</strong><div className="guided-alternative-table"><table><thead><tr><th>{t('guidedAlternative.route')}</th><th>{t('guidedAlternative.nextHop')}</th><th>{t('guidedAlternative.outgoing')}</th><th>{t('guidedAlternative.origin')}</th></tr></thead><tbody>{router instanceof IpDevice && router.routes().map((route, index) => {
        const chosen = route.dest === selected?.dest && route.prefix === selected.prefix && route.via === selected.via && route.ifaceName === selected.ifaceName && route.kind === selected.kind;
        return <tr key={index} data-alternative-selected-route={chosen}><td>{chosen && <span title={t('guidedAlternative.selected')} aria-label={t('guidedAlternative.selected')}>✓ </span>}<code>{cidrToString(route.dest, route.prefix)}</code></td><td><code>{route.via === null ? t('guidedAlternative.none') : ipToString(route.via)}</code></td><td>{route.ifaceName}</td><td>{route.kind === 'rip' ? 'RIP' : t(route.kind === 'connected' ? 'guidedAlternative.connected' : 'guidedAlternative.static')}</td></tr>;
        })}</tbody></table></div></>}
      </details>}
      {[12, 13, 22].includes(r.step) && !state.historical && state.pathStatus === 'invalidated' && <p role="status" data-alternative-proven-path={r.step === 13 ? 'invalidated' : undefined}><TutorialText>{t('guidedAlternative.invalidatedPath')}</TutorialText></p>}
      {r.step === 20 && (state.passed || history.failure) && <p className="exercise-learning" data-alternative-failure-explanation><TutorialText>{t('guidedAlternative.failureExplanation')}</TutorialText></p>}
      {r.step === 21 && <>
        <p className="exercise-learning"><TutorialText>{t('guidedAlternative.replaceExplanation')}</TutorialText></p>
        <p><TutorialText>{t('guidedAlternative.preservePcCRoutes')}</TutorialText></p>
        <ul className="guided-subnet-replies">{[['r1', recovery.directForward, 'guidedAlternative.recoveryR1'], ['r3', recovery.directBackward, 'guidedAlternative.recoveryR3']].map(([id, passed, label]) => <li key={String(id)} data-alternative-recovery={id} data-tutorial-passed={!!passed}><span aria-hidden="true">{passed ? '✓' : '○'}</span> {t(label as TranslationKey)}</li>)}</ul>
      </>}
      {r.step === ALTERNATIVE_TOTAL && (state.passed || history.direct) && finished && <p className="exercise-learning" data-alternative-recovered><TutorialText>{t('guidedAlternative.recoveredExplanation')}</TutorialText></p>}
      {state.failureMismatch && <p className="exercise-learning" data-alternative-failure-mismatch><TutorialText>{t('guidedAlternative.breakMismatch')}</TutorialText></p>}
      {state.answerError && <p role="alert"><TutorialText>{t('guidedAlternative.wrong')}</TutorialText></p>}
      {state.warning && (!state.historical || !['wiring', 'transit'].includes(state.warning)) && <p role="status"><TutorialText>{t(`guidedAlternative.${state.warning}`)}</TutorialText></p>}
      {r.step === 14 && !state.historical && !legacyLpm && r.lpm.stage !== 'ready' && <button type="button" className="btn" disabled={state.busy || state.storageError} onClick={() => void controller.prepareLanC()}>{t('guidedAlternative.prepare')}</button>}
      {state.storageError && <p role="alert">{t('guided.storageError')} <button type="button" className="btn" onClick={() => void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {(!r.prepared || r.stage === 'adding-pcs') && <button type="button" className="btn" disabled={state.busy || state.saving || state.storageError} onClick={() => void controller.prepare()}>{t('guidedAlternative.prepare')}</button>}
      <div data-alternative-passed={state.passed} data-tutorial-passed={state.passed}>{state.passed && r.step !== ALTERNATIVE_TOTAL && <p className="guided-action-status" role="status"><span className="guided-action-indicator" aria-hidden="true">✓</span><span>{t('guidedAlternative.passed')}</span></p>}</div>
      {r.step === ALTERNATIVE_TOTAL && state.canAdvance && completion.complete && <ChapterFinished/>}
      {r.step === ALTERNATIVE_TOTAL && state.canAdvance && partialFinished && <div className="guided-action-status guided-completion" role="status" data-alternative-practice-finished><span className="guided-action-indicator" aria-hidden="true">✓</span><div><strong>{t(r.entry?.point==='part-4'?'guidedAlternative.partialFinished':'guidedAlternative.practiceFinished',{part:r.entry?.point.slice(-1)??''})}</strong><p>{t('guided.tasksCompleted',{completed:practice.completed,total:practice.total})}</p><p>{t('guided.exploreInvitation')}</p></div></div>}
    </div><footer><button type="button" className="btn" disabled={state.busy || r.step <= (r.entry?.firstTask??1) || r.stage === 'adding-pcs'} onClick={() => controller.previous()}>{t('guided.previous')}</button>
      {r.step < ALTERNATIVE_TOTAL && <button type="button" className="btn btn--primary" data-alternative-next disabled={!state.canAdvance || state.busy || state.storageError} onClick={() => void controller.next()}>{t(r.step === 4 && r.stage === 'triangle' ? 'guidedAlternative.addPcs' : 'guided.next')}</button>}
      {r.step === ALTERNATIVE_TOTAL && state.canAdvance && finished && <ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
