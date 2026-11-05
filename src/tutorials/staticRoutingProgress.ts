import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue } from '../projects/types';
import { STATIC_CHAPTER, STATIC_PAIRS, type StaticPair, type StaticExtensionIdentity } from './staticRoutingChapter';

export const STATIC_PROGRESS_PREFIX = 'guided:static-routing:v1:draft:';
export type MissingRouter = 'r1' | 'r2' | 'r3' | 'none';
export interface StaticRoutingProgress {
  schemaVersion: 1; chapterId: 'static-routing'; chapterVersion: 1; draftId: string; attemptId: string;
  prepared: boolean; stage: 'line' | 'expanding' | 'lan-c'; step: number; completed: number[];
  investigated: string | null; missingAnswer: MissingRouter | null; extension: StaticExtensionIdentity | null;
  lineReplies: Record<'ab' | 'ba', string | null>; finalReplies: Record<StaticPair, string | null>;
}
export const emptyStaticReplies = (): StaticRoutingProgress['finalReplies'] => ({ ab: null, ba: null, ac: null, ca: null, bc: null, cb: null });
export const staticFinalProved = (p: StaticRoutingProgress) => p.stage === 'lan-c' && STATIC_PAIRS.every(key => !!p.finalReplies[key] && p.finalReplies[key] === p.finalReplies.ab);
const digest = (v: unknown) => v === null || typeof v === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(v);
const mac = (v: unknown) => typeof v === 'string' && /^([a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(v);
export function readStaticRoutingProgress(value: unknown, draftId: string): StaticRoutingProgress {
  const p = value as StaticRoutingProgress;
  if (!p || p.schemaVersion !== 1 || p.chapterId !== STATIC_CHAPTER.id || p.chapterVersion !== STATIC_CHAPTER.version || p.draftId !== draftId || typeof p.attemptId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.attemptId) ||
      typeof p.prepared !== 'boolean' || !['line', 'expanding', 'lan-c'].includes(p.stage) || !Number.isInteger(p.step) || p.step < 1 || p.step > 8 ||
      !Array.isArray(p.completed) || p.completed.some(n => !Number.isInteger(n) || n < 1 || n > 8) || new Set(p.completed).size !== p.completed.length ||
      !digest(p.investigated) || !(p.missingAnswer === null || ['r1', 'r2', 'r3', 'none'].includes(p.missingAnswer)) ||
      !p.lineReplies || !['ab', 'ba'].every(key => digest(p.lineReplies[key as 'ab'])) || !p.finalReplies || !STATIC_PAIRS.every(key => digest(p.finalReplies[key])) ||
      !(p.extension === null || mac(p.extension?.pcMac) && Array.isArray(p.extension.switchMacs) && p.extension.switchMacs.length === 8 && p.extension.switchMacs.every(mac)) ||
      !p.prepared && (p.stage !== 'line' || p.step !== 1 || p.completed.length !== 0 || p.investigated !== null || p.missingAnswer !== null) ||
      p.stage !== 'lan-c' && (p.step > 5 || p.extension !== null || p.completed.some(n => n > 5)) || p.stage === 'expanding' && p.step !== 5 || p.stage === 'lan-c' && !p.extension ||
      p.completed.includes(1) && !p.investigated || p.completed.includes(2) && !p.missingAnswer || p.completed.includes(5) && (!p.lineReplies.ab || !p.lineReplies.ba) || p.completed.includes(8) && !staticFinalProved(p)) throw Error('Incompatible static routing chapter progress.');
  return structuredClone(p);
}
/** Same topology-before-evidence ordering and CAS used by the other chapters. */
export class StaticRoutingProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
  async load(id: string) {
    const result = await this.repository.getMeta(STATIC_PROGRESS_PREFIX + id);
    if (!result.ok) throw Error(result.error.code);
    const record = result.value ? readStaticRoutingProgress(result.value.value, id) : null;
    this.revisions.set(id, result.value?.revision ?? null); return record;
  }
  save(record: StaticRoutingProgress): Promise<void> {
    const snapshot = structuredClone(record);
    const work = this.tail.then(async () => {
      const available = () => !this.abort.signal.aborted && this.sessions.getState().drafts.some(d => d.id === snapshot.draftId);
      if (!available()) throw Error('Draft unavailable.');
      const flushed = await this.sessions.flush(snapshot.draftId); if (!flushed.ok) throw Error(flushed.error.code);
      if (!available()) throw Error('Draft unavailable.');
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const result = await this.repository.setMeta({ key: STATIC_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: this.revisions.get(snapshot.draftId)!, value: snapshot as unknown as MetaValue }, { signal: this.abort.signal });
      if (!result.ok) throw Error(result.error.code); this.revisions.set(snapshot.draftId, result.value.revision);
    });
    this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
