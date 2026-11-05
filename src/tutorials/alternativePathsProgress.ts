import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue } from '../projects/types';
import { NEIGHBOR_TESTS, type NeighborTest, type AlternativePcIdentity } from './alternativePathsChapter';

export const ALTERNATIVE_PROGRESS_PREFIX = 'guided:alternative-paths:v1:draft:';
export interface AlternativePathsProgress {
  schemaVersion: 1; chapterId: 'alternative-paths'; chapterVersion: 1; draftId: string; attemptId: string;
  prepared: boolean; stage: 'triangle' | 'adding-pcs' | 'lans'; step: number; completed: number[];
  extension: AlternativePcIdentity | null; neighbors: Record<NeighborTest, string | null>;
  remoteUnderstood: boolean; hopUnderstood: boolean; lpmUnderstood: boolean;
  viaReplies: Record<'ab' | 'ba', string | null>; viaBaseline: string | null; failure: string | null;
  directReplies: Record<'ab' | 'ba', string | null>;
}
export const emptyNeighborProofs = () => Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, null])) as AlternativePathsProgress['neighbors'];
const digest = (value: unknown) => value === null || typeof value === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(value);
const mac = (value: unknown) => typeof value === 'string' && /^([a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value);
export const alternativeFinalProved = (p: AlternativePathsProgress) => p.stage === 'lans' && !!p.viaBaseline && !!p.failure && !!p.directReplies.ab && p.directReplies.ab === p.directReplies.ba;
export function readAlternativeProgress(value: unknown, id: string): AlternativePathsProgress {
  const p = value as AlternativePathsProgress;
  if (!p || p.schemaVersion !== 1 || p.chapterId !== 'alternative-paths' || p.chapterVersion !== 1 || p.draftId !== id || typeof p.attemptId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.attemptId) ||
      typeof p.prepared !== 'boolean' || !['triangle', 'adding-pcs', 'lans'].includes(p.stage) || !Number.isInteger(p.step) || p.step < 1 || p.step > 8 || !Array.isArray(p.completed) || p.completed.some(n => !Number.isInteger(n) || n < 1 || n > 8) || new Set(p.completed).size !== p.completed.length ||
      !p.neighbors || !NEIGHBOR_TESTS.every(test => digest(p.neighbors[test.key])) || !p.viaReplies || !digest(p.viaReplies.ab) || !digest(p.viaReplies.ba) || !p.directReplies || !digest(p.directReplies.ab) || !digest(p.directReplies.ba) || !digest(p.viaBaseline) || !digest(p.failure) ||
      !['remoteUnderstood', 'hopUnderstood', 'lpmUnderstood'].every(key => typeof p[key as 'remoteUnderstood'] === 'boolean') || !(p.extension === null || mac(p.extension?.a) && mac(p.extension?.b)) ||
      !p.prepared && (p.stage !== 'triangle' || p.step !== 1 || p.completed.length > 0) || p.stage !== 'lans' && (p.extension !== null || p.step > 3 || p.completed.some(step => step > 3)) || p.stage === 'adding-pcs' && p.step !== 3 || p.stage === 'lans' && !p.extension ||
      p.completed.includes(2) && !NEIGHBOR_TESTS.every(test => !!p.neighbors[test.key] && p.neighbors[test.key] === p.neighbors.n12) || p.completed.includes(3) && !p.remoteUnderstood || p.completed.includes(5) && (!p.viaReplies.ab || p.viaReplies.ab !== p.viaReplies.ba) ||
      p.completed.includes(6) && (!p.hopUnderstood || !p.lpmUnderstood || !p.viaBaseline) || p.completed.includes(7) && !p.failure || p.completed.includes(8) && !alternativeFinalProved(p)) throw Error('Incompatible alternative paths progress.');
  return structuredClone(p);
}
/** Same repository/CAS and topology-before-evidence order as other chapters. */
export class AlternativePathsProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve(); private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
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
    }); this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
