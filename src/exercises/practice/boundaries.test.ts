import {afterEach,expect,it} from 'vitest';
import {createQuestion,evaluate,solution} from './model';
import {nextQuestion} from './progression';
import {usePractice,initialAnswers} from './session';
import {useLanguage} from '../../i18n';
import {generateBoundariesV3} from '../diagnosis/boundariesV3';

afterEach(()=>{usePractice.setState({open:false,question:undefined,recent:{},attempts:{}});useLanguage.setState({language:'de'});});
it('publishes ND02 v3 under its own identity and reproduces the exact approved generator output',()=>{
  for(const difficulty of ['beginner','intermediate','advanced'] as const)for(const seed of ['reference','nd02-v3-review-38','東京','old-uuid-37b3c848']) {
    const q=createQuestion('boundaries',seed,difficulty),g=generateBoundariesV3({version:3,archetype:'ND02',seed,difficulty});
    expect(q.problem).toEqual({family:'nd02-v3',generated:g});expect(q.id).toBe(g.case.id);
    expect(q.recipe.family).toBe('diagnosis');expect(q.contentVersion).toBe(3);
    expect(q.fields.map(f=>f.id)).toEqual(['membership','host','mask']);
    expect(q.fields[0].options?.map(o=>o.value)).toEqual(['yes','no']);
    expect(evaluate(q,solution(q)).pass).toBe(true);
  }
  expect(()=>createQuestion('boundaries','seed','beginner',2)).toThrow();
  expect(()=>createQuestion('gateway','seed','beginner',3)).toThrow();
});
it('blocks joint disclosure and progression until all three responses are complete',()=>{
  const q=createQuestion('boundaries'),answers=solution(q);usePractice.getState().select(q);
  expect(usePractice.getState().attempts[q.id].answers).toEqual({mask:'255.255.'});
  for(const mask of ['','255.255.','255.255.25','255.255.255.999','255.255.025.0','/24']) {
    const result=evaluate(q,{...answers,mask});expect(result).toEqual({complete:false,pass:false,fields:{mask:{state:'missing',explanation:''}}});
    usePractice.getState().check(result);usePractice.getState().advance(nextQuestion(q,'cannot-advance'));
    expect(usePractice.getState().question).toBe(q);
  }
  expect(evaluate(q,{mask:answers.mask}).complete).toBe(false);
  const wrong=evaluate(q,{...answers,mask:'1.2.3.4'});
  expect(wrong.complete).toBe(true);expect(wrong.pass).toBe(false);expect(wrong.fields.mask.state).toBe('incorrect');
  expect(evaluate(q,{...answers,mask:` ${answers.mask} `}).pass).toBe(true);
});
it('preserves independent attempts through category, language, close and return; editing clears joint feedback',()=>{
  const q=createQuestion('boundaries','partial'),a=solution(q);usePractice.getState().select(q);
  for(const [id,value] of Object.entries({...a,mask:'255.255.25'}))usePractice.getState().answer(id,value);
  const original=structuredClone(usePractice.getState().attempts[q.id]);
  for(const language of ['de','pt-BR','en','de'] as const) {useLanguage.setState({language});expect(usePractice.getState().attempts[q.id]).toEqual(original);}
  usePractice.getState().select(createQuestion('gateway','reference','beginner',2));usePractice.getState().close();usePractice.getState().show();usePractice.getState().select(q);
  expect(usePractice.getState().attempts[q.id]).toEqual(original);
  usePractice.getState().answer('mask',a.mask);usePractice.getState().check(evaluate(q,a));
  const graded=structuredClone(usePractice.getState().attempts[q.id]);
  for(const language of ['de','pt-BR','en','de'] as const){useLanguage.setState({language});expect(usePractice.getState().attempts[q.id]).toEqual(graded);}
  usePractice.getState().answer('mask','255.255.');expect(usePractice.getState().attempts[q.id].result).toBeUndefined();
});
it('advances with a new deterministic seed and clears only the previous attempt, even after incorrect answers',()=>{
  const keep=createQuestion('subnet');usePractice.getState().select(keep);usePractice.getState().answer('network','keep');
  const q=createQuestion('boundaries','sequence','advanced');usePractice.getState().select(q);
  usePractice.getState().check(evaluate(q,{...solution(q),mask:'1.2.3.4'}));
  const next=nextQuestion(q,'next-seed');expect(next).toEqual(nextQuestion(q,'next-seed'));expect(next.problem).not.toEqual(q.problem);
  expect(next.recipe.version).toBe(3);usePractice.getState().advance(next);
  expect(usePractice.getState().attempts[next.id].answers).toEqual(initialAnswers(next));
  expect(usePractice.getState().attempts[q.id]).toBeUndefined();expect(usePractice.getState().attempts[keep.id].answers.network).toBe('keep');
});
