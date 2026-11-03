import type { ProjectRepository } from '../projects/repository';
import type { MetaValue } from '../projects/types';
import type { SessionController } from '../persistence/sessionController';
import { FIRST_CONNECTION, FIRST_DEVICES } from './firstConnection';

export const TUTORIAL_PROGRESS_PREFIX = 'guided:v1:draft:';
export interface TutorialSnapshot {
  draftId: string;
  startedAt: number;
  step: number;
  completed: number[];
  pcC: string | null;
  baseline: string[] | null;
  ipv4Applied: boolean;
  a: { signature: string; interrupted: boolean } | null;
  c: { signature: string; ended: boolean } | null;
}
export interface TutorialProgress {
  schemaVersion: 1;
  tutorialId: string;
  tutorialVersion: number;
  draftId: string;
  startedAt: number;
  step: number; // Human-facing 1–8; controller uses 0–7.
  completed: number[];
  devices: { a: string; sw: string; b: string; c: string | null };
  baseline: string[] | null;
  ipv4Applied: boolean;
  a: { fingerprint: string; interrupted: boolean } | null;
  c: { fingerprint: string; ended: boolean } | null;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const digest = (v: unknown) => typeof v === 'string' && /^sha256-v1:[a-f0-9]{64}$/.test(v);
export function readTutorialProgress(value: unknown, draftId: string): TutorialProgress {
  if (!object(value) || value.schemaVersion !== 1 || value.tutorialId !== FIRST_CONNECTION.id || value.tutorialVersion !== FIRST_CONNECTION.version || value.draftId !== draftId ||
    !Number.isSafeInteger(value.startedAt) || Number(value.startedAt) < 0 || !Number.isInteger(value.step) || Number(value.step) < 1 || Number(value.step) > FIRST_CONNECTION.steps.length ||
    !Array.isArray(value.completed) || value.completed.some(s => !Number.isInteger(s) || s < 1 || s > FIRST_CONNECTION.steps.length) || new Set(value.completed).size !== value.completed.length ||
    !object(value.devices) || value.devices.a !== FIRST_DEVICES.a || value.devices.sw !== FIRST_DEVICES.sw || value.devices.b !== FIRST_DEVICES.b ||
    !(value.devices.c === null || id(value.devices.c) && !Object.values(FIRST_DEVICES).includes(value.devices.c as typeof FIRST_DEVICES.a)) ||
    !(value.baseline === null || Array.isArray(value.baseline) && value.baseline.every(id)) || typeof value.ipv4Applied !== 'boolean' ||
    !(value.a === null || object(value.a) && digest(value.a.fingerprint) && typeof value.a.interrupted === 'boolean') ||
    !(value.c === null || object(value.c) && digest(value.c.fingerprint) && typeof value.c.ended === 'boolean')) throw Error('Incompatible tutorial progress. Topology is preserved.');
  const result = structuredClone(value) as unknown as TutorialProgress;
  if (result.a && (!result.completed.includes(3) || result.a.interrupted && !result.completed.includes(4)) ||
    result.ipv4Applied && (!result.devices.c || !result.completed.includes(7)) || result.c && (!result.devices.c || !result.completed.includes(8))) throw Error('Incomplete tutorial event history. Topology is preserved.');
  return result;
}
export async function tutorialFingerprint(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'sha256-v1:' + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function encodeTutorialProgress(snapshot: TutorialSnapshot): Promise<TutorialProgress> {
  return { schemaVersion: 1, tutorialId: FIRST_CONNECTION.id, tutorialVersion: FIRST_CONNECTION.version,
    draftId: snapshot.draftId, startedAt: snapshot.startedAt, step: snapshot.step + 1, completed: snapshot.completed,
    devices: { ...FIRST_DEVICES, c: snapshot.pcC }, baseline: snapshot.baseline, ipv4Applied: snapshot.ipv4Applied,
    a: snapshot.a && { fingerprint: await tutorialFingerprint(snapshot.a.signature), interrupted: snapshot.a.interrupted },
    c: snapshot.c && { fingerprint: await tutorialFingerprint(snapshot.c.signature), ended: snapshot.c.ended } };
}

/** Uses existing meta CAS and draft flushing. Never copies the topology or rebases a conflict. */
export class TutorialProgressStore {
  private revisions = new Map<string, number | null>();
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  constructor(private repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'>, private sessions: Pick<SessionController, 'flush' | 'getState'>) {}
  async load(draftId: string) {
    const result = await this.repository.getMeta(TUTORIAL_PROGRESS_PREFIX + draftId);
    if (!result.ok) throw Error(result.error.code);
    const progress = result.value ? readTutorialProgress(result.value.value, draftId) : null;
    this.revisions.set(draftId, result.value?.revision ?? null);
    return progress;
  }
  save(snapshot: TutorialSnapshot): Promise<void> {
    const work = this.tail.then(async () => {
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) return;
      // A durable topology precedes its historical event claims. On restore,
      // fingerprints independently reject claims for a different configuration.
      const flushed = await this.sessions.flush(snapshot.draftId);
      if (!flushed.ok) throw Error(flushed.error.code);
      if (this.abort.signal.aborted || !this.sessions.getState().drafts.some(d => d.id === snapshot.draftId)) return;
      if (!this.revisions.has(snapshot.draftId)) await this.load(snapshot.draftId);
      const value = await encodeTutorialProgress(snapshot);
      const saved = await this.repository.setMeta({ key: TUTORIAL_PROGRESS_PREFIX + snapshot.draftId,
        expectedRevision: this.revisions.get(snapshot.draftId)!, value: value as unknown as MetaValue }, { signal: this.abort.signal });
      if (!saved.ok) throw Error(saved.error.code);
      this.revisions.set(snapshot.draftId, saved.value.revision);
    });
    this.tail = work.catch(() => {}); return work;
  }
  async flush() { await this.tail; }
  dispose() { this.abort.abort(); }
}
