import { useEffect, useId, useRef, useState } from 'react';
import { LANGUAGES, useTranslation } from '../../i18n';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { createQuestion, evaluate, solution, type PracticeKind } from './model';
import { usePractice } from './session';
import { nextQuestion } from './progression';
import { Ipv4Value } from './Ipv4Value';
import { ChoiceField } from './ChoiceField';
import { randomPracticeSeed } from './seeds';
import { practiceNextShortcut, PRACTICE_INTERACTIVE } from './shortcuts';
import { presentationV3 } from '../diagnosis/presentationV3';
import { nd02Text } from '../diagnosis/nd02Messages';
import { completeMaskOctet } from './maskInput';
import './practice.css';

export default function PracticePanel() {
  const s=usePractice(), {t,language}=useTranslation(), heading=useRef<HTMLHeadingElement>(null), body=useRef<HTMLDivElement>(null);
  const configId=useId(), [configOpen,setConfigOpen]=useState(false), [centered,setCentered]=useState(false), [nextError,setNextError]=useState(false);
  const [seed,setSeed]=useState(s.question?.recipe.seed??'reference'),[error,setError]=useState(false);
  useEffect(()=>{if(!usePractice.getState().question)usePractice.getState().select(createQuestion('gateway',randomPracticeSeed(),'beginner',2));heading.current?.focus({preventScroll:true});},[]);
  const q=s.question, attempt=q?s.attempts[q.id]:undefined;
  const boundary=q?.problem.family==='nd02-v3'?q.problem.generated:undefined;
  const localized=boundary?presentationV3(boundary,language):undefined;
  const contentLanguage=boundary?language:'de';
  const corrected=!!attempt?.result&&attempt.result.complete!==false;
  const w=(key:Parameters<typeof nd02Text>[1])=>nd02Text(language,key);
  const labels={yes:t('practice.yes'),no:t('practice.no'),unknown:t('practice.unknown')};
  const states={correct:t('practice.correct'),incorrect:t('practice.incorrect'),missing:t('practice.missing')};
  const category={gateway:'E02 · Gateway / CIDR',subnet:'A · Subnetting',vlsm:'B · VLSM',boundaries:w('category')+' · ND02 v3'};
  const simpleChoice=q?.fields.length===1&&q.fields[0].type==='choice';
  useEffect(()=>{setNextError(false);if(q)setSeed(q.recipe.seed!);},[q?.id]);
  function load(kind:PracticeKind, nextSeed:string, difficulty=q?.recipe.difficulty??'beginner',version=kind==='gateway'?(q?.kind==='gateway'?q.recipe.version:2):kind==='boundaries'?3:1) {
    if(!nextSeed.trim()||nextSeed.length>256) {setError(true);return;}
    s.select(createQuestion(kind,nextSeed,difficulty,version));setSeed(nextSeed);setError(false);
  }
  function newVariant(advance:boolean) {
    if(!q||(advance&&!corrected))return false;
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
    if(practiceNextShortcut(e.nativeEvent,corrected,modal||!!(e.target as HTMLElement).closest(PRACTICE_INTERACTIVE))&&newVariant(true)) {
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
            <div className="practice-summary-values"><strong>{category[q.kind]}{q.kind==='gateway'?` · v${q.recipe.version}`:''}</strong><span>{t(`practice.${q.recipe.difficulty}`)}{!boundary&&<> · {LANGUAGES[language]}</>}</span>
              {!boundary&&<span className="practice-summary-seed" title={q.recipe.seed}>{t('practice.seed')}: <code>{q.recipe.seed}</code></span>}</div>
            <button type="button" className="btn btn--small practice-config-toggle" aria-expanded={configOpen} aria-controls={configId} onClick={()=>setConfigOpen(v=>!v)}>{t('practice.configure')}</button>
          </div>
          <div id={configId} hidden={!configOpen} className="practice-config-fields">
        <LanguageSelector />
        <div className="practice-controls">
          <label>{t('practice.category')}<select value={q.kind} onChange={e=>{
            const kind=e.target.value as PracticeKind, previous=s.recent[kind];
            if(previous) {s.select(previous);setSeed(previous.recipe.seed!);setError(false);} else load(kind,kind==='gateway'||kind==='boundaries'?randomPracticeSeed():'reference');
          }}>
            <option value="gateway">E02 · Gateway / CIDR</option><option value="subnet">A · Subnetting</option><option value="vlsm">B · VLSM</option><option value="boundaries">{category.boundaries}</option>
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
        {!boundary&&<small className="practice-recipe">{q.recipe.family} · v{q.recipe.version} · {q.recipe.difficulty}{q.recipe.family!=='diagnosis'&&<> · {q.recipe.scenario??'—'}</>} · {q.recipe.seed}</small>}
        </div></section>
        <div className="practice-question" lang={contentLanguage}><h3>{localized?.title??q.title}</h3>{!boundary&&<p>{q.problem.family==='gateway-v2'?q.problem.mode==='membership'?<>Liegt die Gateway-Adresse <em>rechnerisch</em> im Subnetz des PCs?</>:<>Ist das Gateway vom PC aus <em>tatsächlich erreichbar</em>?</>:q.task}</p>}</div>
        <dl className="practice-data" lang={contentLanguage}>{q.data.map(d=>{
          const colon=d.indexOf(':');
          return <div key={d}><dt>{colon<0?d:d.slice(0,colon)}</dt><dd><Ipv4Value value={colon<0?'':d.slice(colon+1).trim()} /></dd></div>;
        })}</dl>
        {!boundary&&<p className="practice-content-note">{t('practice.contentLanguage')}</p>}
        <form className="practice-answer-form" aria-label={t('practice.answers')} onSubmit={e=>{e.preventDefault();const result=evaluate(q,attempt.answers);s.check(result);if(result.complete===false)document.querySelector<HTMLInputElement>(`#practice-${Object.keys(result.fields)[0]} input, input#practice-${Object.keys(result.fields)[0]}`)?.focus();else heading.current?.focus({preventScroll:true});}} noValidate>
          {q.fields.map(f=>{
            const r=attempt.result?.fields[f.id],inputId=`practice-${f.id}`;
            const prompt=localized?.prompts[f.id]??f.label;
            const questionText=localized&&f.id==='membership'?<>{prompt.split(localized.emphasis)[0]}<u>{localized.emphasis}</u>{prompt.split(localized.emphasis)[1]}</>:prompt;
            const correctChoice=f.type==='choice'&&(boundary?corrected:r?.state==='incorrect')?solution(q)[f.id]:undefined;
            return <div className="practice-field" key={f.id} data-result={r?.state}>
              {f.type==='choice'?<ChoiceField id={inputId} language={contentLanguage} prompt={questionText} options={f.options??[]} value={attempt.answers[f.id]} onChange={value=>s.answer(f.id,value)} labels={labels} states={states} result={r?.state} correctChoice={correctChoice} />:<><label htmlFor={inputId} lang={contentLanguage}>{prompt}</label><input id={inputId} value={attempt.answers[f.id]??''} inputMode={f.type==='integer'?'numeric':boundary?'decimal':'text'} autoComplete="off" spellCheck={false} maxLength={80}
                onFocus={e=>{if(boundary&&e.target.value==='255.255.')e.target.setSelectionRange(8,8);}}
                onChange={e=>{
                  const previous=attempt.answers[f.id]??'',input=e.currentTarget;
                  const value=boundary?completeMaskOctet(previous,input.value,input.selectionStart,(e.nativeEvent as InputEvent).inputType):input.value;
                  if(value!==input.value)input.value=value;
                  if(!boundary||value!==previous)s.answer(f.id,value);
                }} aria-describedby={r?inputId+'-feedback':undefined} aria-invalid={r&&r.state!=='correct'} /></>}
              {r&&<div id={inputId+'-feedback'} className="practice-feedback"><strong>{boundary&&r.state==='missing'&&f.type==='mask'?w('maskMissing'):states[r.state]}</strong>{corrected&&boundary&&f.type!=='choice'&&<p>{w('keyLabel')}: <b>{solution(q)[f.id]}</b></p>}{r.explanation&&<p lang={contentLanguage}>{localized?.explanations[f.id]??r.explanation}</p>}</div>}
            </div>;
          })}
          <div className="practice-actions"><button type="submit" className="btn btn--primary">{boundary?w('check'):t('practice.check')}</button>
            {!simpleChoice&&!boundary&&<button type="button" className="btn" onClick={s.reveal}>{t('practice.reveal')}</button>}</div>
          {attempt.result&&(!boundary||!corrected)&&<p role="status" className="practice-result-summary">{attempt.result.complete===false?w('incomplete'):t(attempt.result.pass?'practice.passed':'practice.review')}</p>}
        </form>
        {boundary&&corrected&&<section className="practice-calculation" lang={contentLanguage} aria-label={w('calculation')}><h4>{w('calculation')}</h4><p>/{boundary.data.prefix} → {boundary.calculation.mask} · {nd02Text(language,'addressCount',{count:boundary.calculation.addresses})}</p><p>{w('network')}: {boundary.calculation.network}<br/>{w('broadcast')}: {boundary.calculation.broadcast}<br/>{w('hostRange')}: {boundary.calculation.first}–{boundary.calculation.last}</p></section>}
        {!simpleChoice&&!boundary&&attempt.revealed&&<section className="practice-solution"><h3>{t('practice.solution')}</h3><p>{t('practice.assisted')}</p>
          <dl>{q.fields.map(f=>{const value=solution(q)[f.id];return <div key={f.id}><dt lang="de">{f.label}</dt><dd>{f.type==='choice'?labels[value as keyof typeof labels]:value}</dd></div>;})}</dl>
          <details><summary>{t('practice.details')}</summary><div lang="de">{[...new Set(Object.values(evaluate(q,solution(q)).fields).map(r=>r.explanation))].map(text=><p key={text}>{text}</p>)}</div></details>
        </section>}
      </>}
    </div>
    <footer className="practice-footer">
      <small>{t('practice.temporary')}</small>
      {corrected&&<button type="button" className="btn btn--primary practice-next" onClick={()=>newVariant(true)}>{t('practice.next')} <span aria-hidden="true">→</span></button>}
      {nextError&&<p role="alert">{t('practice.nextError')}</p>}
    </footer>
  </section>;
}
