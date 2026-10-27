import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import type { MetaValue } from '../projects/types';
import type { Network } from '../engine/network';
import { runChecks, type CheckResult } from '../labs/checker';
import { BETA_EXERCISES, betaChecks } from './beta';

export const EXERCISE_PROGRESS_KEY = 'exercises:beta:v1';
export interface Attempt { id: string; draftId: string; exerciseId: string; contentVersion: number; startedAt: number }
export interface Completion { attemptId: string; contentVersion: number; completedAt: number }
export interface ExerciseProgress { schemaVersion: 1; attempts: Record<string, Attempt>; completed: Record<string, Completion> }
export interface ExerciseRuntime {
  network(): Network;
  signature(): string;
  subscribe(listener: () => void): () => void;
  pendingForms(): boolean;
  run(): void;
}
export interface ExerciseState {
  ready: boolean; busy: boolean; checking: boolean; saving: boolean;
  progress: ExerciseProgress; results: Record<string, CheckResult>; message: string; error: string;
}
const empty = (): ExerciseProgress => ({ schemaVersion: 1, attempts: {}, completed: {} });
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const stamp = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const version = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
export function readExerciseProgress(value: unknown): ExerciseProgress {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.attempts) || !isObject(value.completed)) throw Error('Übungsdaten sind inkompatibel. Vorhandene Daten bleiben erhalten.');
  for (const [key, a] of Object.entries(value.attempts)) {
    if (!isObject(a) || a.draftId !== key || !text(a.id) || !text(a.exerciseId) || !version(a.contentVersion) || !stamp(a.startedAt)) throw Error('Ungültige Übungszuordnung. Vorhandene Daten bleiben erhalten.');
  }
  for (const c of Object.values(value.completed)) if (!isObject(c) || !text(c.attemptId) || !version(c.contentVersion) || !stamp(c.completedAt)) throw Error('Ungültiger Übungsfortschritt. Vorhandene Daten bleiben erhalten.');
  return structuredClone(value) as unknown as ExerciseProgress;
}
type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'openDocument' | 'switchDraft' | 'flush' | 'hasPendingOperations'>;
type Repository = Pick<ProjectRepository, 'getMeta' | 'setMeta'>;
interface Ticket { draftId: string; attempt: Attempt; net: Network; signature: string; sequence: number; abort: AbortController }

