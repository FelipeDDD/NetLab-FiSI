import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { ipToString, parseIp } from '../engine/ip';
import { IpDevice } from '../engine/ipdevice';
import { natCapturedFlow, natIntroSignature, natSecondHost, natConfiguration } from '../labs/natLearning';
import { natIntroConcept, PROGRESSIVE_NAT_PAT_URL } from '../labs/progressiveNatPat';
import { useLanguage } from '../i18n';
import { TutorialCommand } from '../tutorials/TutorialCommand';

const captureErrors = {
  'missing-lan': 'Falta o SYN de PC1 no enlace Switch LAN → Router Borda.',
  'missing-wan': 'Falta o SYN traduzido no enlace Router Borda → Servidor Web.',
  unpaired: 'Os SYN capturados não puderam ser associados ao mesmo envio pelo Router.',
};

/** Local presentation for the experimental Lab. Progress uses the Lab's existing receipts. */
export function NatPatActivities() {
  const step = useStore(s => s.labStep), lab = useStore(s => s.lab)!;
  const results = useStore(s => s.labResults), quiz = useStore(s => s.quizAnswers);
  const capture = useStore(s => s.packetCapture), checking = useStore(s => s.labChecking);
  useStore(s => s.nodes);
  const language = useLanguage(s => s.language);
  const [local, setLocal] = useState(''), [external, setExternal] = useState('');
  const [error, setError] = useState('');
  const signature = natIntroSignature(sim.net);
  const configuration = natConfiguration(sim.net);
  const objectivePassed = (id: string) => results[id]?.pass && results['nat-proof-' + id]?.pass && results['nat-proof-' + id]?.detail === configuration;
  const screen = quiz['nat-intro-screen'] ?? 0;
  const state = useStore.getState();
  const confirmed = (id: string) => results[id]?.pass && results[id].detail === signature;
  const captured = confirmed('nat-capture');
  const http = confirmed('nat-first-http');
  const localOk = confirmed('nat-source-local'), externalOk = confirmed('nat-source-external');
  const host = natSecondHost(sim.net, results['nat-host']?.detail);
  const iface = host?.getInterface('eth0');
  const other = iface?.link && (iface.link.a === iface ? iface.link.b : iface.link.a);
  const hostReady = !!host && iface?.up && iface.ip?.addr === parseIp('192.168.60.11') && iface.ip.prefix === 24 &&
    iface.gateway === parseIp('192.168.60.1') && iface.link?.operational && other?.device.id === 'lan';
  useEffect(() => {
    if (step === 0 && capture.status === 'capturing' && capture.linkId === null) state.recordLabResult('nat-capture', true, signature);
  }, [step, capture.status, capture.linkId, signature]);
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
    const flow = natCapturedFlow(capture.records);
    const answer = which === 'local' ? local : external;
    if (typeof flow === 'string') {
      const action = capture.status === 'capturing' && capture.linkId === null
        ? 'Abra a página novamente no PC1.'
        : 'Ative a captura em todos os enlaces e abra a página novamente no PC1.';
      setError(captureErrors[flow] + ' ' + action);
      return;
    }
    if (parseIp(answer.trim()) !== parseIp(flow[which])) { setError('Confira o IPv4 de origem do SYN no enlace indicado.'); return; }
    state.recordLabResult('nat-source-' + which, true, signature);
    setError('');
  }
  function result(id: string, success: string) {
    const r = results[id];
    if (r?.pass && !objectivePassed(id)) return <p role="status">Configuração alterada. Repita esta verificação.</p>;
    return r && <p className={'lab-objective ' + (r.pass ? 'pass' : 'fail')} role="status">{r.pass ? '✓ ' + success : r.detail}</p>;
  }
  function check(id: string, label: string, enabled = true) {
    return <button type="button" className="btn lab-check" data-nat-check={id} disabled={checking || !enabled} onClick={() => state.checkStep(id)}>{checking ? 'Verificando…' : label}</button>;
  }
  const introReady = !!captured && !!http;
  const passed = lab.steps[step].objectives.every(o => objectivePassed(o.id));
  return <>
    <div className="lab-body">
      {step === 0 && <>
        <h3 className="lab-intro-heading">{screen === 0 ? '1/2 · Conceito e captura' : '2/2 · Comparar pacotes'}</h3>
        {screen === 0 ? <>
          {natIntroConcept(language).split('\n').map((line, i) => <section className="lab-nat-activity" key={i}>
            <p>{line.split('`').map((part, n) => n % 2 ? <code key={n}>{part}</code> : part)}</p>
            {i === 1 && captured && <p className="lab-objective pass" role="status">✓ Captura iniciada em todos os enlaces.</p>}
            {i === 2 && http && <p className="lab-objective pass" role="status">✓ PC1 recebeu a página HTTP do servidor externo.</p>}
          </section>)}
        </> : <>
          <p>Abra Pacotes e escolha a visualização completa (Full). Procure o TCP SYN destinado a 198.51.100.80, porta 80.</p>
          <form className="lab-nat-activity" onSubmit={e => { e.preventDefault(); verifySource('local'); }}>
            <p>Observe o SYN no enlace Switch LAN → Router Borda.</p>
            <label htmlFor="nat-source-local">Qual é o IPv4 de origem?</label>
            <div className="lab-nat-answer"><input id="nat-source-local" inputMode="decimal" placeholder="192.168.…" value={local} onChange={e => setLocal(e.target.value)} disabled={!!localOk}/><button className="btn" disabled={!!localOk}>Verificar</button></div>
            {localOk && <p className="lab-objective pass" role="status">✓ Origem local identificada — 192.168.60.10.</p>}
          </form>
          {localOk && <form className="lab-nat-activity" onSubmit={e => { e.preventDefault(); verifySource('external'); }}>
            <p>Observe o SYN do mesmo fluxo no enlace Router Borda → Servidor Web.</p>
            <label htmlFor="nat-source-external">Qual é o IPv4 de origem após a tradução?</label>
            <div className="lab-nat-answer"><input id="nat-source-external" inputMode="decimal" value={external} onChange={e => setExternal(e.target.value)} disabled={!!externalOk}/><button className="btn" disabled={!!externalOk}>Verificar</button></div>
            {externalOk && <p className="lab-objective pass" role="status">✓ Origem externa identificada — 198.51.100.2.</p>}
          </form>}
          {error && <p role="alert">{error}</p>}
          {externalOk && <p>O NAT trocou a origem privada pelo endereço externo do Router. O destino continuou sendo 198.51.100.80. Na volta, a associação permite entregar a resposta ao PC1.</p>}
        </>}
      </>}
      {step === 1 && <>
        <section className="lab-nat-activity"><p>Adicione um Host pelo catálogo, Linux ou Windows. Ele será PC2{host ? ' (' + host.name + ')' : ''}. Configure IPv4 192.168.60.11/24 e Gateway 192.168.60.1 pelo Inspector. Conecte-o a uma porta livre do Switch LAN.</p>
          {hostReady && <p className="lab-objective pass" role="status">✓ PC2 configurado e conectado.</p>}
          {!host && <p>Adicione um único Host para identificá-lo. Se já houver vários, remova os extras antes de continuar.</p>}
        </section>
        {hostReady && <>
          <section className="lab-nat-activity"><p>No terminal de PC2 ({host!.name}), execute <TutorialCommand>ping 192.168.60.10</TutorialCommand> para testar a LAN. A verificação abaixo envia um ping real de PC2 para PC1.</p>
            {check('nat-before-local', 'Verificar comunicação local')}{result('nat-before-local', 'PC2 recebeu a resposta de PC1.')}</section>
          {objectivePassed('nat-before-local') && <>
            <section className="lab-nat-activity"><p>Abra {PROGRESSIVE_NAT_PAT_URL} no navegador de PC1. Confirme que o acesso externo continua funcionando. A verificação usa uma nova conexão HTTP.</p>
              {check('nat-before-pc1', 'Testar acesso de PC1')}{result('nat-before-pc1', 'PC1 recebeu HTTP pela conexão traduzida.')}</section>
            {objectivePassed('nat-before-pc1') && <section className="lab-nat-activity"><p>Agora abra o mesmo endereço em PC2 ({host!.name}). Antes de alterar o Router, reproduza a falha com uma conexão nova.</p>
              {check('nat-before-pc2', 'Testar acesso de PC2')}{result('nat-before-pc2', 'PC2 saiu com a origem privada e não recebeu resposta.')}
              {objectivePassed('nat-before-pc2') && <p>Por que PC1 consegue acesso externo e PC2 não? A comunicação local funciona. Compare a configuração de saída no Router.</p>}</section>}
          </>}
        </>}
      </>}
      {step === 2 && <>
        <section className="lab-nat-activity"><p>Duas conexões simultâneas são possíveis. A regra NAT inicial contempla apenas PC1. Examine a regra no Router Borda, identifique a restrição de origem e ajuste-a para incluir PC2 ({host?.name ?? 'Host associado'}).</p>
          <p>Mantenha os endereços e a comunicação local. A verificação abre duas conexões HTTP novas em paralelo, sem precisar manter dois navegadores abertos.</p>
          {check('nat-after-pair', 'Verificar HTTP dos dois PCs')}{result('nat-after-pair', 'PC1 e PC2 receberam HTTP por conexões traduzidas concorrentes.')}</section>
        <section className="lab-nat-activity"><p>Confirme também a comunicação de PC2 para PC1 na LAN.</p>
          {check('nat-after-local', 'Verificar comunicação local')}{result('nat-after-local', 'Comunicação local preservada.')}</section>
        {objectivePassed('nat-after-pair') && <p>Veja as duas conexões TCP no Conntrack do Router. Elas compartilham o IPv4 externo e usam portas externas distintas. PAT permite distinguir as respostas. Uma porta só precisa mudar quando o mapeamento exige.</p>}
        {mappings.length === 2 && <div className="lab-nat-mappings" aria-label="Mapeamentos TCP atuais no Conntrack">{mappings.map(mapping => <p key={mapping}>{mapping}</p>)}</div>}
        {passed && <p className="lab-step-feedback" role="status">Tutorial concluído! O acesso externo dos dois clientes e a comunicação local foram confirmados.</p>}
      </>}
      {(step > 0 || screen === 1) && <details className="lab-hints" key={step}><summary>Dicas</summary>
        {lab.steps[step].hints?.map((hint, i) => <details key={hint} open={i === 0}><summary>Dica {i + 1}</summary><p>{hint.split('`').map((part, n) => n % 2 ? <TutorialCommand key={n}>{part}</TutorialCommand> : part)}</p></details>)}
      </details>}
    </div>
    <footer className="lab-nat-nav">
      {(step > 0 || screen === 1) && <button className="btn" disabled={checking} onClick={() => step === 0 ? state.answerQuiz('nat-intro-screen', 0) : state.setLabStep(step - 1)}>Voltar</button>}
      {step < 2 && <button className="btn btn--primary" disabled={checking || (step === 0 ? screen === 0 ? !introReady : !localOk || !externalOk : !passed || !hostReady)}
        onClick={() => step === 0 && screen === 0 ? state.answerQuiz('nat-intro-screen', 1) : state.setLabStep(step + 1)}>Próximo</button>}
    </footer>
  </>;
}
