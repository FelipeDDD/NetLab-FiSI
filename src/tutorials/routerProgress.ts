import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue } from '../projects/types';
import { ROUTER_CHAPTER } from './routerChapter';
export const ROUTER_PROGRESS_PREFIX = 'guided:two-networks:v1:draft:';
export interface RouterProgress {
  schemaVersion:2; chapterId:'two-networks'; chapterVersion:2; draftId:string; pcC:string; source:'continue'|'direct'; prepared:boolean; step:number; completed:number[];
  replies:{a:string|null;f:string|null}; diagnosis:{failure:boolean;reply:string|null};
  legacy?:{chapterVersion:1;step:number;completed:number[];replies:{a:string|null;e:string|null}};
}
const digest=(v:unknown)=>v===null||typeof v==='string'&&/^sha256-v1:[a-f0-9]{64}$/.test(v);
const steps=(v:unknown,max:number):v is number[]=>Array.isArray(v)&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=max)&&new Set(v).size===v.length;
export function readRouterProgress(value:unknown,draftId:string):RouterProgress {
  if(!value||typeof value!=='object')throw Error('Incompatible router chapter progress.');
  const p=value as RouterProgress;
  const old=value as Omit<RouterProgress,'schemaVersion'|'chapterVersion'|'replies'>&{schemaVersion:number;chapterVersion:number;replies:{a:string|null;e:string|null}};
  const common=p.chapterId===ROUTER_CHAPTER.id&&p.draftId===draftId&&typeof p.pcC==='string'&&!!p.pcC&&['continue','direct'].includes(p.source)&&typeof p.prepared==='boolean'&&Number.isInteger(p.step);
  if(common&&old.schemaVersion===1&&old.chapterVersion===1&&old.step>=1&&old.step<=6&&steps(old.completed,6)&&old.replies&&digest(old.replies.a)&&digest(old.replies.e)) {
    return {schemaVersion:2,chapterVersion:2,chapterId:p.chapterId,draftId,pcC:p.pcC,source:p.source,prepared:p.prepared,step:Math.min(p.step,6),completed:p.completed.filter(n=>n<=5),replies:{a:null,f:null},diagnosis:{failure:false,reply:null},
      legacy:{chapterVersion:1,step:p.step,completed:[...p.completed],replies:structuredClone(old.replies)}};
  }
  if(!common||p.schemaVersion!==2||p.chapterVersion!==2||p.step<1||p.step>8||!steps(p.completed,8)||!p.replies||!digest(p.replies.a)||!digest(p.replies.f)||!p.diagnosis||typeof p.diagnosis.failure!=='boolean'||!digest(p.diagnosis.reply)||
    p.legacy&&(!steps(p.legacy.completed,6)||p.legacy.chapterVersion!==1||!Number.isInteger(p.legacy.step)||p.legacy.step<1||p.legacy.step>6||!p.legacy.replies||!digest(p.legacy.replies.a)||!digest(p.legacy.replies.e)))throw Error('Incompatible router chapter progress.');
  return structuredClone(p);
}
/** Same repository meta CAS and topology-before-evidence ordering as Chapter 1. */
export class RouterProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
  async load(draftId: string) {
    const result = await this.repository.getMeta(ROUTER_PROGRESS_PREFIX + draftId);
    if (!result.ok) throw Error(result.error.code);
    const record = result.value ? readRouterProgress(result.value.value, draftId) : null;
    this.revisions.set(draftId, result.value?.revision ?? null);
    return record;
  }
  save(record: RouterProgress): Promise<void> {
    const snapshot = structuredClone(record);
    const work = this.tail.then(async () => {
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) throw Error('Draft is unavailable.');
      const flushed = await this.sessions.flush(snapshot.draftId);
      if (!flushed.ok) throw Error(flushed.error.code);
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) throw Error('Draft is unavailable.');
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const saved = await this.repository.setMeta({ key: ROUTER_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: this.revisions.get(snapshot.draftId)!, value: snapshot as unknown as MetaValue }, { signal: this.abort.signal });
      if (!saved.ok) throw Error(saved.error.code);
      this.revisions.set(snapshot.draftId, saved.value.revision);
    });
    this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