/** Small Beta coordinator; topology ownership stays entirely with SessionController. */
export class ExerciseController {
  private state: ExerciseState = { ready: false, busy: false, checking: false, saving: false, progress: empty(), results: {}, message: '', error: '' };
  private listeners = new Set<() => void>();
  private releases: (() => void)[] = [];
  private ticket?: Ticket;
  private resultTicket?: Ticket;
  private pendingAttempt?: Attempt;
  private disposed = false;
  private lifetime = new AbortController();
  constructor(private sessions: Sessions, private repository: Repository, private runtime: ExerciseRuntime) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(patch: Partial<ExerciseState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn());
  }
  async initialize() {
    this.releases.push(this.sessions.subscribe(this.invalidate), this.runtime.subscribe(this.invalidate));
    await this.refresh();
  }
  async refresh() {
    if (this.state.busy || this.disposed) return;
    try {
      const result = await this.repository.getMeta(EXERCISE_PROGRESS_KEY);
      if (!result.ok) throw Error('Übungsfortschritt konnte nicht geladen werden: ' + result.error.code);
      this.update({ progress: result.value ? readExerciseProgress(result.value.value) : empty(), ready: true, error: '' });
    } catch (e) { this.update({ ready: false, error: String((e as Error).message) }); }
  }
  activeAttempt() { return this.state.progress.attempts[this.sessions.getState().activeDraftId ?? '']; }
  resumable(exerciseId: string) {
    const open = new Set(this.sessions.getState().drafts.map(d => d.id));
    return Object.values(this.state.progress.attempts).filter(a => a.exerciseId === exerciseId && open.has(a.draftId))
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  }
  private async write(change: (progress: ExerciseProgress) => void, signal = this.lifetime.signal) {
    for (let retry = 0; retry < 3; retry++) {
      if (signal.aborted || this.disposed) throw Error('Vorgang abgebrochen. Bitte erneut überprüfen.');
      const current = await this.repository.getMeta(EXERCISE_PROGRESS_KEY);
      if (!current.ok) throw Error('Übungsfortschritt nicht gespeichert: ' + current.error.code);
      const next = current.value ? readExerciseProgress(current.value.value) : empty();
      change(next);
      const saved = await this.repository.setMeta({ key: EXERCISE_PROGRESS_KEY, expectedRevision: current.value?.revision ?? null, value: next as unknown as MetaValue }, { signal });
      if (saved.ok) { this.update({ progress: readExerciseProgress(saved.value.value) }); return; }
      if (saved.error.code !== 'meta-conflict') throw Error('Übungsfortschritt nicht gespeichert: ' + saved.error.code);
    }
    throw Error('Übungsfortschritt wurde in einem anderen Tab geändert. Bitte erneut versuchen.');
  }
  async start(exerciseId: string) {
    if (!this.state.ready || this.state.busy || this.sessions.hasPendingOperations()) return;
    const exercise = BETA_EXERCISES.find(e => e.id === exerciseId); if (!exercise) return;
    if (this.runtime.pendingForms()) { this.update({ error: 'Bitte zuerst offene Formulare übernehmen oder verwerfen.' }); return; }
    this.cancel(); this.update({ busy: true, error: '', results: {}, message: '' });
    try {
      const result = await this.sessions.openDocument({ schemaVersion: 1, topology: structuredClone(exercise.student.initialTopology) });
      if (!result.ok) throw Error('Übung konnte nicht geöffnet werden: ' + result.error.code);
      this.pendingAttempt = { id: crypto.randomUUID(), draftId: result.value, exerciseId, contentVersion: exercise.contentVersion, startedAt: Date.now() };
      await this.persistAttempt();
    } catch (e) { this.update({ error: (e as Error).message }); }
    finally { this.update({ busy: false }); }
  }
  private async persistAttempt() {
    const attempt = this.pendingAttempt; if (!attempt) return;
    await this.write(p => { p.attempts[attempt.draftId] = attempt; });
    this.pendingAttempt = undefined;
  }
  async retry() {
    if (!this.pendingAttempt) return this.refresh();
    this.update({ busy: true, error: '' });
    try { await this.persistAttempt(); } catch (e) { this.update({ error: (e as Error).message }); }
    finally { this.update({ busy: false }); }
  }
  async resume(draftId: string) {
    if (this.state.busy || this.sessions.hasPendingOperations()) return;
    this.update({ busy: true, error: '' });
    try {
      const result = await this.sessions.switchDraft(draftId);
      if (!result.ok) throw Error('Fortsetzen nicht möglich. Offene Formulare zuerst übernehmen. (' + result.error.code + ')');
    } catch (e) { this.update({ error: (e as Error).message }); }
    finally { this.update({ busy: false }); }
  }
  private valid(t: Ticket) {
    const s = this.sessions.getState();
    return !this.disposed && !t.abort.signal.aborted && s.activeDraftId === t.draftId && this.runtime.network() === t.net &&
      s.drafts.find(d => d.id === t.draftId)?.editSequence === t.sequence && !this.runtime.pendingForms() && this.runtime.signature() === t.signature;
  }
  private invalidate = () => {
    const t = this.ticket ?? this.resultTicket;
    if (t && !this.valid(t)) this.cancel('Konfiguration oder Plan geändert. Bitte erneut überprüfen.');
  };
  cancel(message = '') {
    this.ticket?.abort.abort(); this.ticket = undefined; this.resultTicket = undefined;
    this.update({ checking: false, results: {}, message });
  }
  async verify() {
    if (!this.state.ready || this.state.busy || this.state.checking || this.sessions.hasPendingOperations()) return;
    const attempt = this.activeAttempt(), exercise = BETA_EXERCISES.find(e => e.id === attempt?.exerciseId);
    if (!attempt || !exercise || exercise.contentVersion !== attempt.contentVersion) return;
    if (this.runtime.pendingForms()) { this.update({ error: 'Bitte zuerst offene Formulare übernehmen.' }); return; }
    this.cancel(); this.update({ busy: true, error: '', message: '' });
    try {
      const flushed = await this.sessions.flush();
      if (!flushed.ok) throw Error('Entwurf konnte nicht gesichert werden: ' + flushed.error.code);
      if (this.sessions.getState().activeDraftId !== attempt.draftId) return;
      const ticket: Ticket = { draftId: attempt.draftId, attempt, net: this.runtime.network(), signature: this.runtime.signature(),
        sequence: this.sessions.getState().drafts.find(d => d.id === attempt.draftId)!.editSequence, abort: new AbortController() };
      this.ticket = ticket; this.update({ checking: true }); this.runtime.run();
      const checks = betaChecks[exercise.id];
      runChecks(ticket.net, checks.map(a => ({ id: a.id, label: a.id, check: a.check })), result => {
        if (this.valid(ticket)) this.update({ results: { ...this.state.results, [result.id]: result } }); else this.invalidate();
      }, () => { void this.finish(ticket); }, () => {
        if (this.valid(ticket)) return true;
        this.invalidate(); return false;
      });
    } catch (e) { this.update({ error: (e as Error).message }); }
    finally { this.update({ busy: false }); }
  }
  private async finish(t: Ticket) {
    if (!this.valid(t)) { this.invalidate(); return; }
    const checks = betaChecks[t.attempt.exerciseId];
    if (!checks.every(a => this.state.results[a.id]?.pass)) {
      this.ticket = undefined; this.resultTicket = t;
      this.update({ checking: false, message: 'Noch nicht alle Anforderungen erfüllt. Korrigieren und erneut überprüfen.' }); return;
    }
    this.update({ busy: true, saving: true, message: 'Anforderungen erfüllt. Abschluss wird gespeichert…' });
    try {
      await this.write(p => {
        if (!this.valid(t)) throw Error('Konfiguration geändert. Bitte erneut überprüfen.');
        if (p.attempts[t.draftId]?.id !== t.attempt.id) throw Error('Versuchszuordnung wurde geändert.');
        // Keep the earlier earned completion through retries and later edits.
        p.completed[t.attempt.exerciseId] ??= { attemptId: t.attempt.id, contentVersion: t.attempt.contentVersion, completedAt: Date.now() };
      }, t.abort.signal);
      if (this.valid(t)) { this.ticket = undefined; this.resultTicket = t; this.update({ message: 'Abgeschlossen – lokal gespeichert.' }); }
    } catch (e) {
      if (!t.abort.signal.aborted) { this.resultTicket = t; this.update({ error: (e as Error).message, message: 'Keine bestätigte Speicherung. Bitte erneut überprüfen.' }); }
    } finally { this.ticket = undefined; this.update({ checking: false, busy: false, saving: false }); }
  }
  dispose() {
    this.cancel(); this.disposed = true; this.lifetime.abort(); this.releases.forEach(fn => fn()); this.listeners.clear();
  }
}
