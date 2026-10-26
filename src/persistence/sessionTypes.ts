import type { PreparedTopology } from './topologyDocument';
import type { OpenDraft, SessionRecord } from '../projects/workspaceTypes';
import type { ProjectDocument, RepositoryError } from '../projects/types';

export interface WorkspaceIdentity { sessionId: string; draftId: string | null }
export interface WorkspacePersistenceSink { changed(): void; flush(): void }
/** Explicit capability; creating/importing an adapter never claims the store. */
export interface SessionRuntime {
  capture(): ProjectDocument;
  identity(): WorkspaceIdentity | null;
  connect(sink: WorkspacePersistenceSink): () => void;
  activate(prepared: PreparedTopology, identity: WorkspaceIdentity): void;
  hasPendingForms(): boolean;
}
export type SessionError = RepositoryError | {
  code: 'not-started' | 'disposed' | 'runtime-changed' | 'unapplied-forms' | 'legacy-recovery-required'; message: string;
};
export type SessionResult<T> = { ok: true; value: T } | { ok: false; error: SessionError };
export interface DraftControllerState {
  id: string;
  revision: number;
  editSequence: number;
  persistedSequence: number;
  pendingPersistence: boolean;
  saving: boolean;
  manualSavePending: boolean;
  base: OpenDraft['base'];
  error: SessionError | null;
}
export interface SessionControllerState {
  phase: 'idle' | 'starting' | 'ready' | 'disposed';
  session: SessionRecord | null;
  activeDraftId: string | null;
  drafts: DraftControllerState[];
  error: SessionError | null;
  pendingShare: boolean;
}
