import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { ipToString, parseIp } from '../engine/ip';
import { IpDevice } from '../engine/ipdevice';
import { natCapturedFlow, natIntroSignature, natSecondHost, natConfiguration, natHostReady, natIntroComplete, natInvestigationComplete } from '../labs/natLearning';
import { natIntroConcept, PROGRESSIVE_NAT_PAT_URL } from '../labs/progressiveNatPat';
import { useTranslation } from '../i18n';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { ChapterStepProgress, ExploreNetworkButton } from './CompletionUI';
import { TutorialCommand } from './TutorialCommand';
import { GuidedVisualHelp } from './GuidedVisualHelp';
import type { TutorialVisualHelp } from './tutorialVisualHelp';

const natImage = new URL('../assets/nat-rule-pt-BR.svg', import.meta.url).href;
const natVisualHelp: TutorialVisualHelp = { title: 'guidedVisual.title', description: 'guidedVisual.description', images: { de: natImage, en: natImage, 'pt-BR': natImage } };

const captureErrors = {
  'missing-lan': 'Falta o SYN de PC1 no enlace Switch LAN → Router Borda.',
  'missing-wan': 'Falta o SYN traduzido no enlace Router Borda → Servidor Web.',
  unpaired: 'Os SYN capturados não puderam ser associados ao mesmo envio pelo Router.',
};

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
  const [collapsed, setCollapsed] = useState(false);
  const [local, setLocal] = useState('192.168.'), [external, setExternal] = useState('');
  const [error, setError] = useState('');
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
    ? captureActive ? 'Abra novamente a página no PC1 para registrar os dois SYN.'
      : capture.status === 'paused' && capture.linkId === null
        ? 'Em Pacotes, retome a captura em todos os enlaces e abra novamente a página no PC1.'
        : 'Em Pacotes, inicie uma nova captura em todos os enlaces e abra novamente a página no PC1.'
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
    if (parseIp(answer.trim()) !== parseIp(comparison[which])) { setError('Confira o IPv4 de origem do SYN no enlace indicado.'); return; }
    state.recordLabResult('nat-source-' + which, true, signature);
    setError('');
  }
  function result(id: string, success: string) {
    const r = results[id];
    if (r?.pass && !objectivePassed(id)) return <p role="status">Configuração alterada. Repita esta verificação.</p>;
    return r && (r.pass ? <Confirmation>{success}</Confirmation> : <p role="status">{r.detail}</p>);
  }
  function check(id: string, label: string) {
    return <button type="button" className="btn" data-nat-check={id} disabled={checking} onClick={() => state.checkStep(id)}>{checking ? 'Verificando…' : label}</button>;
  }
  const introReady = introComplete || !!captured && !!http;
  const passed = lab.steps[step].objectives.every(o => objectivePassed(o.id));
  const reviewInvestigation = investigationComplete && (!passed || !hostReady);
  const objectives = lab.steps.flatMap(s => s.objectives);
  const completed = objectives.filter(o => {
    if (o.id === 'nat-first-http') return introComplete || http;
    if (o.id.startsWith('nat-before-') && investigationComplete) return true;
    return objectivePassed(o.id);
  }).length;
  const complete = completed === objectives.length;
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
    <div className="exercise-heading"><strong>{lab.title}</strong>
      <ChapterStepProgress step={step + 1} total={lab.steps.length} progress={{ completed, total: objectives.length, complete }}/>
    </div>
    <button type="button" className="btn btn--icon" aria-label={t(collapsed ? 'exercises.expand' : 'exercises.collapse')}
      aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '+' : '−'}</button>
  </>}>
    {!collapsed && <><div className="exercise-body" key={`${step}:${screen}:${natScreen}`} data-nat-body
      data-nat-packet-demo={step === 0 && screen === 0 && !http || undefined}>
      {step === 0 && <>
        <h3 data-nat-screen>{screen === 0 ? '1/2 · Conceito e captura' : '2/2 · Comparar pacotes'}</h3>
        {screen === 0 ? introComplete && !http ? <>
          <Confirmation>Captura e acesso HTTP já comprovados na configuração original.</Confirmation>
          {captureActive && <Confirmation>Captura ativa em todos os enlaces.</Confirmation>}
        </> : <>
          {natIntroConcept(language).split('\n').map((line, i) => <section key={i}>
            <p>{line.split('`').map((part, n) => n % 2 ? <code key={n}>{part}</code> : part)}</p>
            {i === 1 && captureActive && <Confirmation>Captura ativa em todos os enlaces.</Confirmation>}
            {i === 2 && http && <Confirmation>PC1 recebeu a página HTTP do servidor externo.</Confirmation>}
          </section>)}
        </> : <>
          {introComplete ? <p>Comparação dos SYN registrada na configuração original. Para repetir o experimento, restaure a regra inicial ou inicie uma nova tentativa.</p> :
            <p>Abra Pacotes e escolha a visualização completa (Full). Procure o <code className="nat-term-a">TCP SYN</code> destinado a <code className="nat-term-a">198.51.100.80</code>, porta <code className="nat-term-a">80</code>.</p>}
          {typeof comparison === 'string' && <p role="status">{captureErrors[comparison]} {captureRecovery}</p>}
          <form onSubmit={e => { e.preventDefault(); verifySource('local'); }}>
            <p>Observe o SYN no enlace Switch LAN → Router Borda.</p>
            <label htmlFor="nat-source-local">Qual é o IPv4 de origem?</label>
            <div className="guided-subnet-answer"><input id="nat-source-local" inputMode="decimal" value={local} onChange={e => setLocal(e.target.value)} disabled={!!localOk}/><button className="btn" disabled={!!localOk}>Verificar</button></div>
            {localOk && <Confirmation>Origem local identificada — 192.168.60.10.</Confirmation>}
          </form>
          {localOk && <form onSubmit={e => { e.preventDefault(); verifySource('external'); }}>
            <p>Observe o SYN do mesmo fluxo no enlace Router Borda → Servidor Web.</p>
            <label htmlFor="nat-source-external">Qual é o IPv4 de origem após a tradução?</label>
            <div className="guided-subnet-answer"><input id="nat-source-external" inputMode="decimal" value={external} onChange={e => setExternal(e.target.value)} disabled={!!externalOk}/><button className="btn" disabled={!!externalOk}>Verificar</button></div>
            {externalOk && <Confirmation>Origem externa identificada — 198.51.100.2.</Confirmation>}
          </form>}
          {error && comparison && typeof comparison !== 'string' && <p role="alert">{error}</p>}
          {externalOk && <p>O NAT trocou a origem privada pelo endereço externo do Router. O destino continuou sendo 198.51.100.80. Na volta, a associação permite entregar a resposta ao PC1.</p>}
        </>}
      </>}
      {step === 1 && <>
        <h3>{lab.steps[step].title}</h3>
        {reviewInvestigation ? <section>
          <Confirmation>Na configuração original, os PCs trocaram Echo Reply, PC1 recebeu HTTP por NAT e PC2 saiu sem tradução e ficou sem resposta.</Confirmation>
          <p>Esse resultado foi registrado antes da alteração da rede. Para repetir a comparação, restaure a regra NAT inicial ou inicie uma nova tentativa.</p>
        </section> : <>
        <section><p>Adicione outro Host à rede. Ele será {peer}. Conecte-o ao Switch LAN, configure IPv4 <code className="nat-term-c">192.168.60.11/24</code> e gateway <code className="nat-term-c">192.168.60.1</code> e confirme a conexão com um <code className="nat-term-b">PING</code> entre {peer} e PC1.</p>
          {hostReady && <Confirmation>PC2 configurado e conectado.</Confirmation>}
          {!host && <p>Adicione um único Host para identificá-lo. Se já houver vários, remova os extras antes de continuar.</p>}
          {host && !hostReady && <Confirmation pending>Pendente: conexão, IPv4 ou gateway de PC2.</Confirmation>}
          {hostReady && (result('nat-before-local', 'Echo Reply recebido entre os dois PCs.') ??
            <Confirmation pending>Pendente: Echo Reply entre os dois PCs.</Confirmation>)}
        </section>
        {hostReady && objectivePassed('nat-before-local') &&
          <section data-nat-http-comparison><p>Abra {PROGRESSIVE_NAT_PAT_URL} no navegador de PC1 e depois no de {peer}, antes de alterar o Router.</p>
            {result('nat-before-pc1', 'PC1 recebeu HTTP pela conexão traduzida.')}
            {result('nat-before-pc2', 'PC2 saiu com a origem privada e não recebeu resposta.')}
            {!results['nat-before-pc1'] && <Confirmation pending>Pendente: acesso pelo navegador de PC1.</Confirmation>}
            {!results['nat-before-pc2'] && <Confirmation pending>Pendente: tentativa pelo navegador de {peer}.</Confirmation>}
            {!objectivePassed('nat-before-pc2') && <p>Se PC2 já recebe HTTP, falta observar a falha inicial. Restaure a regra NAT que cobre apenas PC1 ou inicie uma nova tentativa.</p>}
            {passed && <p>Por que só PC1 tem acesso externo? No terminal do Router Borda, consulte as regras NAT com <TutorialCommand>nft list ruleset</TutorialCommand>. Por enquanto, apenas investigue: não altere a configuração. A próxima etapa usará essa observação.</p>}</section>
        }
        </>}
      </>}
      {step === 2 && <>
        <h3 data-nat-screen>{natScreen + 1}/3 · {['NAT e Firewall', 'A regra inicial', 'Sua vez'][natScreen]}</h3>
        {natScreen === 0 && <section>
          <p>NAT traduz endereços e, em alguns casos, portas. A filtragem de Firewall decide se o tráfego é permitido. Routers e Firewalls podem executar NAT, conforme o equipamento.</p>
          <p>Neste cenário, usamos nftables no Router Borda.</p>
        </section>}
        {natScreen === 1 && <section>
          <p>Abra a imagem para ver como a regra inicial seleciona o tráfego de PC1.</p>
          <div className="guided-nat-image-actions">
            <GuidedVisualHelp help={natVisualHelp} title="Regra NAT inicial" embedded stableLabel/>
          </div>
        </section>}
        {natScreen === 2 && <><section>
          <p>Selecione o Router Borda e vá a <strong>Inspector → Firewall → Adicionar regra NAT</strong>. Escolha a saída <code className="nat-term-c">eth1</code> e uma origem que inclua {peer}. Você pode manter a regra de PC1.</p>
          <p>Se preferir o terminal Linux do Router, este comando cobre toda a LAN. O Inspector mostra o comando correspondente aos campos que você preencher.</p>
          <p><TutorialCommand>{'nft add rule ip nat postrouting oifname "eth1" ip saddr 192.168.60.0/24 masquerade'}</TutorialCommand></p>
        </section>
        <section>
          <h4>Teste manual</h4>
          <p>Abra novamente {PROGRESSIVE_NAT_PAT_URL} no navegador de {peer}. Agora que a regra NAT foi corrigida, o acesso deve funcionar.</p>
          {result('nat-after-browser', 'PC2 recebeu a página por uma nova conexão traduzida.')}
        </section>
        <section>
          <h4>Demonstração de PAT</h4>
          <p>A demonstração abre duas conexões HTTP ao mesmo tempo para mostrar como PC1 e PC2 compartilham o IPv4 externo do Router.</p>
          <p><code className="nat-term-c">Conntrack</code> significa <em>Connection Tracking</em> (rastreamento de conexões). Ele associa cada resposta à conexão certa. PC1 e PC2 usam portas externas distintas quando precisam compartilhar o mesmo IP e acessar o mesmo destino.</p>
          <p>Abra <strong>Router Borda → Firewall → Conntrack</strong> no Inspector. Observe a tabela enquanto executa <strong>Verificar HTTP dos dois PCs</strong>.</p>
          {(objectivePassed('nat-after-browser') || objectivePassed('nat-after-pair')) && check('nat-after-pair', 'Verificar HTTP dos dois PCs')}
          {result('nat-after-pair', 'PC1 e PC2 receberam HTTP por conexões traduzidas concorrentes.')}
          {mappings.length === 2 && <div className="guided-nat-mappings" aria-label="Mapeamentos TCP atuais no Conntrack">{mappings.map(mapping => <p key={mapping}>{mapping}</p>)}</div>}
        </section>
        {passed && <div className="exercise-learning" data-nat-finished><Confirmation>Tutorial concluído! PC1 e PC2 acessaram o servidor externo ao mesmo tempo por conexões traduzidas.</Confirmation></div>}
        </>}
      </>}
      {((step === 1 && !reviewInvestigation && hostReady && objectivePassed('nat-before-local')) || (step === 2 && natScreen === 2) || (step === 0 && screen === 1 && !introComplete)) && <details className="exercise-learning" data-nat-hints key={step}><summary>Dicas</summary>
        {lab.steps[step].hints?.map((hint, i) => <details key={hint} open={i === 0}><summary>Dica {i + 1}</summary><p>{hint.split('`').map((part, n) => {
          if (n % 2 === 0) return part;
          if (part.startsWith('iptables ')) return <TutorialCommand key={n}>{part}</TutorialCommand>;
          return <code key={n}>{part}</code>;
        })}</p></details>)}
      </details>}
    </div>
    <footer data-nat-nav>
      <button type="button" className="btn" disabled={checking || (step === 0 && screen === 0)} onClick={previous}>{t('guided.previous')}</button>
      {(step < 2 || natScreen < 2) && <button type="button" className="btn btn--primary" data-nat-next disabled={checking || !canAdvance} onClick={next}>{t('guided.next')}</button>}
      {step === 2 && natScreen === 2 && passed && <ExploreNetworkButton onClick={onExplore ?? (() => setCollapsed(true))}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
