import type { ProjectRepository } from './repository';
import type { ProjectDocument, ProjectSnapshot, RepositoryError } from './types';

export const LEGACY_AUTOSAVE_KEY = 'netsim:autosave:v1';
export const LEGACY_MIGRATION_VERSION = 1;
export const LEGACY_FINGERPRINT_ALGORITHM = 'sha256-utf16le-v1';

export interface LegacySource { storage: 'localStorage'; key: typeof LEGACY_AUTOSAVE_KEY; origin: string }
export interface LegacyOriginal { source: LegacySource; rawText: string }
export interface LegacyCaptured extends LegacyOriginal {
  fingerprint: string;
  archiveKey: string;
  markerKey: string;
}
export interface LegacyDiagnostic {
  code: 'invalid-input' | 'read-failed' | 'fingerprint-unavailable' | 'invalid-json' | 'unsupported-version' | 'invalid-document' |
    'lossy-document' | 'repository-failed' | 'integrity-error' | 'aborted';
  message: string;
  repositoryError?: RepositoryError;
}
export interface LegacyArchive extends LegacyOriginal {
  schemaVersion: 1;
  kind: 'legacy-autosave-archive';
  fingerprint: string;
  capturedAt: number;
  diagnostic: LegacyDiagnostic | null;
}
export interface LegacyMigrationMarker {
  schemaVersion: 1;
  kind: 'legacy-autosave-migration';
  state: 'committed';
  source: LegacySource;
  fingerprint: string;
  archiveKey: string;
  projectId: string;
  initialRevision: 2;
  checkpointRevision: 1;
  documentFingerprint: string;
  committedAt: number;
}
export type LegacyInspection = { ok: true; document: ProjectDocument } | { ok: false; diagnostic: LegacyDiagnostic };
export type LegacySourceState = { state: 'unchanged' } | { state: 'changed'; latestRawText: string | null } | { state: 'unavailable'; message: string };
export type LegacyMigrationResult =
  | { status: 'absent'; source: LegacySource }
  | { status: 'rejected'; original: LegacyCaptured; archive: LegacyArchive; diagnostic: LegacyDiagnostic }
  | { status: 'failed'; stage: 'read' | 'fingerprint' | 'archive' | 'commit' | 'verify'; diagnostic: LegacyDiagnostic;
      original?: LegacyOriginal; committedProjectId?: string; sourceDiagnostic?: LegacyDiagnostic }
  | { status: 'migrated' | 'already-migrated'; original: LegacyCaptured; marker: LegacyMigrationMarker;
      project: ProjectSnapshot; deleted: boolean; sourceAfter: LegacySourceState };

export type LegacyMigrationRepository = Pick<ProjectRepository, 'getMeta' | 'setMeta' | 'createProject' | 'loadProjectRecoveryState'>;
export interface LegacyMigrationOptions {
  repository: LegacyMigrationRepository;
  /** Explicit read-only capability; the service never obtains global storage. */
  storage: Pick<Storage, 'getItem'>;
  origin: string;
  projectName?: string;
  signal?: AbortSignal;
  now?: () => number;
}
