import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue, ProjectDocument } from '../projects/types';
import { ALTERNATIVE_TOTAL, NEIGHBOR_TESTS, type NeighborTest, type AlternativePcIdentity } from './alternativePathsChapter';
import { readAlternativeEntry, type AlternativeEntry } from './alternativeEntryContract';
import { rememberAlternativeCompletion, selectAlternativeAttempt, alternativeOpeningSelection } from './alternativeLearning';

export const ALTERNATIVE_PROGRESS_PREFIX = 'guided:alternative-paths:v5:draft:';
export const OLD_ALTERNATIVE_PROGRESS_PREFIX = 'guided:alternative-paths:v1:draft:';
export interface AlternativePathsProgress {
  schemaVersion: 1 | 2; chapterId: 'alternative-paths'; chapterVersion: 5; draftId: string; attemptId: string;
  prepared: boolean; stage: 'triangle' | 'adding-pcs' | 'lans'; step: number; completed: number[];
  extension: AlternativePcIdentity | null; neighbors: Record<NeighborTest, string | null>;
  remoteUnderstood: boolean; hopUnderstood: boolean;
  viaReplies: Record<'ab' | 'ba', string | null>; viaBaseline: string | null; failure: string | null;
  directReplies: Record<'ab' | 'ba', string | null>;
  investigated: string | null; returnInvestigated: string | null;
  storm: 'pending' | 'applied' | 'adopted'; entry?: AlternativeEntry; scenarioBaseline?: string;
}
export const emptyNeighborProofs = () => Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, null])) as AlternativePathsProgress['neighbors'];
export function newAlternativeProgress(draftId: string): AlternativePathsProgress {
  return {schemaVersion:1,chapterId:'alternative-paths',chapterVersion:5,draftId,attemptId:crypto.randomUUID(),prepared:false,stage:'triangle',step:1,completed:[],extension:null,
    neighbors:emptyNeighborProofs(),remoteUnderstood:false,hopUnderstood:false,viaReplies:{ab:null,ba:null},viaBaseline:null,failure:null,directReplies:{ab:null,ba:null},investigated:null,returnInvestigated:null,storm:'pending'};
}
const digest = (v: unknown) => v === null || typeof v === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(v);
const mac = (v: unknown) => typeof v === 'string' && /^([a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(v);
export const alternativeFailureBaseline = (p: AlternativePathsProgress) => p.entry?.point==='part-3' ? p.scenarioBaseline??null : p.viaBaseline;
export const alternativeFinalProved = (p: AlternativePathsProgress) => p.stage==='lans' && !!alternativeFailureBaseline(p) && !!p.failure && !!p.directReplies.ab && p.directReplies.ab===p.directReplies.ba;
export const alternativeStepCompleted = (p: AlternativePathsProgress, step=p.step) => p.completed.includes(step) && (step!==ALTERNATIVE_TOTAL || alternativeFinalProved(p));
/** v5 is isolated: old progress is neither migrated, deleted nor interpreted here. */
export function readAlternativeProgress(value: unknown, id: string): AlternativePathsProgress {
  const p=value as AlternativePathsProgress;
  if(!p||p.chapterVersion!==5||p.chapterId!=='alternative-paths'||![1,2].includes(p.schemaVersion)||p.draftId!==id||typeof p.attemptId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.attemptId)||
    typeof p.prepared!=='boolean'||!['triangle','adding-pcs','lans'].includes(p.stage)||!Number.isInteger(p.step)||p.step<1||p.step>16||!Array.isArray(p.completed)||p.completed.some(n=>!Number.isInteger(n)||n<1||n>16)||new Set(p.completed).size!==p.completed.length||
    !p.neighbors||!NEIGHBOR_TESTS.every(t=>digest(p.neighbors[t.key]))||!p.viaReplies||!digest(p.viaReplies.ab)||!digest(p.viaReplies.ba)||!p.directReplies||!digest(p.directReplies.ab)||!digest(p.directReplies.ba)||!digest(p.viaBaseline)||!digest(p.failure)||!digest(p.investigated)||!digest(p.returnInvestigated)||
    typeof p.remoteUnderstood!=='boolean'||typeof p.hopUnderstood!=='boolean'||!(p.extension===null||mac(p.extension?.a)&&mac(p.extension?.b))||!['pending','applied','adopted'].includes(p.storm)||
    !p.prepared&&(p.stage!=='triangle'||p.step!==1||p.completed.length>0)||p.stage!=='lans'&&(p.extension!==null||p.step>4||p.completed.some(n=>n>4))||p.stage==='adding-pcs'&&p.step!==4||p.stage==='lans'&&!p.extension)throw Error('Incompatible alternative paths progress.');
  const entry=p.entry===undefined?undefined:readAlternativeEntry(p.entry);
  if((p.schemaVersion===2)!==!!entry||entry&&(!p.prepared||p.stage!=='lans'||p.step<entry.firstTask||p.completed.some(n=>n<entry.firstTask)||p.remoteUnderstood||Object.values(p.neighbors).some(Boolean)||entry.point==='part-3'&&(p.hopUnderstood||p.investigated||p.returnInvestigated||Object.values(p.viaReplies).some(Boolean))))throw Error('Incompatible supplied alternative progress.');
  if(entry?.point==='part-3' ? typeof p.scenarioBaseline!=='string'||!digest(p.scenarioBaseline)||p.viaBaseline!==null : p.scenarioBaseline!==undefined)throw Error('Incompatible scenario baseline.');
  if([1,2,3].some(n=>p.completed.includes(n)&&!NEIGHBOR_TESTS.slice((n-1)*2,n*2).every(t=>!!p.neighbors[t.key]))||p.completed.includes(4)&&!p.remoteUnderstood||p.completed.includes(7)&&!p.investigated||p.completed.includes(10)&&!p.returnInvestigated||p.completed.includes(12)&&(!p.viaReplies.ab||p.viaReplies.ab!==p.viaReplies.ba)||p.completed.includes(13)&&(!p.hopUnderstood||!p.viaReplies.ab||p.viaReplies.ab!==p.viaReplies.ba)||
    p.step>=14&&!alternativeFailureBaseline(p)||p.completed.includes(14)&&!p.failure||p.completed.includes(16)&&!alternativeFinalProved(p)||p.storm==='pending'&&(p.failure||p.completed.some(n=>n>=14)))throw Error('Incompatible alternative evidence.');
  return structuredClone(p);
}
/** Same repository/CAS and topology-before-evidence order as other chapters. */
export class AlternativePathsProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve(); private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'> & Partial<Pick<SessionController, 'commitDocument'>>) {}
  /** One CAS transaction contains both the port state and the consumed marker. */
  commitStorm(record: AlternativePathsProgress, expected: ProjectDocument, document: ProjectDocument) {
    const snapshot = structuredClone(record);
    const work = this.tail.then(async () => {
      if (this.abort.signal.aborted || !this.sessions.commitDocument) throw Error('Atomic incident unavailable.');
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const revision = this.revisions.get(snapshot.draftId) ?? null;
      const result = await this.sessions.commitDocument({ draftId: snapshot.draftId, expected, document,
        control: [{ key: ALTERNATIVE_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: revision, value: snapshot as unknown as MetaValue }], guards: [] });
      if (!result.ok) throw Error(result.error.code);
      this.revisions.set(snapshot.draftId, (revision ?? 0) + 1);
    });
    this.tail = work.catch(() => {}); return work;
  }
  async isOldAttempt(id:string) {
    const result=await this.repository.getMeta(OLD_ALTERNATIVE_PROGRESS_PREFIX+id);if(!result.ok)throw Error(result.error.code);return !!result.value;
  }
  async load(id: string) {
    const result = await this.repository.getMeta(ALTERNATIVE_PROGRESS_PREFIX + id); if (!result.ok) throw Error(result.error.code);
    const record = result.value ? readAlternativeProgress(result.value.value, id) : null;
    this.revisions.set(id, result.value?.revision ?? null); return record;
  }
  save(record: AlternativePathsProgress) {
    const snapshot = structuredClone(record);
    const work = this.tail.then(async () => {
      const available = () => !this.abort.signal.aborted && this.sessions.getState().drafts.some(d => d.id === snapshot.draftId);
      if (!available()) throw Error('Draft unavailable.');
      const flushed = await this.sessions.flush(snapshot.draftId); if (!flushed.ok) throw Error(flushed.error.code);
      if (!available()) throw Error('Draft unavailable.'); if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const result = await this.repository.setMeta({ key: ALTERNATIVE_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: this.revisions.get(snapshot.draftId)!, value: snapshot as unknown as MetaValue }, { signal: this.abort.signal });
      if (!result.ok) throw Error(result.error.code); this.revisions.set(snapshot.draftId, result.value.revision);
      await rememberAlternativeCompletion(this.repository,snapshot.draftId);
    }); this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  async openingSelection(record:AlternativePathsProgress){await this.flush();return alternativeOpeningSelection(this.repository,record.draftId,record.attemptId);}
  selectCurrent(record:AlternativePathsProgress){
    const work=this.tail.then(async()=>{
      if(this.abort.signal.aborted)return;
      await rememberAlternativeCompletion(this.repository,record.draftId);
      await selectAlternativeAttempt(this.repository,record.draftId,record.attemptId,()=>!this.abort.signal.aborted&&this.sessions.getState().activeDraftId===record.draftId);
    });this.tail=work.catch(()=>{});return work;
  }
  dispose() { this.abort.abort(); }
}
