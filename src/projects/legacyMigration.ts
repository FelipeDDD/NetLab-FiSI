import { isObject, isProjectId, isTimestamp, createProjectId } from './projectDocument';
import { inspectLegacyTopology } from './legacyInspection';
import { fingerprintLegacyText, identifyLegacySource, readLegacyAutosave } from './legacySource';
import { LEGACY_AUTOSAVE_KEY, type LegacyArchive, type LegacyCaptured, type LegacyDiagnostic, type LegacyMigrationMarker,
  type LegacyMigrationOptions, type LegacyMigrationRepository, type LegacyMigrationResult, type LegacySource, type LegacySourceState } from './legacyTypes';
import type { MetaRecord, MetaValue, ProjectRecoveryState, RepositoryError } from './types';

class MigrationIntegrityError extends Error {}
const integrity = (message: string): never => { throw new MigrationIntegrityError(message); };
const sameSource = (a: LegacySource, b: LegacySource) => a.storage === b.storage && a.key === b.key && a.origin === b.origin;
const repositoryDiagnostic = (error: RepositoryError): LegacyDiagnostic => ({ code: error.code === 'aborted' ? 'aborted' : 'repository-failed', message: error.message, repositoryError: error });
const cancelled = (): LegacyDiagnostic => ({ code: 'aborted', message: 'Migration interrupted. Any committed records remain available for verification on retry.' });

function archiveValue(value: unknown): LegacyArchive {
  if (!isObject(value) || value.schemaVersion !== 1 || value.kind !== 'legacy-autosave-archive' || !isObject(value.source) || value.source.storage !== 'localStorage' || value.source.key !== LEGACY_AUTOSAVE_KEY || typeof value.source.origin !== 'string' || !value.source.origin.trim() || typeof value.rawText !== 'string' || typeof value.fingerprint !== 'string' || !isTimestamp(value.capturedAt) || (value.diagnostic !== null && (!isObject(value.diagnostic) || typeof value.diagnostic.code !== 'string' || typeof value.diagnostic.message !== 'string'))) integrity('Invalid legacy archive record.');
  return value as unknown as LegacyArchive;
}

function archiveFor(value: unknown, original: LegacyCaptured): LegacyArchive {
  const archive = archiveValue(value);
  if (!sameSource(archive.source, original.source) || archive.fingerprint !== original.fingerprint || archive.rawText !== original.rawText) integrity('Legacy archive identity/content mismatch; no records were overwritten.');
  return archive;
}

function markerFor(value: unknown, original: LegacyCaptured, documentFingerprint: string): LegacyMigrationMarker {
  if (!isObject(value) || value.schemaVersion !== 1 || value.kind !== 'legacy-autosave-migration' || value.state !== 'committed' || !isObject(value.source) ||
      !sameSource(value.source as unknown as LegacySource, original.source) || value.fingerprint !== original.fingerprint || value.archiveKey !== original.archiveKey || !isProjectId(value.projectId) ||
      value.initialRevision !== 2 || value.checkpointRevision !== 1 || value.documentFingerprint !== documentFingerprint || !isTimestamp(value.committedAt)) integrity('Invalid or incompatible migration marker; refusing to recreate a project.');
  return value as unknown as LegacyMigrationMarker;
}

function sourceAfter(options: LegacyMigrationOptions, original: LegacyCaptured): LegacySourceState {
  try {
    const latest = options.storage.getItem(LEGACY_AUTOSAVE_KEY);
    if (latest !== null && typeof latest !== 'string') throw new Error('Storage returned a non-string value.');
    return latest === original.rawText ? { state: 'unchanged' } : { state: 'changed', latestRawText: latest };
  } catch (error) { return { state: 'unavailable', message: String(error) }; }
}

