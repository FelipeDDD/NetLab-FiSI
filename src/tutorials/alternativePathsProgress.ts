import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue, ProjectDocument } from '../projects/types';
import { ALTERNATIVE_IDS, ALTERNATIVE_TOTAL, NEIGHBOR_TESTS, type NeighborTest, type AlternativePcIdentity } from './alternativePathsChapter';
import { emptyLpm, emptyExperiment, type LpmProgress } from './alternativeLpm';
import { readAlternativeEntry, ALTERNATIVE_ENTRY_C, type AlternativeEntry } from './alternativeEntryContract';
import { rememberAlternativeCompletion, selectAlternativeAttempt, alternativeOpeningSelection } from './alternativeLearning';

export const ALTERNATIVE_PROGRESS_PREFIX = 'guided:alternative-paths:v1:draft:';
export interface AlternativePathsProgress {
  schemaVersion: 1 | 2; chapterId: 'alternative-paths'; chapterVersion: 4; draftId: string; attemptId: string;
  prepared: boolean; stage: 'triangle' | 'adding-pcs' | 'lans'; step: number; completed: number[];
  extension: AlternativePcIdentity | null; neighbors: Record<NeighborTest, string | null>;
  remoteUnderstood: boolean; hopUnderstood: boolean; lpmUnderstood: boolean;
  viaReplies: Record<'ab' | 'ba', string | null>; viaBaseline: string | null; failure: string | null;
  directReplies: Record<'ab' | 'ba', string | null>;
  investigated: string | null; returnInvestigated: string | null;
  lpm: LpmProgress;
  storm: 'pending' | 'applied' | 'adopted' | 'legacy';
  entry?: AlternativeEntry;
  /** Configuration baseline supplied by Part 4, never an A/B ping witness. */
  scenarioBaseline?: string;
}
export const emptyNeighborProofs = () => Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, null])) as AlternativePathsProgress['neighbors'];
export function newAlternativeProgress(draftId: string): AlternativePathsProgress {
  return { schemaVersion:1,chapterId:'alternative-paths',chapterVersion:4,draftId,attemptId:crypto.randomUUID(),prepared:false,stage:'triangle',step:1,completed:[],extension:null,
    neighbors:emptyNeighborProofs(),remoteUnderstood:false,hopUnderstood:false,lpmUnderstood:false,viaReplies:{ab:null,ba:null},viaBaseline:null,failure:null,directReplies:{ab:null,ba:null},
    investigated:null,returnInvestigated:null,lpm:emptyLpm(),storm:'pending' };
}
const digest = (value: unknown) => value === null || typeof value === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(value);
const mac = (value: unknown) => typeof value === 'string' && /^([a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value);
export const alternativeFailureBaseline = (p: AlternativePathsProgress) => p.entry?.point==='part-4' ? p.scenarioBaseline??null : p.viaBaseline;
export const alternativeFinalProved = (p: AlternativePathsProgress) => p.stage === 'lans' && !!alternativeFailureBaseline(p) && !!p.failure && !!p.directReplies.ab && p.directReplies.ab === p.directReplies.ba;
/** Historical credit, not a claim about the current topology or a new packet. */
export const alternativeStepCompleted = (p: AlternativePathsProgress, step = p.step) =>
  p.completed.includes(step) && (step !== ALTERNATIVE_TOTAL || alternativeFinalProved(p)) ||
  p.lpm.legacy && (step === 14 || step === 15) || p.lpm.experiment.legacy && step >= 16 && step <= 19;
export function readAlternativeProgress(value: unknown, id: string): AlternativePathsProgress {
  const raw = value as AlternativePathsProgress | (Omit<AlternativePathsProgress, 'chapterVersion' | 'investigated' | 'returnInvestigated'> & { chapterVersion: 1 });
  const version = (raw as { chapterVersion?: number })?.chapterVersion;
  const legacy = version === 1, total = legacy ? 8 : version === 2 ? 17 : version === 3 ? 20 : ALTERNATIVE_TOTAL, triangleEnd = legacy ? 3 : 4;
  // Validate the original contract before mapping any evidence. The key and
  // envelope stay unchanged, including checkpoints and CAS revision tracking.
  const p = raw as AlternativePathsProgress;
  const entry = p?.entry === undefined ? undefined : readAlternativeEntry(p.entry);
  if (entry && (version !== 4 || !p.prepared || p.stage !== 'lans' || p.step < entry.firstTask || p.completed?.some(n => n < entry.firstTask) ||
      p.remoteUnderstood || Object.values(p.neighbors ?? {}).some(Boolean) || p.lpm?.legacy || p.lpm?.experiment?.legacy ||
      entry.firstTask >= 14 && (p.hopUnderstood || p.investigated || p.returnInvestigated || p.viaReplies?.ab || p.viaReplies?.ba))) throw Error('Incompatible supplied alternative progress.');
  if(entry?.point==='part-4' ? typeof p.scenarioBaseline!=='string'||!digest(p.scenarioBaseline)||p.viaBaseline!==null||p.lpmUnderstood||
      p.lpm?.stage!=='ready'||p.lpm?.pc?.id!==ALTERNATIVE_ENTRY_C||p.lpm?.localReply!==null||p.lpm?.pathReply!==null||
      p.lpm?.experiment?.r2!==null||p.lpm?.experiment?.broad!==null||p.lpm?.experiment?.specific!==null||!['pending','applied','adopted'].includes(p.storm)
      : p?.scenarioBaseline!==undefined) throw Error('Incompatible scenario baseline.');
  if (!p || ![1,2].includes(p.schemaVersion) || (p.schemaVersion===2)!==!!entry || p.chapterId !== 'alternative-paths' || ![1, 2, 3, 4].includes(version!) || p.draftId !== id || typeof p.attemptId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.attemptId) ||
      typeof p.prepared !== 'boolean' || !['triangle', 'adding-pcs', 'lans'].includes(p.stage) || !Number.isInteger(p.step) || p.step < 1 || p.step > total || !Array.isArray(p.completed) || p.completed.some(n => !Number.isInteger(n) || n < 1 || n > total) || new Set(p.completed).size !== p.completed.length ||
      !p.neighbors || !NEIGHBOR_TESTS.every(test => digest(p.neighbors[test.key])) || !p.viaReplies || !digest(p.viaReplies.ab) || !digest(p.viaReplies.ba) || !p.directReplies || !digest(p.directReplies.ab) || !digest(p.directReplies.ba) || !digest(p.viaBaseline) || !digest(p.failure) ||
      !['remoteUnderstood', 'hopUnderstood', 'lpmUnderstood'].every(key => typeof p[key as 'remoteUnderstood'] === 'boolean') || !(p.extension === null || mac(p.extension?.a) && mac(p.extension?.b)) ||
      !p.prepared && (p.stage !== 'triangle' || p.step !== 1 || p.completed.length > 0) || p.stage !== 'lans' && (p.extension !== null || p.step > triangleEnd || p.completed.some(step => step > triangleEnd)) || p.stage === 'adding-pcs' && p.step !== triangleEnd || p.stage === 'lans' && !p.extension) throw Error('Incompatible alternative paths progress.');
  if (legacy) {
    if (p.completed.includes(2) && !NEIGHBOR_TESTS.every(test => !!p.neighbors[test.key] && p.neighbors[test.key] === p.neighbors.n12) || p.completed.includes(3) && !p.remoteUnderstood || p.completed.includes(5) && (!p.viaReplies.ab || p.viaReplies.ab !== p.viaReplies.ba) ||
        p.completed.includes(6) && (!p.hopUnderstood || !p.lpmUnderstood || !p.viaBaseline) || p.completed.includes(7) && !p.failure || p.completed.includes(8) && !alternativeFinalProved(p)) throw Error('Incompatible alternative paths progress.');
    const migrated = structuredClone(p), map: number[][] = [[], [], [1, 2, 3], [4], [5, 6], [7, 8, 9, 10, 11, 12], [13, 14], [15], [16, 17]];
    (migrated as unknown as { chapterVersion: number }).chapterVersion = 2;
    migrated.completed = [...new Set(p.completed.flatMap(n => map[n]))].sort((a, b) => a - b);
    migrated.step = [0, 1, 1, 4, 5, 7, 13, 15, p.completed.includes(8) ? 17 : 16][p.step];
    // A proven full via-R2 request/reply also witnesses the two intermediate
    // observations, even when the learner configured the network in advance.
    migrated.investigated = migrated.returnInvestigated = p.completed.includes(5) ? p.viaReplies.ab : null;
    return readAlternativeProgress(migrated, id);
  }
  if (!digest(p.investigated) || !digest(p.returnInvestigated) ||
      [1, 2, 3].some(step => p.completed.includes(step) && !NEIGHBOR_TESTS.slice((step - 1) * 2, step * 2).every(test => !!p.neighbors[test.key])) ||
      p.completed.includes(4) && !p.remoteUnderstood || p.completed.includes(7) && !p.investigated || p.completed.includes(10) && !p.returnInvestigated ||
      p.completed.includes(12) && (!p.viaReplies.ab || p.viaReplies.ab !== p.viaReplies.ba) || p.completed.includes(13) && !p.hopUnderstood ||
      version === 2 && (p.completed.includes(14) && (!p.lpmUnderstood || !p.viaBaseline) || p.completed.includes(15) && !p.failure || p.completed.includes(17) && !alternativeFinalProved(p))) throw Error('Incompatible alternative paths progress.');
  if (version === 2) {
    const migrated = structuredClone(p);
    (migrated as unknown as { chapterVersion: number }).chapterVersion = 3;
    migrated.lpm = { ...emptyLpm(), legacy: p.completed.includes(14) };
    migrated.step = p.step <= 14 ? p.step : p.step + 3;
    migrated.completed = p.completed.filter(n => n !== 14).map(n => n < 14 ? n : n + 3);
    return readAlternativeProgress(migrated, id);
  }
  const l = p.lpm;
  if (!l || !['unprepared', 'preparing', 'ready'].includes(l.stage) || typeof l.legacy !== 'boolean' || !digest(l.localReply) || !digest(l.pathReply) ||
      !(l.baseline === null || Array.isArray(l.baseline) && l.baseline.every(s => typeof s === 'string' && s.length > 0) && new Set(l.baseline).size === l.baseline.length) ||
      !(l.pc === null || typeof l.pc.id === 'string' && l.pc.id.length > 0 && mac(l.pc.mac) && !!l.baseline && !l.baseline.includes(l.pc.id)) ||
      l.stage === 'unprepared' && (l.baseline !== null || l.pc !== null || l.localReply !== null || l.pathReply !== null) || l.stage !== 'unprepared' && (!l.baseline || !Object.values(ALTERNATIVE_IDS).every(id => l.baseline!.includes(id))) ||
      l.stage === 'preparing' && (l.pc !== null || l.localReply !== null || l.pathReply !== null) || (l.localReply !== null || l.pathReply !== null) && !l.pc ||
      l.legacy && (!p.lpmUnderstood || !p.viaBaseline || l.stage !== 'unprepared') ||
      p.completed.includes(14) && !l.pc || p.completed.includes(15) && !l.localReply || p.completed.includes(16) && l.stage !== 'ready' ||
      version === 3 && (p.completed.includes(17) && (!l.pathReply || !p.lpmUnderstood || !p.viaBaseline) || p.completed.includes(18) && !p.failure || p.completed.includes(20) && !alternativeFinalProved(p))) throw Error('Incompatible alternative paths progress.');
  if (version === 3) {
    const migrated = structuredClone(p);
    migrated.chapterVersion = 4;
    delete (migrated as Partial<AlternativePathsProgress>).storm;
    migrated.lpm.experiment = { ...emptyExperiment(), legacy: l.legacy || p.completed.includes(17) };
    migrated.step = p.step <= 16 ? p.step : p.step === 17 ? migrated.lpm.experiment.legacy ? 19 : 16 : p.step + 2;
    // The old combined configuration task proved neither R2's ping nor /24's
    // path. Preserve completed LPM as explicit historical credit, not receipts.
    migrated.completed = p.completed.filter(n => n !== 16 && n !== 17).map(n => n >= 18 ? n + 2 : n);
    return readAlternativeProgress(migrated, id);
  }
  const e = l.experiment;
  const receipt = (v: typeof e.r2) => v === null || !!v && typeof v.hash === 'string' && digest(v.hash) && Array.isArray(v.reply) && v.reply.length >= 2 && v.reply.every(id => typeof id === 'string' && id.length > 0) && v.reply[0] === l.pc?.id;
  if (!e || typeof e.legacy !== 'boolean' || !receipt(e.r2) || !receipt(e.broad) || !receipt(e.specific) ||
      [e.r2, e.broad, e.specific].some(Boolean) && (l.stage !== 'ready' || !l.pc) ||
      e.r2 && e.r2.reply.at(-1) !== ALTERNATIVE_IDS.r2 || [e.broad, e.specific].some(v => v && v.reply.at(-1) !== ALTERNATIVE_IDS.a) ||
      l.legacy && !e.legacy || e.legacy && (!p.lpmUnderstood || !p.viaBaseline || e.r2 !== null || e.broad !== null || e.specific !== null) ||
      !e.legacy && (p.completed.includes(16) && !e.r2 || p.completed.includes(17) && !e.broad || p.completed.includes(18) && !e.specific ||
      p.completed.includes(19) && (!e.r2 || !e.broad || !e.specific || !p.lpmUnderstood || !p.viaBaseline)) ||
      p.completed.includes(20) && !p.failure || p.completed.includes(22) && !alternativeFinalProved(p)) throw Error('Incompatible alternative paths progress.');
  // Older attempts already in Part 4 must never receive a retroactive incident.
  const storm = p.storm === undefined ? (p.step >= 20 || p.failure || p.completed.some(n => n >= 20) ? 'legacy' : 'pending') : p.storm;
  if (!['pending', 'applied', 'adopted', 'legacy'].includes(storm) || storm === 'pending' && (p.failure || p.completed.some(n => n >= 20))) throw Error('Incompatible alternative paths progress.');
  return { ...structuredClone(p), storm };
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
