import type { ProjectRepository } from '../projects/repository';
import type { SessionController } from '../persistence/sessionController';
import type { MetaValue } from '../projects/types';
import { isProjectId } from '../projects/projectDocument';
import { LPM_IDS, LPM_LONG, LPM_SHORT } from './lpmChapter';

export const LPM_PROGRESS_PREFIX = 'guided:lpm:v1:draft:';
export interface LpmReceipt { fingerprint: string; request: string[]; reply: string[] }
export interface LpmProgress {
  schemaVersion: 1; chapterId: 'longest-prefix-match'; chapterVersion: 1; draftId: string; attemptId: string;
  step: number; completed: number[]; inspected: boolean; compared: boolean; rule: boolean;
  identities: Record<string, string[]>;
  initial: LpmReceipt | null; short: LpmReceipt | null; restored: LpmReceipt | null;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function receipt(value: LpmReceipt | null, path: string[]) {
  return value === null || !!value && /^sha256-v1:[a-f0-9]{64}$/.test(value.fingerprint) && same(value.request, path) && same(value.reply, [...LPM_SHORT].reverse());
}
export function readLpmProgress(value: unknown, id: string): LpmProgress {
  const p = value as LpmProgress;
  if (!p || p.schemaVersion !== 1 || p.chapterId !== 'longest-prefix-match' || p.chapterVersion !== 1 || p.draftId !== id || !isProjectId(p.attemptId) || !Number.isInteger(p.step) || p.step < 1 || p.step > 5 ||
    !Array.isArray(p.completed) || p.completed.some(n => !Number.isInteger(n) || n < 1 || n > 5) || new Set(p.completed).size !== p.completed.length ||
    typeof p.inspected !== 'boolean' || typeof p.compared !== 'boolean' || typeof p.rule !== 'boolean' || !p.identities || !same(Object.keys(p.identities).sort(), Object.values(LPM_IDS).sort()) ||
    Object.values(p.identities).some(macs => !Array.isArray(macs) || !macs.length || macs.some(mac => typeof mac !== 'string' || !/^([a-f\d]{2}:){5}[a-f\d]{2}$/i.test(mac))) ||
    !receipt(p.initial, LPM_LONG) || !receipt(p.short, LPM_SHORT) || !receipt(p.restored, LPM_LONG) ||
    p.completed.some(n => !(n === 1 ? p.initial : n === 2 ? p.initial && p.inspected && p.compared : n === 3 ? p.initial && p.compared && p.rule : n === 4 ? p.rule && p.short : p.short && p.restored)) ||
    p.completed.some(n => Array.from({ length: n - 1 }, (_, i) => i + 1).some(previous => !p.completed.includes(previous)))) throw Error('Incompatible LPM progress. Topology preserved.');
  return structuredClone(p);
}
/** Same durable-draft-first, serialized CAS contract as the existing chapters. */
export class LpmProgressStore {
  private revisions = new Map<string, number | null>(); private tail: Promise<unknown> = Promise.resolve(); private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
  async load(id: string) {
    const result = await this.repository.getMeta(LPM_PROGRESS_PREFIX + id); if (!result.ok) throw Error(result.error.code);
    const record = result.value ? readLpmProgress(result.value.value, id) : null;
    this.revisions.set(id, result.value?.revision ?? null); return record;
  }
  save(record: LpmProgress) {
    const snapshot = readLpmProgress(record, record.draftId);
    const work = this.tail.then(async () => {
      const available = () => !this.abort.signal.aborted && this.sessions.getState().drafts.some(d => d.id === snapshot.draftId);
      if (!available()) throw Error('Draft unavailable.');
      const flushed = await this.sessions.flush(snapshot.draftId); if (!flushed.ok) throw Error(flushed.error.code);
      if (!available()) throw Error('Draft unavailable.');
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const saved = await this.repository.setMeta({ key: LPM_PROGRESS_PREFIX + snapshot.draftId, expectedRevision: this.revisions.get(snapshot.draftId)!, value: snapshot as unknown as MetaValue }, { signal: this.abort.signal });
      if (!saved.ok) throw Error(saved.error.code); this.revisions.set(snapshot.draftId, saved.value.revision);
    }); this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