async function verify(options: LegacyMigrationOptions, original: LegacyCaptured, marker: LegacyMigrationMarker,
  documentFingerprint: string, status: 'migrated' | 'already-migrated'): Promise<LegacyMigrationResult> {
  const failed = (diagnostic: LegacyDiagnostic): LegacyMigrationResult => ({ status: 'failed', stage: 'verify', original, diagnostic, committedProjectId: marker.projectId });
  if (options.signal?.aborted) return failed(cancelled());
  const readback = await options.repository.loadProjectRecoveryState(marker.projectId, {
    controlKeys: [original.markerKey, original.archiveKey], checkpointRevision: 1, includeDeleted: true,
  });
  if (!readback.ok) return failed(repositoryDiagnostic(readback.error));
  try {
    const { snapshot, controls, checkpoint }: ProjectRecoveryState = readback.value;
    const verifiedMarker = markerFor(controls[0]?.value, original, documentFingerprint);
    if (verifiedMarker.projectId !== marker.projectId || snapshot.project.id !== marker.projectId || snapshot.project.revision < 2) integrity('Project and migration marker disagree.');
    archiveFor(controls[1]?.value, original);
    if (snapshot.project.revision === 2) {
      if (snapshot.project.deletedAt !== null || !checkpoint || await fingerprintLegacyText(JSON.stringify(snapshot.document)) !== documentFingerprint) integrity('Initial project verification failed.');
    }
    // Later edits can prune checkpoint 1. The immutable raw archive/marker still
    // identifies migration, including a deleted project; never recreate it.
    if (checkpoint && (checkpoint.reason !== 'initial' || await fingerprintLegacyText(JSON.stringify(checkpoint.document)) !== documentFingerprint)) integrity('Initial checkpoint verification failed.');
    if (options.signal?.aborted) return failed(cancelled());
    return { status, original, marker: verifiedMarker, project: snapshot, deleted: snapshot.project.deletedAt !== null, sourceAfter: sourceAfter(options, original) };
  } catch (error) { return failed({ code: 'integrity-error', message: error instanceof Error ? error.message : String(error) }); }
}

async function preserveRejected(options: LegacyMigrationOptions, original: LegacyCaptured, diagnostic: LegacyDiagnostic, now: number): Promise<LegacyMigrationResult> {
  const failed = (error: RepositoryError): LegacyMigrationResult => ({ status: 'failed', stage: 'archive', original,
    sourceDiagnostic: diagnostic, diagnostic: { ...repositoryDiagnostic(error), message: diagnostic.message + ' Original is still available in memory/legacy storage. ' + error.message } });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) return { status: 'failed', stage: 'archive', original, diagnostic: cancelled() };
    const existing = await options.repository.getMeta(original.archiveKey);
    if (!existing.ok) return failed(existing.error);
    if (existing.value) return { status: 'rejected', original, diagnostic, archive: archiveFor(existing.value.value, original) };
    const archive: LegacyArchive = { schemaVersion: 1, kind: 'legacy-autosave-archive', source: original.source,
      rawText: original.rawText, fingerprint: original.fingerprint, capturedAt: now, diagnostic };
    const saved = await options.repository.setMeta({ key: original.archiveKey, expectedRevision: null, value: archive as unknown as MetaValue }, { signal: options.signal });
    if (saved.ok) {
      const readback = await options.repository.getMeta(original.archiveKey);
      if (!readback.ok) return failed(readback.error);
      return { status: 'rejected', original, diagnostic, archive: archiveFor(readback.value?.value, original) };
    }
    if (saved.error.code !== 'meta-conflict') return failed(saved.error);
  }
  return { status: 'failed', stage: 'archive', original, diagnostic: { code: 'integrity-error', message: 'Archive contention; retry without changing the legacy source.' } };
}

/** Controlled, dependency-injected migration. No global storage, location,
 * database opening, network activation or production boot integration. */
