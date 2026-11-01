import { useEffect, useRef, useState } from 'react';
import { translate, useLanguage, installLanguageDocument, type TranslationKey } from '../../i18n';
import { LanguageSelector } from '../../i18n/LanguageSelector';
import { previewText } from './previewMessages';
import { presentationV3 } from './presentationV3';
import type { BoundaryDiagnosisV3 } from './boundariesV3';
import { ChoiceField } from '../practice/ChoiceField';
import { randomPracticeSeed } from '../practice/seeds';
import { practiceNextShortcut, PRACTICE_INTERACTIVE } from '../practice/shortcuts';
import type { DiagnosisRecipe } from './generator';
import { checkDiagnosis, diagnosisPrompt, nextDiagnosis, generatePreview, initialDiagnosisAnswers, type PreviewRecipe, type PreviewDiagnosis, type DiagnosisAnswers } from './previewModel';
import '../practice/practice.css';
import './preview.css';

export default function DiagnosisPreview() {
  const language=useLanguage(s=>s.language);
  const [theme,setTheme]=useState('graphite-dark'),[open,setOpen]=useState(true);
  const [question,setQuestion]=useState<PreviewDiagnosis>(()=>generatePreview({version:3,archetype:'ND02',difficulty:'beginner',seed:randomPracticeSeed()}));
  const [seed,setSeed]=useState(question.recipe.seed),[answers,setAnswers]=useState<DiagnosisAnswers>(()=>initialDiagnosisAnswers(question));
  const [result,setResult]=useState<ReturnType<typeof checkDiagnosis>>(),[error,setError]=useState<TranslationKey>(),[config,setConfig]=useState(true);
  const heading=useRef<HTMLHeadingElement>(null),body=useRef<HTMLDivElement>(null);
  const t=(key:Parameters<typeof translate>[1])=>translate(language,key);
  const w=(key:Parameters<typeof previewText>[1],values?:Record<string,string|number>)=>previewText(language,key,values);
  const localized=question.recipe.version===3?presentationV3(question as BoundaryDiagnosisV3,language):undefined;
  const contentLanguage=localized?language:'de';
  const sourcePrompt=diagnosisPrompt(question);
  const prompt=localized?{...sourcePrompt,title:localized.title,questions:sourcePrompt.questions.map(q=>({...q,prompt:localized.prompts[q.id]}))}:sourcePrompt;
  const labels={yes:t('practice.yes'),no:t('practice.no'),unknown:t('practice.unknown')};
  const states={correct:t('practice.correct'),incorrect:t('practice.incorrect')};
  useEffect(()=>{document.documentElement.dataset.uiTheme=theme;},[theme]);
  useEffect(()=>installLanguageDocument(),[]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[open]);
  function replace(next:typeof question) {
    setQuestion(next);setSeed(next.recipe.seed);setAnswers(initialDiagnosisAnswers(next));setResult(undefined);setError(undefined);
    body.current?.scrollTo({top:0});heading.current?.focus({preventScroll:true});
  }
  function load(recipe:PreviewRecipe) {
    try {replace(generatePreview(recipe));}catch{setError('practice.invalidSeed');}
  }
  function next(checked:boolean) {
    if(checked&&!result?.complete)return false;
    try{replace(nextDiagnosis(question));return true;}catch{setError('practice.nextError');return false;}
  }
  return <main className="diagnosis-preview-page">
    {!open?<button className="btn" onClick={()=>setOpen(true)}>{w('reopen')}</button>:<section className="practice-panel diagnosis-preview-panel" aria-labelledby="practice-heading" onKeyDown={e=>{
      const modal=Array.from(document.querySelectorAll('dialog[open],[aria-modal="true"],[role="dialog"]')).some(el=>el.getClientRects().length>0);
      if(practiceNextShortcut(e.nativeEvent,!!result?.complete,modal||!!(e.target as HTMLElement).closest(PRACTICE_INTERACTIVE))&&next(true)){e.preventDefault();e.stopPropagation();}
    }}>
      <header><h2 id="practice-heading" tabIndex={-1} ref={heading}>{w('title')}</h2><LanguageSelector compact id="diagnosis-language" /><button className="btn btn--icon" aria-label={t('practice.close')} onClick={()=>setOpen(false)}>×</button></header>
      <div className="practice-body" ref={body}>
        <section className="practice-configuration" aria-label={t('practice.configuration')}>
          <div className="practice-config-summary"><div className="practice-summary-values"><strong>{question.recipe.archetype} · v{question.recipe.version} · {t(`practice.${question.recipe.difficulty}`)}</strong><span className="practice-summary-seed">Seed: <code>{question.recipe.seed}</code></span></div>
            <button className="btn btn--small practice-config-toggle" aria-expanded={config} aria-controls="diagnosis-config" onClick={()=>setConfig(v=>!v)}>{t('practice.configure')}</button></div>
          <div id="diagnosis-config" className="practice-config-fields" hidden={!config}>
            <div className="practice-controls">
              <label>{t('practice.category')}<select id="diagnosis-archetype" value={question.recipe.archetype} onChange={e=>load(e.target.value==='ND02'?{version:3,archetype:'ND02',difficulty:question.recipe.difficulty,seed}:{version:1,archetype:'ND05',difficulty:question.recipe.difficulty,seed})}><option>ND02</option><option>ND05</option></select></label>
              {question.recipe.archetype==='ND02'&&<label>{w('version')}<select id="diagnosis-version" value={question.recipe.version} onChange={e=>load({version:Number(e.target.value) as 1|2|3,archetype:'ND02',difficulty:question.recipe.difficulty,seed})}><option value="1">v1</option><option value="2">{w('v2')}</option><option value="3">{w('v3')}</option></select></label>}
              <label>{t('practice.difficulty')}<select id="diagnosis-difficulty" value={question.recipe.difficulty} onChange={e=>load({...question.recipe,recipe:undefined,difficulty:e.target.value as DiagnosisRecipe['difficulty'],seed})}>{(['beginner','intermediate','advanced'] as const).map(d=><option key={d} value={d}>{t(`practice.${d}`)}</option>)}</select></label>
              <label>{w('theme')}<select id="diagnosis-theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="graphite-dark">Graphite Dark</option><option value="classic-light">Classic Light</option></select></label>
            </div>
            <form className="practice-seed" onSubmit={e=>{e.preventDefault();load({...question.recipe,recipe:undefined,seed});}}>
              <label>{t('practice.seed')}<input id="diagnosis-seed" value={seed} maxLength={256} onChange={e=>setSeed(e.target.value)} /></label>
              <button className="btn" type="submit">{t('practice.reproduce')}</button><button className="btn" type="button" onClick={()=>next(false)}>{t('practice.another')}</button>
            </form>
          </div>
        </section>
        {error&&<p role="alert">{t(error)}</p>}
        <div className="practice-question" lang={contentLanguage}><h3>{prompt.title}</h3>{prompt.scenario&&<p>{prompt.scenario}</p>}</div>
        <div className="diagnosis-evidence" lang={contentLanguage}>{prompt.evidence.map(e=><p key={e.id}>{e.text}</p>)}</div>
        <form className="practice-answer-form" aria-label={t('practice.answers')} noValidate onSubmit={e=>{e.preventDefault();const checked=checkDiagnosis(question,answers);setResult(checked);if(checked.complete)heading.current?.focus({preventScroll:true});else document.querySelector<HTMLInputElement>(`#diagnosis-${checked.missing[0]} input`)?.focus();}}>
          {prompt.questions.map(q=>{
            const r=result?.complete?result.fields.find(f=>f.id===q.id):undefined;
            const missing=result&&!result.complete&&result.missing.includes(q.id),state=r?(r.correct?'correct':'incorrect'):missing?'missing':undefined,id=`diagnosis-${q.id}`;
            const emphasis=localized?.emphasis??'numerisch';
            const questionText=question.recipe.archetype==='ND02'&&q.prompt.includes(emphasis)?<>{q.prompt.split(emphasis)[0]}<u>{emphasis}</u>{q.prompt.split(emphasis)[1]}</>:q.prompt;
            const update=(value:string)=>{setAnswers(a=>({...a,[q.id]:value}));setResult(undefined);};
            return <div className="practice-field" key={q.id} data-result={state}>
              {q.input==='mask'?<div id={id}><label lang={contentLanguage} htmlFor={id+'-input'}>{q.prompt}</label><input id={id+'-input'} className="diagnosis-mask" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={answers[q.id]??''} aria-invalid={state==='missing'||state==='incorrect'} aria-describedby={state?id+'-feedback':undefined} onChange={e=>update(e.target.value)} onFocus={e=>{if(e.target.value==='255.255.')e.target.setSelectionRange(8,8);}} /></div>
                :<ChoiceField id={id} language={contentLanguage} prompt={questionText} options={q.options} value={answers[q.id]} labels={labels} states={states} result={state} correctChoice={r?.answer} onChange={update} />}
              {state&&<div className="practice-feedback" id={id+'-feedback'}>{r?<><strong>{states[r.correct?'correct':'incorrect']}</strong><p>{w('keyLabel')}: <b>{r.answer==='yes'||r.answer==='no'||r.answer==='unknown'?labels[r.answer]:r.answer}</b></p><div lang={contentLanguage}><p>{localized?.explanations[q.id]??r.explanation.reasoning}</p>{r.explanation.alternatives&&<ul><li>{r.explanation.alternatives.yes}</li><li>{r.explanation.alternatives.no}</li></ul>}</div></>:q.input==='mask'?w('maskMissing'):t('practice.missing')}</div>}
            </div>;
          })}
          <div className="practice-actions"><button type="submit" className="btn btn--primary diagnosis-check">{w('check')}</button></div>
          {result&&<p role="status">{result.complete?t(result.pass?'practice.passed':'practice.review'):w('incomplete')}</p>}
        </form>
        {result?.complete&&'calculation' in question&&<section className="diagnosis-evidence diagnosis-calculation" lang={contentLanguage} aria-label={localized?w('calculation'):'Rechenweg'}><h4>{localized?w('calculation'):'Rechenweg'}</h4><p>/{question.data.prefix} → {question.calculation.mask} · {localized?w('addressCount',{count:question.calculation.addresses}):`${question.calculation.addresses} Adressen`}</p><p>{localized?w('network'):'Netzadresse'}: {question.calculation.network}<br/>{localized?w('broadcast'):'Broadcastadresse'}: {question.calculation.broadcast}<br/>{localized?w('hostRange'):'Hostbereich'}: {question.calculation.first}–{question.calculation.last}</p></section>}
        {result?.complete&&<details className="diagnosis-recipe"><summary>{w('recipe')}</summary><code>{JSON.stringify(question.recipe)}</code></details>}
      </div>
      <footer className="practice-footer"><small>{w(localized?'note':'legacyNote')}</small>{result?.complete&&<button className="btn btn--primary practice-next" onClick={()=>next(true)}>{t('practice.next')} →</button>}</footer>
    </section>}
  </main>;
}
