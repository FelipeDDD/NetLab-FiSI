import { expect, it } from 'vitest';
import { generateDiagnosis, DIAGNOSIS_RECIPES } from './generator';
import { checkDiagnosis, diagnosisOptions, diagnosisPrompt, nextDiagnosis } from './previewModel';

it('uses concept contracts, never the current answer, to choose available options',()=>{
  for(const concept of ['membership','gateway-address','observation'] as const)expect(diagnosisOptions(concept).map(o=>o.value)).toEqual(['yes','no']);
  for(const concept of ['reachability','cause'] as const)expect(diagnosisOptions(concept).map(o=>o.value)).toEqual(['yes','no','unknown']);
});
it.each(DIAGNOSIS_RECIPES)('checks $id jointly without leaking any answer on incomplete submission',recipe=>{
  const generated=generateDiagnosis({version:1,archetype:recipe.archetype,difficulty:recipe.levels[0],seed:'preview-contract',recipe:recipe.id});
  const snapshot=JSON.stringify(generated),qs=generated.case.questions,answers=Object.fromEntries(qs.map(q=>[q.id,q.answer]));
  expect(checkDiagnosis(generated,{})).toEqual({complete:false,missing:qs.map(q=>q.id)});
  expect(checkDiagnosis(generated,{[qs[0].id]:qs[0].answer})).toEqual({complete:false,missing:[qs[1].id]});
  const correct=checkDiagnosis(generated,answers);expect(correct.complete&&correct.pass).toBe(true);
  if(!correct.complete)throw Error();
  expect(correct.fields.map(f=>f.explanation)).toEqual(qs.map(q=>q.explanation));
  const wrong=checkDiagnosis(generated,Object.fromEntries(qs.map(q=>[q.id,q.answer==='yes'?'no':'yes'])));
  expect(wrong.complete&&!wrong.pass).toBe(true);
  expect(JSON.stringify(generated)).toBe(snapshot);
  for(const q of qs.filter(q=>!diagnosisOptions(q.concept).some(o=>o.value==='unknown')))expect(checkDiagnosis(generated,{...answers,[q.id]:'unknown'}).complete).toBe(false);
  const projection=diagnosisPrompt(generated);
  if(generated.data.kind==='address') {
    expect(projection.title).toBe('Gateway und Subnetz');
    expect(projection.scenario).toBe('');
    expect(projection.evidence.map(e=>e.text)).toEqual([`PC: ${generated.data.pc}/${generated.data.prefix}`,`Gateway: ${generated.data.candidate}`]);
    expect(projection.questions.map(q=>q.prompt)).toEqual(['Gehört die Gateway-Adresse zum Subnetz des PCs?','Ist sie numerisch als Gateway eines anderen Routers geeignet?']);
    expect(JSON.stringify(projection)).not.toContain('Bewertet wird');
  } else {
    expect(projection.evidence).toEqual(generated.case.evidence.map(({id,text})=>({id,text})));
    expect(projection.scenario).toBe(generated.case.scenario);
    expect(projection.questions.map(q=>q.prompt)).toEqual(qs.map(q=>q.prompt));
  }
  for(const question of projection.questions)expect(Object.keys(question).sort()).toEqual(['id','options','prompt']);
  expect(JSON.stringify(projection)).not.toContain('Hypothetisches Beispiel');
  expect(JSON.stringify(projection)).not.toContain(recipe.id);
});
it('new seeds reproduce exactly and select a new eligible recipe without pinning the previous resolved recipe',()=>{
  for(const archetype of ['ND02','ND05'] as const)for(const difficulty of ['beginner','intermediate','advanced'] as const) {
    const original=generateDiagnosis({version:1,archetype,difficulty,seed:'manual seed 東京'});
    const next=nextDiagnosis(original,'new-seed');expect(next).toEqual(nextDiagnosis(original,'new-seed'));
    expect(generateDiagnosis(next.recipe)).toEqual(next);
    expect(next.recipe.archetype).toBe(archetype);expect(next.recipe.difficulty).toBe(difficulty);
    expect(nextDiagnosis(original,original.recipe.seed).case.id).not.toBe(original.case.id);
    expect(nextDiagnosis(original).recipe.seed).toMatch(/^[\da-f]{8}$/);
  }
  const initial=generateDiagnosis({version:1,archetype:'ND05',difficulty:'advanced',seed:'one',recipe:'nd05-timeout'});
  expect(new Set(Array.from({length:100},(_,i)=>nextDiagnosis(initial,`preview-${i}`).recipe.recipe)).size).toBe(6);
});
