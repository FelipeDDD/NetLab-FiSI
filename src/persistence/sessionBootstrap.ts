import type { ProjectRepository } from '../projects/repository';
import { createProjectId, isObject, isProjectId } from '../projects/projectDocument';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import { migrateLegacyAutosave } from '../projects/legacyMigration';
import type { LegacyMigrationOptions, LegacyMigrationResult } from '../projects/legacyTypes';
import type { CreateSessionInput, SessionSnapshot } from '../projects/workspaceTypes';
import type { MetaRecord, MetaValue, ProjectDocument } from '../projects/types';
import type { SessionResult } from './sessionTypes';

export const SESSION_RESUME_KEY = 'session-controller:v1:resume';
export interface SessionBootstrapOptions {
  sessionId?: string;
  /** Explicitly supplied capability and opt-in; never read global localStorage. */
  legacy?: Pick<LegacyMigrationOptions, 'storage' | 'origin'> & { migrate: boolean };
}
interface ResumeRecord {
  schemaVersion: 1;
  kind: 'workspace-controller-resume';
  sessionId: string;
  initialTab?: CreateSessionInput['initialTab'];
}

function decode(record: MetaRecord): SessionResult<ResumeRecord> {
  const value = record.value;
  if (!isObject(value) || value.schemaVersion !== 1 || value.kind !== 'workspace-controller-resume' || !isProjectId(value.sessionId)) return { ok: false, error: { code: 'corrupt-data', message: 'Invalid session resume reservation; no session was replaced.' } };
  if (value.initialTab !== undefined) {
    const tab = value.initialTab;
    if (!isObject(tab) || !isProjectId(tab.id) || (tab.kind !== 'new' && tab.kind !== 'plan') || (tab.kind === 'plan' && !isProjectId(tab.planId))) return { ok: false, error: { code: 'corrupt-data', message: 'Invalid initial tab reservation.' } };
    if (tab.kind === 'new') {
      try { encodeDraftDocument(tab.document); }
      catch { return { ok: false, error: { code: 'corrupt-data', message: 'Unreadable first-session reservation; its original record was preserved.' } }; }
    }
  }
  return { ok: true, value: value as unknown as ResumeRecord };
}

/** Reservation first, then idempotent creation. An interrupted/competing first
 * boot reuses the same IDs and source document, never another empty session. */
export async function bootstrapSession(repository: ProjectRepository, fallback: ProjectDocument, options: SessionBootstrapOptions = {}): Promise<SessionResult<{ snapshot: SessionSnapshot; migration?: LegacyMigrationResult }>> {
  if (options.sessionId) {
    const snapshot = await repository.workspace.restoreSession(options.sessionId);
    return snapshot.ok ? { ok: true, value: { snapshot: snapshot.value } } : snapshot;
  }
  let marker = await repository.getMeta(SESSION_RESUME_KEY);
  if (!marker.ok) return marker;
  let migration: LegacyMigrationResult | undefined;
  if (!marker.value) {
    const sessions = await repository.workspace.listSessions(); if (!sessions.ok) return sessions;
    const previous = sessions.value[0];
    let initialTab: CreateSessionInput['initialTab'];
    if (!previous) {
      if (options.legacy?.migrate) {
        migration = await migrateLegacyAutosave({ repository, storage: options.legacy.storage, origin: options.legacy.origin });
        if (migration.status === 'failed' || migration.status === 'rejected' || ((migration.status === 'migrated' || migration.status === 'already-migrated') && (migration.deleted || migration.sourceAfter.state !== 'unchanged'))) return { ok: false, error: { code: 'legacy-recovery-required', message: 'Legacy migration requires explicit recovery; the current network and original storage remain intact.' } };
      }
      initialTab = migration?.status === 'migrated' || migration?.status === 'already-migrated'
        ? { kind: 'plan', planId: migration.project.project.id, id: createProjectId() }
        : { kind: 'new', document: encodeDraftDocument(fallback).document, id: createProjectId() };
    }
    const value: ResumeRecord = { schemaVersion: 1, kind: 'workspace-controller-resume', sessionId: previous?.id ?? createProjectId(), ...(initialTab ? { initialTab } : {}) };
    const reserved = await repository.setMeta({ key: SESSION_RESUME_KEY, expectedRevision: null, value: value as unknown as MetaValue });
    if (!reserved.ok && reserved.error.code !== 'meta-conflict') return reserved;
    marker = await repository.getMeta(SESSION_RESUME_KEY); if (!marker.ok) return marker;
  }
  if (!marker.value) return { ok: false, error: { code: 'corrupt-data', message: 'Missing session resume reservation.' } };
  const decoded = decode(marker.value); if (!decoded.ok) return decoded;
  const reservation = decoded.value;
  let snapshot = await repository.workspace.restoreSession(reservation.sessionId);
  if (!snapshot.ok && snapshot.error.code === 'session-not-found' && reservation.initialTab) {
    snapshot = await repository.workspace.createSession({ id: reservation.sessionId, initialTab: reservation.initialTab });
    if (!snapshot.ok && snapshot.error.code === 'already-exists') snapshot = await repository.workspace.restoreSession(reservation.sessionId);
  }
  return snapshot.ok ? { ok: true, value: { snapshot: snapshot.value, ...(migration ? { migration } : {}) } } : snapshot;
}
