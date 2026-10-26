import type { AppearanceSaveFile } from '../terminalAppearance';
import type { WorkspaceError } from './workspaceTypes';

export const PROJECT_DATABASE_NAME = 'netlab-projects';
export const PROJECT_DATABASE_VERSION = 1;
export const PROJECT_DOCUMENT_VERSION = 1;
export const DEFAULT_CHECKPOINT_LIMIT = 5;
export const MAX_CHECKPOINT_LIMIT = 100;

export interface ProjectDocument {
  schemaVersion: typeof PROJECT_DOCUMENT_VERSION;
  topology: AppearanceSaveFile;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
  revision: number;
  deletedAt: number | null;
}

export interface ProjectSnapshot {
  project: ProjectMetadata;
  document: ProjectDocument;
}

export interface StoredProjectDocument {
  projectId: string;
  revision: number;
  document: ProjectDocument;
}

export type CheckpointReason = 'initial' | 'update' | 'rename' | 'delete' | 'restore-project' | 'restore-checkpoint';
export interface CheckpointMetadata {
  projectId: string;
  revision: number;
  savedAt: number;
  name: string;
  reason: CheckpointReason;
}
export interface ProjectCheckpoint extends CheckpointMetadata {
  document: ProjectDocument;
}

export type MetaValue = null | boolean | number | string | MetaValue[] | { [key: string]: MetaValue };
export interface MetaRecord { key: string; revision: number; value: MetaValue }
export interface MetaMutation { key: string; expectedRevision: number | null; value: MetaValue }

export interface ProjectRecoveryState {
  snapshot: ProjectSnapshot;
  /** Same order as the requested controlKeys. */
  controls: (MetaRecord | null)[];
  checkpoint: ProjectCheckpoint | null;
}

export type RepositoryError =
  | WorkspaceError
  | { code: 'conflict'; projectId: string; expectedRevision: number; current: ProjectMetadata; message: string }
  | { code: 'deleted'; current: ProjectMetadata; message: string }
  | { code: 'not-found'; projectId: string; message: string }
  | { code: 'checkpoint-not-found'; projectId: string; revision: number; message: string }
  | { code: 'meta-conflict'; key: string; expectedRevision: number | null; current: MetaRecord | null; message: string }
  | { code: 'invalid-input' | 'invalid-document' | 'incompatible-document' | 'incompatible-database' | 'corrupt-data' |
      'already-exists' | 'quota-exceeded' | 'unavailable' | 'blocked' | 'aborted' | 'closed' | 'version-changed' | 'storage-error'; message: string };

export type RepositoryResult<T> = { ok: true; value: T } | { ok: false; error: RepositoryError };
export interface WriteOptions { signal?: AbortSignal }
export interface CreateProjectInput {
  /** Optional preallocated UUID permits a future atomic project + control marker. */
  id?: string;
  name: string;
  document: ProjectDocument;
  control?: readonly MetaMutation[];
  /** Atomically retain revision 1 as a checkpoint and create current revision 2. */
  initialCheckpoint?: boolean;
}
export interface RepositoryOptions {
  databaseName?: string;
  checkpointLimit?: number;
  factory?: Pick<IDBFactory, 'open'> | null;
  now?: () => number;
  openTimeoutMs?: number;
  onConnectionStateChange?: (state: 'closed' | 'version-changed' | 'unavailable') => void;
}