export async function migrateLegacyAutosave(options: LegacyMigrationOptions): Promise<LegacyMigrationResult> {
  if (options.signal?.aborted) return { status: 'failed', stage: 'read', diagnostic: cancelled() };
  const read = readLegacyAutosave(options.storage, options.origin);
  if (read.status === 'absent') return read;
  if (read.status === 'failed') return { status: 'failed', stage: 'read', diagnostic: read.diagnostic };
  let original: LegacyCaptured;
  try { original = await identifyLegacySource(read.original); }
  catch (error) { return { status: 'failed', stage: 'fingerprint', original: read.original, diagnostic: { code: 'fingerprint-unavailable', message: String(error) } }; }
  let committedProjectId: string | undefined;
  try {
    const now = (options.now ?? Date.now)();
    if (!isTimestamp(now)) return { status: 'failed', stage: 'read', original, diagnostic: { code: 'invalid-input', message: 'Invalid migration timestamp.' } };
    const inspected = inspectLegacyTopology(original.rawText);
    if (!inspected.ok) return await preserveRejected(options, original, inspected.diagnostic, now);
    let documentFingerprint: string;
    try { documentFingerprint = await fingerprintLegacyText(JSON.stringify(inspected.document)); }
    catch (error) { return { status: 'failed', stage: 'fingerprint', original, diagnostic: { code: 'fingerprint-unavailable', message: String(error) } }; }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (options.signal?.aborted) return { status: 'failed', stage: 'commit', original, diagnostic: cancelled() };
      const previous = await options.repository.getMeta(original.markerKey);
      if (!previous.ok) return { status: 'failed', stage: 'commit', original, diagnostic: repositoryDiagnostic(previous.error) };
      if (previous.value) return await verify(options, original, markerFor(previous.value.value, original, documentFingerprint), documentFingerprint, 'already-migrated');
      const existingArchive = await options.repository.getMeta(original.archiveKey);
      if (!existingArchive.ok) return { status: 'failed', stage: 'archive', original, diagnostic: repositoryDiagnostic(existingArchive.error) };
      const archive: LegacyArchive = existingArchive.value ? archiveFor(existingArchive.value.value, original) : {
        schemaVersion: 1, kind: 'legacy-autosave-archive', source: original.source, rawText: original.rawText,
        fingerprint: original.fingerprint, capturedAt: now, diagnostic: null,
      };
      const id = createProjectId();
      const marker: LegacyMigrationMarker = { schemaVersion: 1, kind: 'legacy-autosave-migration', state: 'committed', source: original.source,
        fingerprint: original.fingerprint, archiveKey: original.archiveKey, projectId: id, initialRevision: 2, checkpointRevision: 1,
        documentFingerprint, committedAt: now };
      const created = await options.repository.createProject({ id, name: options.projectName ?? 'Topologia recuperada', document: inspected.document, initialCheckpoint: true,
        control: [
          { key: original.archiveKey, expectedRevision: existingArchive.value?.revision ?? null, value: archive as unknown as MetaValue },
          { key: original.markerKey, expectedRevision: null, value: marker as unknown as MetaValue },
        ],
      }, { signal: options.signal });
      if (created.ok) {
        committedProjectId = id;
        return await verify(options, original, marker, documentFingerprint, 'migrated');
      }
      if (created.error.code !== 'meta-conflict' && created.error.code !== 'already-exists') return { status: 'failed', stage: 'commit', original, diagnostic: repositoryDiagnostic(created.error) };
      // Another connection may have committed the complete bundle. Re-read its
      // marker on the next iteration; a failed attempt never leaves a new project.
    }
    return { status: 'failed', stage: 'commit', original, diagnostic: { code: 'integrity-error', message: 'Migration contention; retry is safe.' } };
  } catch (error) {
    return { status: 'failed', stage: committedProjectId ? 'verify' : 'commit', original, committedProjectId,
      diagnostic: { code: error instanceof MigrationIntegrityError ? 'integrity-error' : 'repository-failed', message: error instanceof Error ? error.message : String(error) } };
  }
}

/** Recover a persisted raw archive independently of localStorage or the current
 * project. Integrity failures never authorize overwriting an existing record. */
export async function loadLegacyArchive(repository: Pick<LegacyMigrationRepository, 'getMeta'>, key: string): Promise<
  { ok: true; archive: LegacyArchive } | { ok: false; diagnostic: LegacyDiagnostic }> {
  try {
    const read: Awaited<ReturnType<LegacyMigrationRepository['getMeta']>> = await repository.getMeta(key);
    if (!read.ok) return { ok: false, diagnostic: repositoryDiagnostic(read.error) };
    const archive = archiveValue((read.value as MetaRecord | null)?.value);
    const identity = await identifyLegacySource(archive);
    if (identity.archiveKey !== key || identity.fingerprint !== archive.fingerprint) integrity('Raw archive checksum mismatch.');
    return { ok: true, archive };
  } catch (error) { return { ok: false, diagnostic: { code: 'integrity-error', message: error instanceof Error ? error.message : String(error) } }; }
}
