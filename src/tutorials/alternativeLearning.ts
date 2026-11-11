import type { ProjectRepository } from '../projects/repository';
import type { MetaRecord, MetaValue } from '../projects/types';
import { ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress } from './alternativePathsProgress';
import { alternativePathsCompletion } from './completion';

export const ALTERNATIVE_COMPLETION_KEY='guided:chapter-completion:v5:alternative-paths';
export const ALTERNATIVE_CURRENT_KEY='guided:current-attempt:v5:alternative-paths';
type Reader=Pick<ProjectRepository,'getMeta'>;
type Writer=Reader&Pick<ProjectRepository,'setMeta'>;
export interface AlternativeChapterCompletion {
  schemaVersion:1;kind:'chapter-completion';chapterId:'alternative-paths';chapterVersion:5;
  source:{draftId:string;attemptId:string;chapterVersion:number;entry:'beginning'};
  recordedAt:number;
}
export interface AlternativeCurrentAttempt {
  schemaVersion:1;kind:'current-attempt';chapterId:'alternative-paths';draftId:string;attemptId:string;selectedAt:number;
}
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const time=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
export function readAlternativeCompletion(value:unknown):AlternativeChapterCompletion {
  const p=value as AlternativeChapterCompletion;
  if(!p||p.schemaVersion!==1||p.kind!=='chapter-completion'||p.chapterId!=='alternative-paths'||p.chapterVersion!==5||!time(p.recordedAt)||!p.source||typeof p.source.draftId!=='string'||!p.source.draftId||!uuid(p.source.attemptId)||p.source.chapterVersion!==5||p.source.entry!=='beginning')throw Error('Incompatible chapter completion.');
  return structuredClone(p);
}
export function readAlternativeCurrent(value:unknown):AlternativeCurrentAttempt {
  const p=value as AlternativeCurrentAttempt;
  if(!p||p.schemaVersion!==1||p.kind!=='current-attempt'||p.chapterId!=='alternative-paths'||typeof p.draftId!=='string'||!p.draftId||!uuid(p.attemptId)||!time(p.selectedAt))throw Error('Incompatible current attempt.');
  return structuredClone(p);
}
export async function alternativeMeta(repository:Reader,key:string):Promise<MetaRecord|null>{
  const found=await repository.getMeta(key);if(!found.ok)throw Error(found.error.code);return found.value;
}
export async function alternativeOpeningSelection(repository:Reader,id:string,attemptId:string){
  const current=await alternativeMeta(repository,ALTERNATIVE_CURRENT_KEY);if(current)readAlternativeCurrent(current.value);
  const value:AlternativeCurrentAttempt={schemaVersion:1,kind:'current-attempt',chapterId:'alternative-paths',draftId:id,attemptId,selectedAt:Date.now()};
  return {key:ALTERNATIVE_CURRENT_KEY,expectedRevision:current?.revision??null,value:value as unknown as MetaValue};
}
/** Only persisted, validated full attempts can create this independent record.
 * The source revision is checked in the SAME transaction as the history CAS.
 * A crash between progress/history commits is repaired by the next load. */
export async function rememberAlternativeCompletion(repository:Writer,id:string):Promise<AlternativeChapterCompletion|null>{
  const existing=await alternativeMeta(repository,ALTERNATIVE_COMPLETION_KEY);
  if(existing)return readAlternativeCompletion(existing.value);
  const source=await alternativeMeta(repository,ALTERNATIVE_PROGRESS_PREFIX+id);if(!source)return null;
  const p=readAlternativeProgress(source.value,id);
  if(p.entry||!alternativePathsCompletion(p).complete)return null;
  const value:AlternativeChapterCompletion={schemaVersion:1,kind:'chapter-completion',chapterId:'alternative-paths',chapterVersion:5,
    source:{draftId:id,attemptId:p.attemptId,chapterVersion:(source.value as unknown as {chapterVersion?:number}).chapterVersion??1,entry:'beginning'},recordedAt:Date.now()};
  const saved=await repository.setMeta({key:ALTERNATIVE_COMPLETION_KEY,expectedRevision:null,value:value as unknown as MetaValue},{guards:[{key:source.key,expectedRevision:source.revision}]});
  if(saved.ok)return readAlternativeCompletion(saved.value.value);
  // Two genuine completions may race. Preserve the first verified winner.
  if(saved.error.code==='meta-conflict'&&saved.error.key===ALTERNATIVE_COMPLETION_KEY&&saved.error.current)return readAlternativeCompletion(saved.error.current.value);
  throw Error(saved.error.code);
}
/** Selection is independent of progress and never rewrites another attempt. */
export async function selectAlternativeAttempt(repository:Writer,id:string,attemptId:string,isActive:()=>boolean){
  if(!isActive())return;
  const current=await alternativeMeta(repository,ALTERNATIVE_CURRENT_KEY),source=await alternativeMeta(repository,ALTERNATIVE_PROGRESS_PREFIX+id);
  if(!source||readAlternativeProgress(source.value,id).attemptId!==attemptId||!isActive())return;
  if(current){const p=readAlternativeCurrent(current.value);if(p.draftId===id&&p.attemptId===attemptId)return;}
  const value:AlternativeCurrentAttempt={schemaVersion:1,kind:'current-attempt',chapterId:'alternative-paths',draftId:id,attemptId,selectedAt:Date.now()};
  const saved=await repository.setMeta({key:ALTERNATIVE_CURRENT_KEY,expectedRevision:current?.revision??null,value:value as unknown as MetaValue},{guards:[{key:source.key,expectedRevision:source.revision}]});
  if(!saved.ok)throw Error(saved.error.code);
}
