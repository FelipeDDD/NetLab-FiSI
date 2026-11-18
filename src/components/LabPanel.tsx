import { Fragment, useState } from 'react';
import { useStore } from '../store';
import { PROGRESSIVE_NAT_PAT_ID, PROGRESSIVE_NAT_PAT_URL } from '../labs/progressiveNatPat';

// Renders `backtick` spans as inline code.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, li) => (
        <p key={li} className="lab-line">
          {line.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))}
        </p>
      ))}
    </>
  );
}

export function LabPanel() {
  const lab = useStore((s) => s.lab);
  const stepIdx = useStore((s) => s.labStep);
  const results = useStore((s) => s.labResults);
  const checking = useStore((s) => s.labChecking);
  const quizAnswers = useStore((s) => s.quizAnswers);
  const setLabStep = useStore((s) => s.setLabStep);
  const answerQuiz = useStore((s) => s.answerQuiz);
  const checkStep = useStore((s) => s.checkStep);
  const exportAttempt = useStore((s) => s.exportAttempt);
  const closeLab = useStore((s) => s.closeLab);
  const [collapsed, setCollapsed] = useState(false);

  if (!lab) return null;
  const step = lab.steps[stepIdx];
  const allObjectives = lab.steps.flatMap((s) => s.objectives);
  const passed = allObjectives.filter((o) => results[o.id]?.pass).length;
  const progressive = lab.id === PROGRESSIVE_NAT_PAT_ID;
  const stepPassed = !checking && step.objectives.every(o => results[o.id]?.pass);
  const lastStep = stepIdx === lab.steps.length - 1;

  if (collapsed) {
    return (
      <button className="lab-pill" onClick={() => setCollapsed(false)}>
        {lab.title} · {passed}/{allObjectives.length} ▸
      </button>
    );
  }

  return (
    <div className="lab-panel" data-progressive-nat={progressive || undefined}>
      <div className="lab-head">
        <div className="lab-title">{lab.title}</div>
        <button className="tab-close" title={progressive ? 'Recolher' : 'Collapse'} onClick={() => setCollapsed(true)}>
          –
        </button>
        <button className="tab-close" title={progressive ? 'Fechar tutorial (mantém a topologia)' : 'Close lab (keeps the topology)'} onClick={() => closeLab()}>
          ×
        </button>
      </div>

      <div className="lab-progress">
        <div className="lab-progress-bar">
          <div
            className="lab-progress-fill"
            style={{ width: `${allObjectives.length ? (passed / allObjectives.length) * 100 : 0}%` }}
          />
        </div>
        <span>
          {passed}/{allObjectives.length} {progressive ? 'objetivos' : 'objectives'}
        </span>
      </div>

      <div className="lab-stepnav">
        <button className="btn" aria-label={progressive ? 'Voltar' : 'Previous step'}
          disabled={stepIdx === 0 || (progressive && checking)} onClick={() => setLabStep(stepIdx - 1)}>
          ‹
        </button>
        <span>
          {progressive ? `Etapa ${stepIdx + 1}/${lab.steps.length} · ` : `Step ${stepIdx + 1} of ${lab.steps.length}: `}<strong>{step.title}</strong>
        </span>
        <button
          className="btn"
          aria-label={progressive ? 'Avançar' : 'Next step'}
          disabled={lastStep || (progressive && !stepPassed)}
          onClick={() => setLabStep(stepIdx + 1)}
        >
          ›
        </button>
      </div>

      <div className="lab-body">
        <Rich text={progressive ? step.body.replaceAll('`' + PROGRESSIVE_NAT_PAT_URL + '`', PROGRESSIVE_NAT_PAT_URL) : step.body} />
        {step.hints?.length ? <details key={lab.id + ':' + stepIdx} className="lab-hints">
          <summary>Dicas</summary>
          {step.hints.map((hint, index) => <details key={hint} open={progressive && index === 0}>
            <summary>Dica {index + 1}</summary>
            <Rich text={hint} />
          </details>)}
        </details> : null}
      </div>

      {step.objectives.length > 0 && (
        <div className="lab-objectives">
          {step.objectives.map((o) => {
            const r = results[o.id];
            const state = r === undefined ? 'todo' : r.pass ? 'pass' : 'fail';
            return (
              <div key={o.id} className={`lab-objective ${state}`}>
                <span className="lab-obj-mark">{state === 'pass' ? '✓' : state === 'fail' ? '✗' : '○'}</span>
                <span>
                  {o.label}
                  {r && !r.pass && <span className="lab-obj-detail"> — {r.detail}</span>}
                </span>
              </div>
            );
          })}
          {(!progressive || !stepPassed || lastStep) &&
            <button className="btn lab-check" disabled={checking} onClick={() => checkStep()}>
              {progressive ? (checking ? 'Verificando…' : 'Verificar objetivos') : (checking ? 'Checking (watch the packets)…' : 'Check objectives')}
            </button>}
          {step.feedback && stepPassed && <div className="lab-step-feedback" role="status"><Rich text={step.feedback} /></div>}
        </div>
      )}

      {step.quiz?.map((q, qi) => {
        const qid = `${lab.id}-${stepIdx}-${qi}`;
        const chosen = quizAnswers[qid];
        return (
          <div key={qid} className="lab-quiz">
            <div className="lab-quiz-q">{q.q}</div>
            {q.options.map((opt, oi) => {
              const isChosen = chosen === oi;
              const cls = isChosen ? (oi === q.answer ? 'correct' : 'wrong') : '';
              return (
                <label key={oi} className={`lab-quiz-opt ${cls}`}>
                  <input
                    type="radio"
                    name={qid}
                    checked={isChosen}
                    onChange={() => answerQuiz(qid, oi)}
                  />
                  {opt}
                </label>
              );
            })}
            {chosen !== undefined && (
              <div className={`lab-quiz-verdict ${chosen === q.answer ? 'correct' : 'wrong'}`}>
                {chosen === q.answer ? 'Correct.' : 'Not quite — try again.'}
              </div>
            )}
          </div>
        );
      })}

      <div className="lab-footer">
        <button className="btn" onClick={() => exportAttempt()}>
          {progressive ? 'Exportar tentativa' : 'Export attempt for submission'}
        </button>
      </div>
    </div>
  );
}
