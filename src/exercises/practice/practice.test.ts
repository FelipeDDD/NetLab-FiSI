import { afterEach, expect, it, vi } from 'vitest';
import { createQuestion, evaluate, solution, PRACTICE_KINDS } from './model';
import { usePractice } from './session';
import { useLanguage } from '../../i18n';
import { grade, subnet } from '../factory/math';
import { ipToString } from '../../engine/ip';
import { nextQuestion } from './progression';
import { randomPracticeSeed } from './seeds';

afterEach(()=>{vi.unstubAllGlobals();usePractice.setState({open:false,question:undefined,recent:{},attempts:{}});useLanguage.setState({language:'de'});});
it('E02 asks only the requested question and distinguishes subnet membership from connectivity',()=>{
  const q=createQuestion('gateway');
  expect(q.data).toEqual(['PC: 192.168.99.60/16','Gateway: 192.168.9.1']);
  expect(q.fields).toHaveLength(1);expect(solution(q)).toEqual({local:'yes'});
  expect(evaluate(q,{local:'unknown'}).pass).toBe(false);
  expect(evaluate(q,{local:'yes'}).fields.local.explanation).toContain('nicht eindeutig bestimmbar');
  expect(evaluate(q,{}).fields.local.state).toBe('missing');
});
it.each(PRACTICE_KINDS)('reproduces %s recipes and validates partial answers over all difficulties',kind=>{
  for(const difficulty of ['beginner','intermediate','advanced'] as const) for(let i=0;i<10;i++) {
    const q=createQuestion(kind,`learner-${i}`,difficulty),answer=solution(q);
    expect(createQuestion(kind,q.recipe.seed,q.recipe.difficulty,q.recipe.version)).toEqual(q);
    expect(evaluate(q,answer).pass).toBe(true);
    expect(evaluate(q,{}).pass).toBe(false);
    const partial={...answer};delete partial[q.fields[0].id];
    expect(evaluate(q,partial).fields[q.fields[0].id].state).toBe('missing');
    expect(evaluate(q,partial).pass).toBe(false);
    const bad={...answer,[q.fields[0].id]:'not an answer'};
    expect(evaluate(q,bad).pass).toBe(false);
  }
});
it('subnetting uses only three relevant fields and normalizes spaces and equivalent integer notation',()=>{
  const q=createQuestion('subnet'),a=solution(q);
  expect(q.fields.map(f=>f.id)).toEqual(['network','broadcast','hosts']);
  expect(evaluate(q,{network:` ${a.network} `,broadcast:a.broadcast,hosts:`00${a.hosts}`}).pass).toBe(true);
  expect(evaluate(q,{...a,hosts:a.hosts+'.5'}).fields.hosts.state).toBe('incorrect');
});
it('VLSM accepts alternative placements and marks both members of an overlap',()=>{
  const q=createQuestion('vlsm','notebook-demo','advanced');if(q.problem.family!=='vlsm')throw Error();
  const a=solution(q),f=q.fields.at(-1)!,p=subnet(a[f.id]),parent=subnet(q.problem.parent);
  let found=false;
  for(let start=parent.start;start+p.size-1<=parent.end;start+=p.size) {
    const candidate=`${ipToString(start)}/${p.prefix}`;
    if(candidate===a[f.id])continue;
    const alternate={...a,[f.id]:candidate};
    if(grade(q.problem,q.fields.map(f=>({id:f.id,cidr:alternate[f.id]}))).pass) {expect(evaluate(q,alternate).pass).toBe(true);found=true;break;}
  }
  expect(found).toBe(true);
  const small=q.fields.at(-1)!,large=q.fields[0],smallNet=subnet(a[small.id]),largeNet=subnet(a[large.id]);
  const overlap={...a,[small.id]:`${ipToString(largeNet.start)}/${smallNet.prefix}`};
  const result=evaluate(q,overlap);
  expect(result.fields[large.id].state).toBe('incorrect');expect(result.fields[small.id].state).toBe('incorrect');
});
it('isolates attempts by category, seed, content/generator version and difficulty',()=>{
  const questions=[createQuestion('gateway'),createQuestion('gateway','other'),createQuestion('gateway','reference','advanced'),createQuestion('subnet')];
  expect(new Set(questions.map(q=>q.id)).size).toBe(4);
  expect(()=>createQuestion('subnet','x','beginner',2)).toThrow();
});
it('keeps answers, feedback and assistance across navigation/close/language changes without writing progress',()=>{
  const setItem=vi.fn();vi.stubGlobal('localStorage',{getItem:()=>null,setItem});
  const first=createQuestion('gateway'),second=createQuestion('subnet');
  usePractice.getState().select(first);usePractice.getState().answer('local','yes');
  usePractice.getState().check(evaluate(first,{local:'yes'}));usePractice.getState().reveal();
  const saved=structuredClone(usePractice.getState().attempts[first.id]);
  usePractice.getState().select(second);usePractice.getState().close();usePractice.getState().show();
  expect(usePractice.getState().recent.gateway).toEqual(first);
  for(const language of ['en','pt-BR','de'] as const)useLanguage.setState({language});
  usePractice.getState().select(first);
  expect(usePractice.getState().attempts[first.id]).toEqual(saved);expect(setItem).not.toHaveBeenCalled();
  usePractice.getState().answer('local','no');expect(usePractice.getState().attempts[first.id].result).toBeUndefined();
  expect(usePractice.getState().attempts[first.id].revealed).toBe(true);
});
it.each(PRACTICE_KINDS)('advances %s after an incorrect correction, clearing only its previous attempt and preserving reproducibility',kind=>{
  const other=createQuestion(kind==='subnet'?'vlsm':'subnet','keep-this');
  usePractice.getState().select(other);usePractice.getState().answer(other.fields[0].id,'stored answer');
  let current=createQuestion(kind,'reference','intermediate');usePractice.getState().select(current);
  // Cannot bypass the correction step.
  usePractice.getState().advance(nextQuestion(current,'before-check'));
  expect(usePractice.getState().question).toEqual(current);
  const seen=new Set<string>();
  for(let i=0;i<5;i++) {
    usePractice.getState().answer(current.fields[0].id,'wrong');usePractice.getState().reveal();
    usePractice.getState().check(evaluate(current,{[current.fields[0].id]:'wrong'}));
    const next=nextQuestion(current,`sequence-${i}`),previous=current;
    expect(JSON.stringify(next.problem)).not.toBe(JSON.stringify(previous.problem));
    expect(nextQuestion(current,`sequence-${i}`)).toEqual(next);
    expect(next.kind).toBe(kind);expect(next.recipe.difficulty).toBe('intermediate');
    expect(createQuestion(kind,next.recipe.seed,next.recipe.difficulty,next.recipe.version)).toEqual(next);
    usePractice.getState().advance(next);const s=usePractice.getState();
    expect(s.attempts[previous.id]).toBeUndefined();expect(s.attempts[next.id]).toEqual({answers:{},revealed:false});
    expect(s.attempts[other.id].answers[other.fields[0].id]).toBe('stored answer');
    expect(s.recent[kind]).toEqual(next);expect(seen.has(next.id)).toBe(false);seen.add(next.id);current=next;
  }
});
it('advances after a correct answer, then requires another correction before advancing again',()=>{
  const first=createQuestion('gateway');usePractice.getState().select(first);
  usePractice.getState().answer('local','yes');usePractice.getState().check(evaluate(first,{local:'yes'}));
  const next=nextQuestion(first,'correct-answer');usePractice.getState().advance(next);
  expect(usePractice.getState().question).toEqual(next);
  usePractice.getState().advance(nextQuestion(next,'no-correction-yet'));
  expect(usePractice.getState().question).toEqual(next);
});
it('uses eight-character seeds for new variants and deterministic retries while leaving manual and old UUID recipes opaque',()=>{
  vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint8Array).set([0,15,160,255]);return array;});
  try {
    expect(randomPracticeSeed()).toBe('000fa0ff');
    for(const kind of PRACTICE_KINDS) {
      const first=createQuestion(kind,'reference'),next=nextQuestion(first);
      expect(next.recipe.seed).toBe('000fa0ff');
      expect(createQuestion(kind,next.recipe.seed,next.recipe.difficulty,next.recipe.version)).toEqual(next);
      // Force a repeated seed/content, exercising the bounded deterministic retry.
      const retry=nextQuestion(next);expect(retry.recipe.seed).toMatch(/^[a-f0-9]{8}$/);expect(retry.problem).not.toEqual(next.problem);
      expect(nextQuestion(next)).toEqual(retry);
      for(const seed of ['reference','37b3c848-b226-44c2-93eb-0337af1ce011-0','eigene Seed 東京'])expect(createQuestion(kind,seed).recipe.seed).toBe(seed);
    }
  }finally {vi.restoreAllMocks();}
});
