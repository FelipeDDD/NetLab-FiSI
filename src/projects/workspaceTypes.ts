import type { ProjectDocument, ProjectSnapshot } from './types';

export const WORKSPACE_RECORD_VERSION = 1;
export const WORKSPACE_PREFIX = 'workspace:v1:';
export const DRAFT_PREFIX = WORKSPACE_PREFIX + 'draft:';
export const SESSION_PREFIX = WORKSPACE_PREFIX + 'session:';

export interface DraftVersion { revision: number; editSequence: number }
export interface DraftSavedBase {
  planId: string;
  planRevision: number;
  planName: string;
  saveId: string;
  savedAt: number;
  /** Exact canonical baseline, independent of later plan edits or checkpoints. */
  documentJson: string;
}
interface DraftIdentity extends DraftVersion {
  schemaVersion: 1;
  kind: 'topology-draft';
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}
export interface OpenDraft extends DraftIdentity {
  state: 'open';
  document: ProjectDocument;
  base: DraftSavedBase | null;
  /** Pending manual Save, even though the draft itself is durably persisted. */
  dirty: boolean;
}
export interface ClosedDraft extends DraftIdentity {
  state: 'closed';
  closedAt: number;
  /** No document, baseline, runtime state or form text remains in a tombstone. */
}
export type DraftRecord = OpenDraft | ClosedDraft;

export interface SessionRecord {
  schemaVersion: 1;
  kind: 'topology-session';
  id: string;
  revision: number;
  draftIds: string[];
  activeDraftId: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface SessionSnapshot { session: SessionRecord; drafts: OpenDraft[] }
export interface DraftAcknowledgement { draftId: string; revision: number; editSequence: number }
export interface DraftWriteResult { draft: OpenDraft; acknowledgement: DraftAcknowledgement }
export interface SessionDraftResult extends DraftWriteResult { session: SessionRecord }
export interface DraftSaveResult extends DraftWriteResult { plan: ProjectSnapshot }
export interface DraftCloseResult { session: SessionRecord; draft: ClosedDraft }

export interface CreateSessionInput {
  id?: string;
  initialTab?: { kind: 'new'; document: ProjectDocument; id?: string } | { kind: 'plan'; planId: string; id?: string };
}
export interface CreateDraftInput { id?: string; document: ProjectDocument; activate?: boolean }
export interface DraftUpdateInput { expectedRevision: number; editSequence: number; document: ProjectDocument }
export interface SessionLayoutInput {
  draftIds?: readonly string[];
  activeDraftId?: string | null;
  /** Refuse focusing a document changed since the controller prepared it. */
  expectedActiveDraftRevision?: number;
}

export type WorkspaceError =
  | { code: 'draft-conflict' | 'session-conflict'; id: string; expectedRevision: number; actualRevision: number; message: string }
  | { code: 'draft-not-found' | 'session-not-found' | 'draft-closed' | 'draft-not-saved' | 'unsaved-draft'; id: string; message: string }
  | { code: 'stale-edit'; draftId: string; receivedSequence: number; currentSequence: number; message: string };

/** An old acknowledgement may advance the known storage revision without
 * confirming newer local edits. Never equate durable draft storage with Save. */
export function assessDraftAcknowledgement(ack: DraftAcknowledgement, local: {
  draftId: string; editSequence: number; knownRevision: number; isOpen: boolean;
}): { acceptRevision: boolean; isCurrentContent: boolean } {
  const acceptRevision = local.isOpen && ack.draftId === local.draftId && ack.revision >= local.knownRevision;
  return { acceptRevision, isCurrentContent: acceptRevision && ack.editSequence === local.editSequence };
}
