import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { ipToString, parseIp } from '../engine/ip';
import { IpDevice } from '../engine/ipdevice';
import { natCapturedFlow, natIntroSignature, natSecondHost, natConfiguration, natHostReady, natIntroComplete, natInvestigationComplete } from '../labs/natLearning';
import { natHints, natIntroConcept, PROGRESSIVE_NAT_PAT_ID, PROGRESSIVE_NAT_PAT_URL } from '../labs/progressiveNatPat';
import { useTranslation, type TranslationKey } from '../i18n';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { ChapterStepProgress, ExploreNetworkButton } from './CompletionUI';
import { TutorialCommand } from './TutorialCommand';
import { GuidedVisualHelp } from './GuidedVisualHelp';
import { natVisualHelp } from './tutorialVisualHelp';
import { useGuidedPanelCollapse } from './GuidedPanelCollapse';
import { natPatProgress } from './natPatProgress';

const captureErrors = {
  'missing-lan': 'guidedNat.missingLan',
  'missing-wan': 'guidedNat.missingWan',
  unpaired: 'guidedNat.unpaired',
} as const;

const correctionScreens = ['guidedNat.natFirewall', 'guidedNat.initialRule', 'guidedNat.yourTurn'] as const;

// Stored lab results retain the checker's original payload, including older attempts.
const resultMessages = new Map<string, TranslationKey>([
  ['A configuração mudou durante o teste. Execute uma nova verificação.', 'guidedNat.changedDuringCheck'],
  ['Confira o enlace externo, o encaminhamento e o serviço HTTP.', 'guidedNat.failureLink'],
  ['Confira a interface de saída do Router para o servidor.', 'guidedNat.failureInterface'],
  ['Confira os endereços e gateways dos PCs.', 'guidedNat.failureClients'],
  ['O servidor externo deve continuar sem rota para a LAN.', 'guidedNat.failureReturnRoute'],
  ['O Router não registrou uma nova conexão para o servidor.', 'guidedNat.failureConnection'],
  ['Era esperado que o PC saísse com a origem privada e ficasse sem resposta.', 'guidedNat.failureExpectedTimeout'],
  ['Confira se o PC recebeu a página pela conexão traduzida.', 'guidedNat.failureHttp'],
  ['As conexões precisam de portas externas distintas.', 'guidedNat.failurePorts'],
  ['Network is unreachable', 'guidedNat.failureUnreachable'],
  ['Destination Host Unreachable', 'guidedNat.failureUnreachable'],
  ['Operation not permitted', 'guidedNat.failureBlocked'],
  ['NAT translation resources exhausted', 'guidedNat.failureResources'],
  ['no reply (timed out)', 'guidedNat.failureTimeout'],
  ['target has no address', 'guidedNat.failureClients'],
]);

function localizedFailure(detail: string, t: ReturnType<typeof useTranslation>['t']): string {
  const responder = /^unreachable \(from ([\d.]+)\)$/.exec(detail);
  if (responder) return t('guidedNat.failureFrom', { address: responder[1] });
  return t(resultMessages.get(detail) ?? 'guidedNat.failureOther');
}

function Confirmation({ children, pending = false }: { children: React.ReactNode; pending?: boolean }) {
  return <p className="guided-action-status" data-tutorial-passed={!pending} role="status">
    <span className="guided-action-indicator" aria-hidden="true">{!pending && '✓'}</span><span>{children}</span>
  </p>;
}

