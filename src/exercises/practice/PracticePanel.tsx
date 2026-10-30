import { useEffect, useId, useRef, useState } from 'react';
import { LANGUAGES, useTranslation } from '../../i18n';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { createQuestion, evaluate, solution, type PracticeKind } from './model';
import { usePractice } from './session';
import { nextQuestion } from './progression';
import { Ipv4Value } from './Ipv4Value';
import { randomPracticeSeed } from './seeds';
import { practiceNextShortcut, PRACTICE_INTERACTIVE } from './shortcuts';
import './practice.css';

export default function PracticePanel() {
  const s=usePractice(), {t,language}=useTranslation(), heading=useRef<HTMLHeadingElement>(null), body=useRef<HTMLDivElement>(null);
  const configId=useId(), [configOpen,setConfigOpen]=useState(false), [centered,setCentered]=useState(false), [nextError,setNextError]=useState(false);
  const [seed,setSeed]=useState(s.question?.recipe.seed??'reference'),[error,setError]=useState(false);
  useEffect(()=>{if(!usePractice.getState().question)usePractice.getState().select(createQuestion('gateway',randomPracticeSeed(),'beginner',2));heading.current?.focus({preventScroll:true});},[]);
  const q=s.question, attempt=q?s.attempts[q.id]:undefined;
  const labels={yes:t('practice.yes'),no:t('practice.no'),unknown:t('practice.unknown')};
  const states={correct:t('practice.correct'),incorrect:t('practice.incorrect'),missing:t('practice.missing')};
  const category={gateway:'E02 · Gateway / CIDR',subnet:'A · Subnetting',vlsm:'B · VLSM'};
  const simpleChoice=q?.fields.length===1&&q.fields[0].type==='choice';
  useEffect(()=>{setNextError(false);if(q)setSeed(q.recipe.seed!);},[q?.id]);
  function load(kind:PracticeKind, nextSeed:string, difficulty=q?.recipe.difficulty??'beginner',version=kind==='gateway'?(q?.kind==='gateway'?q.recipe.version:2):1) {
    if(!nextSeed.trim()||nextSeed.length>256) {setError(true);return;}
    s.select(createQuestion(kind,nextSeed,difficulty,version));setSeed(nextSeed);setError(false);
  }
  function newVariant(advance:boolean) {
    if(!q||(advance&&!attempt?.result))return false;
    try {
      const candidate=nextQuestion(q);
      if(advance)s.advance(candidate);else s.select(candidate);
      setSeed(candidate.recipe.seed!);setError(false);setNextError(false);
      body.current?.scrollTo({top:0});heading.current?.focus({preventScroll:true});
      return true;
    }catch {setNextError(true);return false;}
  }
  return <section className={`practice-panel${centered?' is-centered':''}`} role="region" aria-labelledby="practice-heading" data-testid="practice-panel" onKeyDown={e=>{
    const modal=Array.from(document.querySelectorAll('dialog[open],[aria-modal="true"],[role="dialog"]')).some(el=>el.getClientRects().length>0);
    if(practiceNextShortcut(e.nativeEvent,!!attempt?.result,modal||!!(e.target as HTMLElement).closest(PRACTICE_INTERACTIVE))&&newVariant(true)) {
      e.preventDefault();e.stopPropagation();
    }
  }}>
    <header><h2 id="practice-heading" tabIndex={-1} ref={heading}>{t('practice.title')}</h2>
      <div className="practice-header-actions">
        <button type="button" className="btn btn--icon practice-position" aria-pressed={centered} aria-label={t(centered?'practice.moveSide':'practice.moveCenter')} title={t(centered?'practice.moveSide':'practice.moveCenter')} onClick={()=>setCentered(v=>!v)}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><rect x={centered?6:4} y="6" width="6" height="8" rx="1" fill="currentColor" fillOpacity=".18"/></svg>
        </button>
        <button type="button" className="btn btn--icon practice-close" aria-label={t('practice.close')} onClick={()=>{s.close();document.querySelector<HTMLElement>('.toolbar-menu-trigger')?.focus();}}>×</button>
      </div></header>
    <div className="practice-body" ref={body}>
      {q&&attempt&&<>
        <section className="practice-configuration" aria-label={t('practice.configuration')}>
          <div className="practice-config-summary">
            <div className="practice-summary-values"><strong>{category[q.kind]}{q.kind==='gateway'?` · v${q.recipe.version}`:''}</strong><span>{t(`practice.${q.recipe.difficulty}`)} · {LANGUAGES[language]}</span>
              <span className="practice-summary-seed" title={q.recipe.seed}>{t('practice.seed')}: <code>{q.recipe.seed}</code></span></div>
            <button type="button" className="btn btn--small practice-config-toggle" aria-expanded={configOpen} aria-controls={configId} onClick={()=>setConfigOpen(v=>!v)}>{t('practice.configure')}</button>
          </div>
          <div id={configId} hidden={!configOpen} className="practice-config-fields">
        <LanguageSelector />
        <div className="practice-controls">
          <label>{t('practice.category')}<select value={q.kind} onChange={e=>{
            const kind=e.target.value as PracticeKind, previous=s.recent[kind];
            if(previous) {s.select(previous);setSeed(previous.recipe.seed!);setError(false);} else load(kind,kind==='gateway'?randomPracticeSeed():'reference');
          }}>
            <option value="gateway">E02 · Gateway / CIDR</option><option value="subnet">A · Subnetting</option><option value="vlsm">B · VLSM</option>
          </select></label>
          <label>{t('practice.difficulty')}<select value={q.recipe.difficulty} onChange={e=>load(q.kind,seed,e.target.value as typeof q.recipe.difficulty)}>
            <option value="beginner">{t('practice.beginner')}</option><option value="intermediate">{t('practice.intermediate')}</option><option value="advanced">{t('practice.advanced')}</option>
          </select></label>
        </div>
        {q.kind==='gateway'&&<label>{t('practice.version')}<select className="practice-version" value={q.recipe.version} onChange={e=>load(q.kind,seed,q.recipe.difficulty,Number(e.target.value))}>
          <option value="2">{t('practice.version2')}</option><option value="1">{t('practice.version1')}</option>
        </select></label>}
        <form className="practice-seed" onSubmit={e=>{e.preventDefault();load(q.kind,seed);}}>
          <label>{t('practice.seed')}<input value={seed} maxLength={256} onChange={e=>setSeed(e.target.value)} /></label>
          <button className="btn" type="submit">{t('practice.reproduce')}</button>
          <button className="btn" type="button" onClick={()=>newVariant(false)}>{t('practice.another')}</button>
        </form>
        {error&&<p role="alert">{t('practice.invalidSeed')}</p>}
        <small className="practice-recipe">{q.recipe.family} · v{q.recipe.version} · {q.recipe.difficulty} · {q.recipe.scenario??'—'} · {q.recipe.seed}</small>
        </div></section>
        <div className="practice-question" lang="de"><h3>{q.title}</h3><p>{q.problem.family==='gateway-v2'?q.problem.mode==='membership'?<>Liegt die Gateway-Adresse <em>rechnerisch</em> im Subnetz des PCs?</>:<>Ist das Gateway vom PC aus <em>tatsächlich erreichbar</em>?</>:q.task}</p></div>
        <dl className="practice-data" lang="de">{q.data.map(d=>{
          const colon=d.indexOf(':');
          return <div key={d}><dt>{colon<0?d:d.slice(0,colon)}</dt><dd><Ipv4Value value={colon<0?'':d.slice(colon+1).trim()} /></dd></div>;
        })}</dl>
        <p className="practice-content-note">{t('practice.contentLanguage')}</p>
        <form className="practice-answer-form" aria-label={t('practice.answers')} onSubmit={e=>{e.preventDefault();s.check(evaluate(q,attempt.answers));heading.current?.focus({preventScroll:true});}} noValidate>
          {q.fields.map(f=>{
            const r=attempt.result?.fields[f.id],inputId=`practice-${f.id}`;
            const correctChoice=f.type==='choice'&&r?.state==='incorrect'?solution(q)[f.id]:undefined;
            return <div className="practice-field" key={f.id} data-result={r?.state}>
              {f.type==='choice'?<fieldset id={inputId} className="practice-choice" aria-describedby={r?inputId+'-feedback':undefined} aria-invalid={r&&r.state!=='correct'}>
                <legend lang="de">{f.label}</legend><div className="practice-choice-options">
                {f.options?.map(o=>{
                  const choiceResult=correctChoice===undefined?undefined:o.value===correctChoice?'correct':attempt.answers[f.id]===o.value?'incorrect':undefined;
                  return <label className="btn" key={o.value} data-choice-result={choiceResult}>
                  <input type="radio" name={inputId} value={o.value} checked={attempt.answers[f.id]===o.value} onChange={()=>s.answer(f.id,o.value)} />
                  <span>{labels[o.label]}</span>
                  {choiceResult&&<span className="practice-choice-verdict"><span aria-hidden="true">{choiceResult==='correct'?'✓':'✕'}</span> {states[choiceResult]}</span>}
                </label>;})}</div>
              </fieldset>:<><label htmlFor={inputId} lang="de">{f.label}</label><input id={inputId} value={attempt.answers[f.id]??''} inputMode={f.type==='integer'?'numeric':'text'} autoComplete="off" spellCheck={false} maxLength={80}
                onChange={e=>s.answer(f.id,e.target.value)} aria-describedby={r?inputId+'-feedback':undefined} aria-invalid={r&&r.state!=='correct'} /></>}
              {r&&<div id={inputId+'-feedback'} className="practice-feedback"><strong>{states[r.state]}</strong>{r.explanation&&<p lang="de">{r.explanation}</p>}</div>}
            </div>;
          })}
          <div className="practice-actions"><button type="submit" className="btn btn--primary">{t('practice.check')}</button>
            {!simpleChoice&&<button type="button" className="btn" onClick={s.reveal}>{t('practice.reveal')}</button>}</div>
          {attempt.result&&<p role="status" className="practice-result-summary">{t(attempt.result.pass?'practice.passed':'practice.review')}</p>}
        </form>
        {!simpleChoice&&attempt.revealed&&<section className="practice-solution"><h3>{t('practice.solution')}</h3><p>{t('practice.assisted')}</p>
          <dl>{q.fields.map(f=>{const value=solution(q)[f.id];return <div key={f.id}><dt lang="de">{f.label}</dt><dd>{f.type==='choice'?labels[value as keyof typeof labels]:value}</dd></div>;})}</dl>
          <details><summary>{t('practice.details')}</summary><div lang="de">{[...new Set(Object.values(evaluate(q,solution(q)).fields).map(r=>r.explanation))].map(text=><p key={text}>{text}</p>)}</div></details>
        </section>}
      </>}
    </div>
    <footer className="practice-footer">
      <small>{t('practice.temporary')}</small>
      {attempt?.result&&<button type="button" className="btn btn--primary practice-next" onClick={()=>newVariant(true)}>{t('practice.next')} <span aria-hidden="true">→</span></button>}
      {nextError&&<p role="alert">{t('practice.nextError')}</p>}
    </footer>
  </section>;
}
