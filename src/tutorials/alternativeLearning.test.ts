import { expect,it } from 'vitest';
import type { ProjectRepository } from '../projects/repository';
import type { MetaRecord,MetaValue,RepositoryError } from '../projects/types';
import { ALTERNATIVE_COMPLETION_KEY as HISTORY,ALTERNATIVE_CURRENT_KEY as CURRENT,readAlternativeCompletion,readAlternativeCurrent,rememberAlternativeCompletion,selectAlternativeAttempt } from './alternativeLearning';
import { ALTERNATIVE_PROGRESS_PREFIX as PREFIX,newAlternativeProgress,readAlternativeProgress } from './alternativePathsProgress';
import { ALTERNATIVE_IDS as I } from './alternativePathsChapter';
import { emptyLpm } from './alternativeLpm';
import { alternativePathsCompletion,alternativePracticeCompletion } from './completion';
import { createAlternativeEntryAttempt } from './alternativeEntries';
import { loadTutorialMenuProgress } from './menuProgress';

const hash='sha256-v1:'+'a'.repeat(64);
function full(id='full'){
  const p=newAlternativeProgress(id),pc={id:'student-c',mac:'02:00:00:00:00:03'};
  return {...p,prepared:true,stage:'lans' as const,step:22,completed:Array.from({length:22},(_,i)=>i+1),extension:{a:'02:00:00:00:00:01',b:'02:00:00:00:00:02'},neighbors:Object.fromEntries(Object.keys(p.neighbors).map(k=>[k,hash])) as typeof p.neighbors,
    remoteUnderstood:true,hopUnderstood:true,lpmUnderstood:true,investigated:hash,returnInvestigated:hash,viaBaseline:hash,failure:hash,viaReplies:{ab:hash,ba:hash},directReplies:{ab:hash,ba:hash},storm:'applied' as const,
    lpm:{...emptyLpm(),stage:'ready' as const,baseline:Object.values(I),pc,localReply:hash,experiment:{legacy:false,r2:{hash,reply:[pc.id,I.r3,I.r2]},broad:{hash,reply:[pc.id,I.r3,I.r2,I.r1,I.a]},specific:{hash,reply:[pc.id,I.r3,I.r1,I.a]}}}};
}
function storage(){
  const meta=new Map<string,MetaRecord>();let intercept:(()=>void)|null=null,fault:RepositoryError|null=null,writes=0;
  const repository:Pick<ProjectRepository,'getMeta'|'setMeta'>={
    getMeta:async key=>({ok:true,value:structuredClone(meta.get(key)??null)}),
    setMeta:async(m,options)=>{
      writes++;const action=intercept;intercept=null;action?.();if(fault)return{ok:false,error:fault};
      for(const g of [...options?.guards??[],m]){const current=meta.get(g.key)??null;if((current?.revision??null)!==g.expectedRevision)return{ok:false,error:{code:'meta-conflict',key:g.key,current,expectedRevision:g.expectedRevision,message:'Conflict'}};}
      const value={key:m.key,revision:(meta.get(m.key)?.revision??0)+1,value:structuredClone(m.value)};meta.set(m.key,value);return{ok:true,value};
    }
  };
  return{repository,meta,get writes(){return writes;},put(id:string,value:unknown){meta.set(PREFIX+id,{key:PREFIX+id,revision:1,value:structuredClone(value) as MetaValue});},beforeWrite(fn:()=>void){intercept=fn;},fail(value:RepositoryError|null){fault=value;}};
}
it('persists a verified full completion independently, with its source and recording date, and never erases it for a new practice',async()=>{
  const s=storage(),p=full();readAlternativeProgress(p,p.draftId);s.put(p.draftId,p);
  const h=await rememberAlternativeCompletion(s.repository,p.draftId);expect(h).toMatchObject({chapterVersion:4,source:{draftId:p.draftId,attemptId:p.attemptId,entry:'beginning'}});expect(h!.recordedAt).toBeGreaterThan(0);
  const next=await createAlternativeEntryAttempt('part-4');s.put(next.progress.draftId,next.progress);await selectAlternativeAttempt(s.repository,next.progress.draftId,next.progress.attemptId,()=>true);
  expect(await rememberAlternativeCompletion(s.repository,next.progress.draftId)).toEqual(h);expect(readAlternativeCurrent(s.meta.get(CURRENT)!.value).draftId).toBe(next.progress.draftId);
  s.meta.delete(PREFIX+p.draftId);expect(await rememberAlternativeCompletion(s.repository,'missing')).toEqual(h);
});
it.each(['part-2','part-3','part-4'] as const)('finishes the %s practice without awarding an integral chapter or supplied tasks',async point=>{
  const s=storage(),a=await createAlternativeEntryAttempt(point),provided=a.progress,earned=full(provided.draftId);
  const p={...earned,...provided,step:22,completed:Array.from({length:23-provided.entry!.firstTask},(_,i)=>i+provided.entry!.firstTask),storm:'applied' as const,failure:hash,directReplies:{ab:hash,ba:hash}};
  if(point!=='part-4')Object.assign(p,{lpm:earned.lpm,lpmUnderstood:true,viaBaseline:hash,...(point==='part-2'?{investigated:hash,returnInvestigated:hash,viaReplies:earned.viaReplies,hopUnderstood:true}:{})});
  readAlternativeProgress(p,p.draftId);s.put(p.draftId,p);
  expect(alternativePracticeCompletion(p)).toEqual({completed:p.completed.length,total:p.completed.length,complete:true});expect(alternativePathsCompletion(p).complete).toBe(false);
  expect(await rememberAlternativeCompletion(s.repository,p.draftId)).toBeNull();expect(s.meta.has(HISTORY)).toBe(false);expect(p.completed.every(n=>n>=provided.entry!.firstTask)).toBe(true);
});
it('never sums evidence from different incomplete attempts or treats a final navigation step as completion',async()=>{
  const s=storage();for(const [id,remove]of [['a',1],['b',2]] as const){const p=full(id);p.completed=p.completed.filter(n=>n!==remove);s.put(id,p);expect(await rememberAlternativeCompletion(s.repository,id)).toBeNull();}
  const menu=await loadTutorialMenuProgress(s.repository,['a','b'],null,()=>null);expect(menu.alternativeHistory).toBeUndefined();expect(s.meta.has(HISTORY)).toBe(false);
});
it('backfills a genuinely verifiable old integral attempt without changing its progress or inventing a completion date',async()=>{
  const s=storage(),p={...full('old'),chapterVersion:2,step:17,completed:Array.from({length:17},(_,i)=>i+1)};s.put('old',p);const before=structuredClone(s.meta.get(PREFIX+'old'));
  const menu=await loadTutorialMenuProgress(s.repository,['old'],null,()=>null);expect(menu.alternativeHistory?.source.chapterVersion).toBe(2);expect(menu.alternativeHistory).not.toHaveProperty('completedAt');expect(s.meta.get(PREFIX+'old')).toEqual(before);
});
it('recovers the gap after progress commit, quota failure and concurrent writers without duplicate or partial history',async()=>{
  const s=storage(),p=full();s.put(p.draftId,p);s.fail({code:'quota-exceeded',message:'Quota'});
  await expect(rememberAlternativeCompletion(s.repository,p.draftId)).rejects.toThrow('quota-exceeded');expect(s.meta.has(HISTORY)).toBe(false);expect(s.meta.get(PREFIX+p.draftId)!.value).toEqual(p);
  s.fail(null);const [a,b]=await Promise.all([rememberAlternativeCompletion(s.repository,p.draftId),rememberAlternativeCompletion(s.repository,p.draftId)]);expect(a).toEqual(b);expect(s.meta.get(HISTORY)!.revision).toBe(1);
});
it('guards the origin revision atomically instead of crediting a source changed during verification',async()=>{
  const s=storage(),p=full();s.put(p.draftId,p);s.beforeWrite(()=>{const r=s.meta.get(PREFIX+p.draftId)!;s.meta.set(r.key,{...r,revision:2,value:{...p,completed:p.completed.filter(n=>n!==22)} as unknown as MetaValue});});
  await expect(rememberAlternativeCompletion(s.repository,p.draftId)).rejects.toThrow('meta-conflict');expect(s.meta.has(HISTORY)).toBe(false);
});
it('resumes the selected attempt after leaving for a personal plan, respects the active draft, and skips a late selection',async()=>{
  const s=storage(),old=newAlternativeProgress('old'),next=newAlternativeProgress('new');s.put('old',old);s.put('new',next);
  await selectAlternativeAttempt(s.repository,'new',next.attemptId,()=>true);const pointer=structuredClone(s.meta.get(CURRENT));
  expect((await loadTutorialMenuProgress(s.repository,['personal','old','new'],null,()=>null)).alternative!.draftId).toBe('new');
  expect((await loadTutorialMenuProgress(s.repository,['old','new','personal'],null,()=>null)).alternative!.draftId).toBe('old');
  await selectAlternativeAttempt(s.repository,'old',old.attemptId,()=>false);expect(s.meta.get(CURRENT)).toEqual(pointer);
});
it('refuses incompatible learning records without overwriting them',async()=>{
  expect(()=>readAlternativeCompletion({})).toThrow();expect(()=>readAlternativeCurrent({})).toThrow();
  const s=storage(),p=full();s.put(p.draftId,p);s.meta.set(HISTORY,{key:HISTORY,revision:1,value:{schemaVersion:2}});await expect(rememberAlternativeCompletion(s.repository,p.draftId)).rejects.toThrow();expect(s.writes).toBe(0);
});
it('recovers completion from the closed current attempt without reopening it',async()=>{
  const s=storage(),p=full();s.put(p.draftId,p);await selectAlternativeAttempt(s.repository,p.draftId,p.attemptId,()=>true);
  const menu=await loadTutorialMenuProgress(s.repository,[],null,()=>null);expect(menu.alternative).toBeNull();expect(menu.alternativeHistory?.source.attemptId).toBe(p.attemptId);
});
it('isolates a Chapter 5 history write failure from other chapters and retries without changing the source',async()=>{
  const s=storage(),p=full();s.put(p.draftId,p);s.fail({code:'quota-exceeded',message:'Quota'});
  const menu=await loadTutorialMenuProgress(s.repository,[p.draftId],null,()=>null);expect(menu.alternativeError).toBe(true);expect(menu.alternativeHistory).toBeUndefined();expect(menu.alternative?.progress.complete).toBe(true);expect(s.meta.get(PREFIX+p.draftId)!.value).toEqual(p);
  s.fail(null);const retried=await loadTutorialMenuProgress(s.repository,[p.draftId],null,()=>null);expect(retried.alternativeError).toBeUndefined();expect(retried.alternativeHistory).toBeDefined();
});
it('rejects a late pointer write when the source revision changes, preserving the previous selection',async()=>{
  const s=storage(),a=newAlternativeProgress('a'),b=newAlternativeProgress('b');s.put('a',a);s.put('b',b);await selectAlternativeAttempt(s.repository,'a',a.attemptId,()=>true);
  const before=structuredClone(s.meta.get(CURRENT));s.beforeWrite(()=>{const record=s.meta.get(PREFIX+'b')!;s.meta.set(record.key,{...record,revision:2});});
  await expect(selectAlternativeAttempt(s.repository,'b',b.attemptId,()=>true)).rejects.toThrow('meta-conflict');expect(s.meta.get(CURRENT)).toEqual(before);
});
