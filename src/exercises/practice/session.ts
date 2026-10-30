import { create } from 'zustand';
import type { Answers, Evaluation, PracticeKind, Question } from './model';
export interface PracticeAttempt { answers:Answers; result?:Evaluation; revealed:boolean }
/** Visit-local only: no topology document, IndexedDB, legacy progress or localStorage writes. */
export const usePractice = create<{
  open:boolean; question?:Question; recent:Partial<Record<PracticeKind,Question>>; attempts:Record<string,PracticeAttempt>;
  show():void; close():void; select(q:Question):void; advance(q:Question):void; answer(id:string,value:string):void; check(result:Evaluation):void; reveal():void;
}>((set,get)=>{
  const update=(change:(a:PracticeAttempt)=>PracticeAttempt)=>{
    const s=get();if(!s.question)return;
    const id=s.question.id;set({attempts:{...s.attempts,[id]:change(s.attempts[id])}});
  };
  return {open:false,recent:{},attempts:{},show:()=>set({open:true}),close:()=>set({open:false}),
    select:q=>set(s=>({question:q,recent:{...s.recent,[q.kind]:q},attempts:{...s.attempts,[q.id]:s.attempts[q.id]??{answers:{},revealed:false}}})),
    advance:q=>set(s=>{
      const current=s.question;
      if(!current||!s.attempts[current.id]?.result||q.id===current.id||q.kind!==current.kind||q.recipe.difficulty!==current.recipe.difficulty)return s;
      const attempts={...s.attempts};delete attempts[current.id];
      return {question:q,recent:{...s.recent,[q.kind]:q},attempts:{...attempts,[q.id]:{answers:{},revealed:false}}};
    }),
    answer:(id,value)=>update(a=>({...a,answers:{...a.answers,[id]:value},result:undefined})),
    check:result=>update(a=>({...a,result})),reveal:()=>update(a=>({...a,revealed:true})),
  };
});