/** Keep existing document receipts so older NAT/PAT attempts resume in this panel. */
export function NatPatPanel({ onExplore }: { onExplore?: () => void }) {
  const step = useStore(s => s.labStep), lab = useStore(s => s.lab)!;
  const results = useStore(s => s.labResults), quiz = useStore(s => s.quizAnswers);
  const capture = useStore(s => s.packetCapture), checking = useStore(s => s.labChecking);
  useStore(s => s.nodes);
  const { language, t } = useTranslation();
  const draftId = useStore(s => s.workspaceIdentity?.draftId);
  const [collapsed, setCollapsed] = useGuidedPanelCollapse(PROGRESSIVE_NAT_PAT_ID, draftId);
  const [local, setLocal] = useState('192.168.'), [external, setExternal] = useState('');
  const [sourceError, setSourceError] = useState(false);
  const packets = t('navigation.packets');
  const names = {
    lan: sim.net.devices.get('lan')?.name ?? 'Switch LAN',
    router: sim.net.devices.get('edge')?.name ?? 'Router Borda',
    web: sim.net.devices.get('web')?.name ?? 'Servidor Web',
  };
  const rich = (key: TranslationKey, values: Record<string, ReactNode>) =>
    t(key).split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 ? values[part] : part}</Fragment>);
  const signature = natIntroSignature(sim.net);
  const configuration = natConfiguration(sim.net);
  const objectivePassed = (id: string) => results[id]?.pass && results['nat-proof-' + id]?.pass && results['nat-proof-' + id]?.detail === configuration;
  const screen = quiz['nat-intro-screen'] ?? 0;
  const natScreen = Math.max(0, Math.min(2, quiz['nat-rule-screen'] ?? 0));
  const state = useStore.getState();
  const confirmed = (id: string) => results[id]?.pass && results[id].detail === signature;
  const captured = confirmed('nat-capture');
  const captureActive = capture.status === 'capturing' && capture.linkId === null;
  const http = confirmed('nat-first-http');
  const introComplete = natIntroComplete(results);
  const investigationComplete = natInvestigationComplete(results, quiz['nat-rule-screen']);
  const localOk = introComplete || confirmed('nat-source-local'), externalOk = introComplete || confirmed('nat-source-external');
  const comparison = step === 0 && screen === 1 && (!localOk || !externalOk) ? natCapturedFlow(capture.records) : null;
  const captureRecovery = typeof comparison === 'string'
    ? captureActive ? t('guidedNat.recoverActive')
      : capture.status === 'paused' && capture.linkId === null
        ? t('guidedNat.recoverPaused', { packets })
        : t('guidedNat.recoverStopped', { packets })
    : null;
  const host = natSecondHost(sim.net, results['nat-host']?.detail);
  const hostReady = natHostReady(sim.net, host);
  const peer = host && host.name !== 'PC2' ? `PC2 (${host.name})` : 'PC2';
  useEffect(() => {
    if (step === 0 && captureActive) state.recordLabResult('nat-capture', true, signature);
  }, [step, captureActive, signature]);
  useEffect(() => {
    if (step === 1 && host && !results['nat-host']) {
      state.recordLabResult('nat-host', true, host.id);
    }
  }, [step, host?.id, results['nat-host']]);
  const router = sim.net.devices.get('edge');
  const mappings = router instanceof IpDevice && objectivePassed('nat-after-pair')
    ? ['PC1', host?.id].flatMap(id => {
      const client = id ? sim.net.devices.get(id) : null;
      const address = client?.getInterface('eth0')?.ip?.addr;
      const entry = router.ct.list(sim.net.now).filter(e => e.orig.proto === 'tcp' && e.orig.srcIp === address &&
        e.orig.dstIp === parseIp('198.51.100.80') && e.orig.dstPort === 80 && e.state === 'established').at(-1);
      return entry ? [client!.name + ' — ' + ipToString(entry.orig.srcIp) + ':' + entry.orig.srcPort + ' → ' + ipToString(entry.trans.srcIp) + ':' + entry.trans.srcPort] : [];
    }) : [];

  function verifySource(which: 'local' | 'external') {
    const answer = which === 'local' ? local : external;
    if (!comparison || typeof comparison === 'string') return;
    if (parseIp(answer.trim()) !== parseIp(comparison[which])) { setSourceError(true); return; }
    state.recordLabResult('nat-source-' + which, true, signature);
    setSourceError(false);
  }
  function result(id: string, success: string) {
    const r = results[id];
    if (r?.pass && !objectivePassed(id)) return <p role="status">{t('guidedNat.stale')}</p>;
    return r && (r.pass ? <Confirmation>{success}</Confirmation> : <p role="status">{localizedFailure(r.detail, t)}</p>);
  }
  function check(id: string, label: string) {
    return <button type="button" className="btn" data-nat-check={id} disabled={checking} onClick={() => state.checkStep(id)}>{checking ? t('guidedNat.checking') : label}</button>;
  }
  const introReady = introComplete || !!captured && !!http;
  const passed = lab.steps[step].objectives.every(o => objectivePassed(o.id));
  const reviewInvestigation = investigationComplete && (!passed || !hostReady);
  const progress = natPatProgress({ results, quiz }, configuration, signature);
  const next = () => {
    if (step === 0 && screen === 0) state.answerQuiz('nat-intro-screen', 1);
    else if (step === 2) state.answerQuiz('nat-rule-screen', natScreen + 1);
    else state.setLabStep(step + 1);
  };
  const previous = () => {
    if (step === 0) state.answerQuiz('nat-intro-screen', 0);
    else if (step === 2 && natScreen > 0) state.answerQuiz('nat-rule-screen', natScreen - 1);
    else state.setLabStep(step - 1);
  };
  const canAdvance = step === 0 ? (screen === 0 ? introReady : !!localOk && !!externalOk) :
    step === 1 ? investigationComplete || passed && hostReady : natScreen < 2;
  return <ExercisePanelFrame exerciseId="guided-nat-pat" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guided.natTitle')}</strong>
      <ChapterStepProgress step={step + 1} total={lab.steps.length} progress={progress}/>
    </div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')}
      aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button>
  </>}>
    {!collapsed && <><div className="exercise-body" key={`${step}:${screen}:${natScreen}`} data-nat-body
      data-nat-packet-demo={step === 0 && screen === 0 && !http || undefined}>
      {step === 0 && <>
        <h3 data-nat-screen>{screen + 1}/2 · {t(screen === 0 ? 'guidedNat.conceptScreen' : 'guidedNat.compareScreen')}</h3>
        {screen === 0 ? introComplete && !http ? <>
          <Confirmation>{t('guidedNat.captureHistoric')}</Confirmation>
          {captureActive && <Confirmation>{t('guidedNat.captureActive')}</Confirmation>}
        </> : <>
          {natIntroConcept(language).split('\n').map((line, i) => <section key={i}>
            <p>{line.split('`').map((part, n) => n % 2 ? <code key={n}>{part}</code> : part)}</p>
            {i === 1 && captureActive && <Confirmation>{t('guidedNat.captureActive')}</Confirmation>}
            {i === 2 && http && <Confirmation>{t('guidedNat.firstHttp')}</Confirmation>}
          </section>)}
        </> : <>
          {introComplete ? <p>{t('guidedNat.comparisonHistoric')}</p> :
            <p>{rich('guidedNat.findSyn', { packets, syn: <code className="nat-term-a">TCP SYN</code>,
              address: <code className="nat-term-a">198.51.100.80</code>, port: <code className="nat-term-a">80</code> })}</p>}
          {typeof comparison === 'string' && <p role="status">{t(captureErrors[comparison], names)} {captureRecovery}</p>}
          <form onSubmit={e => { e.preventDefault(); verifySource('local'); }}>
            <p>{t('guidedNat.observeLan', names)}</p>
            <label htmlFor="nat-source-local">{t('guidedNat.sourceQuestion')}</label>
            <div className="guided-subnet-answer"><input id="nat-source-local" inputMode="decimal" value={local} onChange={e => setLocal(e.target.value)} disabled={!!localOk}/><button className="btn" disabled={!!localOk}>{t('guidedNat.verify')}</button></div>
            {localOk && <Confirmation>{t('guidedNat.localIdentified')}</Confirmation>}
          </form>
          {localOk && <form onSubmit={e => { e.preventDefault(); verifySource('external'); }}>
            <p>{t('guidedNat.observeWan', names)}</p>
            <label htmlFor="nat-source-external">{t('guidedNat.translatedSourceQuestion')}</label>
            <div className="guided-subnet-answer"><input id="nat-source-external" inputMode="decimal" value={external} onChange={e => setExternal(e.target.value)} disabled={!!externalOk}/><button className="btn" disabled={!!externalOk}>{t('guidedNat.verify')}</button></div>
            {externalOk && <Confirmation>{t('guidedNat.externalIdentified')}</Confirmation>}
          </form>}
          {sourceError && comparison && typeof comparison !== 'string' && <p role="alert">{t('guidedNat.checkSource')}</p>}
          {externalOk && <p>{t('guidedNat.comparisonResult')}</p>}
        </>}
      </>}
      {step === 1 && <>
        <h3>{t('guidedNat.workstation')}</h3>
        {reviewInvestigation ? <section>
          <Confirmation>{t('guidedNat.investigationHistoric')}</Confirmation>
          <p>{t('guidedNat.investigationRepeat')}</p>
        </section> : <>
        <section><p>{rich('guidedNat.addHost', { peer, lan: names.lan,
          address: <code className="nat-term-c">192.168.60.11/24</code>, gateway: <code className="nat-term-c">192.168.60.1</code>,
          ping: <code className="nat-term-b">PING</code> })}</p>
          {hostReady && <Confirmation>{t('guidedNat.hostReady')}</Confirmation>}
          {!host && <p>{t('guidedNat.oneHost')}</p>}
          {host && !hostReady && <Confirmation pending>{t('guidedNat.hostPending')}</Confirmation>}
          {hostReady && (result('nat-before-local', t('guidedNat.pingPassed')) ??
            <Confirmation pending>{t('guidedNat.pingPending')}</Confirmation>)}
        </section>
        {hostReady && objectivePassed('nat-before-local') &&
          <section data-nat-http-comparison><p>{t('guidedNat.compareHttp', { url: PROGRESSIVE_NAT_PAT_URL, peer })}</p>
            {result('nat-before-pc1', t('guidedNat.pc1Passed'))}
            {result('nat-before-pc2', t('guidedNat.pc2InitialFailure'))}
            {!results['nat-before-pc1'] && <Confirmation pending>{t('guidedNat.pc1Pending')}</Confirmation>}
            {!results['nat-before-pc2'] && <Confirmation pending>{t('guidedNat.pc2Pending', { peer })}</Confirmation>}
            {!objectivePassed('nat-before-pc2') && <p>{t('guidedNat.alreadyWorks')}</p>}
            {passed && <p>{rich('guidedNat.investigateRules', {
              router: names.router, command: <TutorialCommand>nft list ruleset</TutorialCommand> })}</p>}</section>
        }
        </>}
      </>}
      {step === 2 && <>
        <h3 data-nat-screen>{natScreen + 1}/3 · {t(correctionScreens[natScreen])}</h3>
        {natScreen === 0 && <section>
          <p>{t('guidedNat.natVsFirewall')}</p>
          <p>{t('guidedNat.nftScenario', names)}</p>
        </section>}
        {natScreen === 1 && <section>
          <p>{t('guidedNat.ruleImagePrompt')}</p>
          <div className="guided-nat-image-actions">
            <GuidedVisualHelp help={natVisualHelp} embedded stableLabel/>
          </div>
        </section>}
        {natScreen === 2 && <><section>
          <p>{rich('guidedNat.editNat', { ...names, peer,
            action: <strong>Inspector → Firewall → {t('natEditor.add')}</strong>, iface: <code className="nat-term-c">eth1</code> })}</p>
          <p>{t('guidedNat.terminalAlternative')}</p>
          <p><TutorialCommand>{'nft add rule ip nat postrouting oifname "eth1" ip saddr 192.168.60.0/24 masquerade'}</TutorialCommand></p>
        </section>
        <section>
          <h4>{t('guidedNat.manualTest')}</h4>
          <p>{t('guidedNat.retryHttp', { url: PROGRESSIVE_NAT_PAT_URL, peer })}</p>
          {result('nat-after-browser', t('guidedNat.pc2HttpPassed'))}
        </section>
        <section>
          <h4>{t('guidedNat.patDemo')}</h4>
          <p>{t('guidedNat.parallelExplanation')}</p>
          <p>{rich('guidedNat.conntrack', { conntrack: <code className="nat-term-c">Conntrack</code>, tracking: <em>Connection Tracking</em> })}</p>
          <p>{rich('guidedNat.watchConntrack', { path: <strong>{names.router} → Firewall → Conntrack</strong>,
            check: <strong>{t('guidedNat.checkPair')}</strong> })}</p>
          {(objectivePassed('nat-after-browser') || objectivePassed('nat-after-pair')) && check('nat-after-pair', t('guidedNat.checkPair'))}
          {result('nat-after-pair', t('guidedNat.bothPassed'))}
          {mappings.length === 2 && <div className="guided-nat-mappings" aria-label={t('guidedNat.mappings')}>{mappings.map(mapping => <p key={mapping}>{mapping}</p>)}</div>}
        </section>
        {progress.complete && <div className="exercise-learning" data-nat-finished><Confirmation>{t('guidedNat.finished')}</Confirmation></div>}
        </>}
      </>}
      {((step === 1 && !reviewInvestigation && hostReady && objectivePassed('nat-before-local')) || (step === 2 && natScreen === 2) || (step === 0 && screen === 1 && !introComplete)) && <details className="exercise-learning" data-nat-hints key={step}><summary>{t('guidedNat.hints')}</summary>
        {natHints(language, step).map((hint, i) => <details key={i} open={i === 0}><summary>{t('guidedNat.hintNumber', { number: i + 1 })}</summary><p>{hint.split('`').map((part, n) => {
          if (n % 2 === 0) return part;
          if (part.startsWith('iptables ')) return <TutorialCommand key={n}>{part}</TutorialCommand>;
          return <code key={n}>{part}</code>;
        })}</p></details>)}
      </details>}
    </div>
    <footer data-nat-nav>
      <button type="button" className="btn" disabled={checking || (step === 0 && screen === 0)} onClick={previous}>{t('guided.previous')}</button>
      {(step < 2 || natScreen < 2) && <button type="button" className="btn btn--primary" data-nat-next disabled={checking || !canAdvance} onClick={next}>{t('guided.next')}</button>}
      {step === 2 && natScreen === 2 && progress.complete && <ExploreNetworkButton onClick={onExplore ?? (() => setCollapsed(true))}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
