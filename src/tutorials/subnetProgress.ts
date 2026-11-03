import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue } from '../projects/types';
import { tutorialFingerprint } from './tutorialProgress';
import { SUBNET_CHAPTER, SUBNET_PC_ID } from './subnetChapter';

export const SUBNET_PROGRESS_PREFIX = 'guided:subnet-mask:v1:draft:';
export interface SubnetProgress {
  schemaVersion: 1;
  chapterId: 'subnet-mask';
  draftId: string;
  pcD: typeof SUBNET_PC_ID;
  pcC: string;
  baseFingerprint: string;
  prepared: boolean;
  visible: boolean;
  step: number; // Human-facing 1–5, independent of Chapter 1's eight steps.
  answer: string;
  inspected: boolean;
  answerAccepted: boolean;
  demoClaimed: boolean;
  demoPassed: boolean;
  unreachable: boolean;
  replies: { b: string | null; c: string | null };
}
const digest = (v: unknown): v is string => typeof v === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(v);
export function readSubnetProgress(value: unknown, draftId: string): SubnetProgress {
  if (!value || typeof value !== 'object') throw Error('Incompatible subnet chapter progress.');
  const p = value as SubnetProgress;
  if (p.schemaVersion !== 1 || p.chapterId !== SUBNET_CHAPTER.id || p.draftId !== draftId || p.pcD !== SUBNET_PC_ID || typeof p.pcC !== 'string' || !p.pcC || !digest(p.baseFingerprint) ||
    !Number.isInteger(p.step) || p.step < 1 || p.step > SUBNET_CHAPTER.steps || typeof p.answer !== 'string' || p.answer.length > 100 ||
    [p.prepared, p.visible, p.inspected, p.answerAccepted, p.demoClaimed, p.demoPassed, p.unreachable].some(v => typeof v !== 'boolean') ||
    !p.replies || ![p.replies.b, p.replies.c].every(v => v === null || digest(v)) ||
    p.answerAccepted && (!p.inspected || p.answer.trim() !== '255.255.255.240') || p.demoPassed && !p.demoClaimed || p.unreachable && !p.demoPassed ||
    (p.replies.b || p.replies.c) && !p.unreachable) throw Error('Incompatible subnet chapter progress.');
  return structuredClone(p);
}
export async function newSubnetProgress(draftId: string, pcC: string, signature: string): Promise<SubnetProgress> {
  return { schemaVersion: 1, chapterId: SUBNET_CHAPTER.id, draftId, pcC, pcD: SUBNET_PC_ID, baseFingerprint: await tutorialFingerprint(signature),
    prepared: false, visible: true, step: 1, answer: '255.255.', inspected: false, answerAccepted: false, demoClaimed: false, demoPassed: false, unreachable: false, replies: { b: null, c: null } };
}
/** Same repository meta CAS and topology-before-evidence ordering as Chapter 1. */
export class SubnetProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
  async load(draftId: string) {
    const result = await this.repository.getMeta(SUBNET_PROGRESS_PREFIX + draftId);
    if (!result.ok) throw Error(result.error.code);
    const record = result.value ? readSubnetProgress(result.value.value, draftId) : null;
    this.revisions.set(draftId, result.value?.revision ?? null);
    return record;
  }
  save(record: SubnetProgress): Promise<void> {
    const snapshot = structuredClone(record);
    const work = this.tail.then(async () => {
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) throw Error('Draft is unavailable.');
      const flushed = await this.sessions.flush(snapshot.draftId);
      if (!flushed.ok) throw Error(flushed.error.code);
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) throw Error('Draft is unavailable.');
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const saved = await this.repository.setMeta({ key: SUBNET_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: this.revisions.get(snapshot.draftId)!, value: snapshot as unknown as MetaValue }, { signal: this.abort.signal });
      if (!saved.ok) throw Error(saved.error.code);
      this.revisions.set(snapshot.draftId, saved.value.revision);
    });
    this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
