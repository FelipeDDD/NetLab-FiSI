import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { createQuestion, evaluate, solution, type PracticeKind } from './model';
import { usePractice } from './session';
import './practice.css';

export default function PracticePanel() {
  const s=usePractice(), {t}=useTranslation(), heading=useRef<HTMLHeadingElement>(null);
  const [seed,setSeed]=useState(s.question?.recipe.seed??'reference'),[error,setError]=useState(false);
  useEffect(()=>{if(!usePractice.getState().question)usePractice.getState().select(createQuestion('gateway'));heading.current?.focus({preventScroll:true});},[]);
  const q=s.question, attempt=q?s.attempts[q.id]:undefined;
  const labels={yes:t('practice.yes'),no:t('practice.no'),unknown:t('practice.unknown')};
  const states={correct:t('practice.correct'),incorrect:t('practice.incorrect'),missing:t('practice.missing')};
  function load(kind:PracticeKind, nextSeed:string, difficulty=q?.recipe.difficulty??'beginner') {
    if(!nextSeed.trim()||nextSeed.length>256) {setError(true);return;}
    s.select(createQuestion(kind,nextSeed,difficulty));setSeed(nextSeed);setError(false);
  }
  return <section className="practice-panel" role="region" aria-labelledby="practice-heading" data-testid="practice-panel">
    <header><h2 id="practice-heading" tabIndex={-1} ref={heading}>{t('practice.title')}</h2>
      <button type="button" className="btn btn--icon" aria-label={t('practice.close')} onClick={()=>{s.close();document.querySelector<HTMLElement>('.toolbar-menu-trigger')?.focus();}}>×</button></header>
    <div className="practice-body">
      <p className="exercise-note">{t('practice.temporary')}</p>
      <LanguageSelector />
      <p className="exercise-note">{t('practice.contentLanguage')}</p>
      {q&&attempt&&<>
        <div className="practice-controls">
          <label>{t('practice.category')}<select value={q.kind} onChange={e=>{
            const kind=e.target.value as PracticeKind, previous=s.recent[kind];
            if(previous) {s.select(previous);setSeed(previous.recipe.seed!);setError(false);} else load(kind,'reference');
          }}>
            <option value="gateway">E02 · Gateway / CIDR</option><option value="subnet">A · Subnetting</option><option value="vlsm">B · VLSM</option>
          </select></label>
          <label>{t('practice.difficulty')}<select value={q.recipe.difficulty} onChange={e=>load(q.kind,seed,e.target.value as typeof q.recipe.difficulty)}>
            <option value="beginner">{t('practice.beginner')}</option><option value="intermediate">{t('practice.intermediate')}</option><option value="advanced">{t('practice.advanced')}</option>
          </select></label>
        </div>
        <form className="practice-seed" onSubmit={e=>{e.preventDefault();load(q.kind,seed);}}>
          <label>{t('practice.seed')}<input value={seed} maxLength={256} onChange={e=>setSeed(e.target.value)} /></label>
          <button className="btn" type="submit">{t('practice.reproduce')}</button>
          <button className="btn" type="button" onClick={()=>load(q.kind,crypto.randomUUID())}>{t('practice.another')}</button>
        </form>
        {error&&<p role="alert">{t('practice.invalidSeed')}</p>}
        <small className="practice-recipe">{q.recipe.family} · v{q.recipe.version} · {q.recipe.difficulty} · {q.recipe.scenario??'—'} · {q.recipe.seed}</small>
        <h3 lang="de">{q.title}</h3><p lang="de">{q.task}</p>
        <ul className="practice-data" lang="de">{q.data.map(d=><li key={d}>{d}</li>)}</ul>
        <form onSubmit={e=>{e.preventDefault();s.check(evaluate(q,attempt.answers));}} noValidate>
          {q.fields.map(f=>{
            const r=attempt.result?.fields[f.id],inputId=`practice-${f.id}`;
            return <div className="practice-field" key={f.id} data-result={r?.state}>
              <label htmlFor={inputId} lang="de">{f.label}</label>
              {f.type==='choice'?<select id={inputId} value={attempt.answers[f.id]??''} onChange={e=>s.answer(f.id,e.target.value)} aria-describedby={r?inputId+'-feedback':undefined} aria-invalid={r&&r.state!=='correct'}>
                <option value="">{t('practice.choose')}</option>{f.options?.map(o=><option value={o.value} key={o.value}>{labels[o.label]}</option>)}
              </select>:<input id={inputId} value={attempt.answers[f.id]??''} inputMode={f.type==='integer'?'numeric':'text'} autoComplete="off" spellCheck={false} maxLength={80}
                onChange={e=>s.answer(f.id,e.target.value)} aria-describedby={r?inputId+'-feedback':undefined} aria-invalid={r&&r.state!=='correct'} />}
              {r&&<div id={inputId+'-feedback'} className="practice-feedback"><strong>{states[r.state]}</strong>{r.explanation&&<p lang="de">{r.explanation}</p>}</div>}
            </div>;
          })}
          <div className="practice-actions"><button type="submit" className="btn btn--primary">{t('practice.check')}</button>
            <button type="button" className="btn" onClick={s.reveal}>{t('practice.reveal')}</button></div>
          {attempt.result&&<p role="status">{t(attempt.result.pass?'practice.passed':'practice.review')}</p>}
        </form>
        {attempt.revealed&&<section className="practice-solution"><h3>{t('practice.solution')}</h3><p>{t('practice.assisted')}</p>
          <dl>{q.fields.map(f=>{const value=solution(q)[f.id];return <div key={f.id}><dt lang="de">{f.label}</dt><dd>{f.type==='choice'?labels[value as keyof typeof labels]:value}</dd></div>;})}</dl>
          <details><summary>{t('practice.details')}</summary><div lang="de">{[...new Set(Object.values(evaluate(q,solution(q)).fields).map(r=>r.explanation))].map(text=><p key={text}>{text}</p>)}</div></details>
        </section>}
      </>}
    </div>
  </section>;
}
