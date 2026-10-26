import { errorResult, fail } from './errors';
import { createProjectId, isProjectId, isRevision, projectName } from './projectDocument';
import { issueRequest, requestValue } from './transactions';
import { decodeDraft, decodeSession, encodeDraftDocument, savedBase, validateEditSequence, workspaceMeta } from './workspaceDocument';
import { DRAFT_PREFIX, SESSION_PREFIX, type ClosedDraft, type CreateDraftInput, type CreateSessionInput, type DraftCloseResult,
  type DraftRecord, type DraftSaveResult, type DraftUpdateInput, type DraftVersion, type DraftWriteResult, type OpenDraft,
  type SessionDraftResult, type SessionLayoutInput, type SessionRecord, type SessionSnapshot } from './workspaceTypes';
import type { CheckpointReason, ProjectDocument, ProjectMetadata, ProjectSnapshot, RepositoryResult, WriteOptions } from './types';

/** Internal bridge to the existing repository; never exposed as raw transactions
 * through the public workspace API. Every operation shares its connection/CAS. */
export interface WorkspaceHost {
  execute<T>(mode: 'readonly' | 'readwrite', work: (tx: IDBTransaction) => Promise<T>, options?: WriteOptions): Promise<RepositoryResult<T>>;
  timestamp(): number;
  readProject(tx: IDBTransaction, id: string): Promise<ProjectSnapshot>;
  checkRevision(project: ProjectMetadata, revision: number): void;
  writeNew(tx: IDBTransaction, id: string, name: string, document: ProjectDocument, now: number): Promise<ProjectSnapshot>;
  writeRevision(tx: IDBTransaction, previous: ProjectSnapshot, next: ProjectSnapshot, reason: CheckpointReason): Promise<ProjectSnapshot>;
}

export class WorkspaceRepository {
  constructor(private readonly host: WorkspaceHost) {}

  private async session(tx: IDBTransaction, id: string, expectedRevision?: number): Promise<SessionRecord> {
    const value: unknown = await requestValue(tx.objectStore('meta').get(SESSION_PREFIX + id));
    if (value === undefined) fail({ code: 'session-not-found', id, message: 'Session not found.' });
    const session = decodeSession(value, id);
    if (expectedRevision !== undefined) this.checkRevision(session, expectedRevision, 'session-conflict');
    return session;
  }

  private async draft(tx: IDBTransaction, id: string): Promise<DraftRecord> {
    const value: unknown = await requestValue(tx.objectStore('meta').get(DRAFT_PREFIX + id));
    if (value === undefined) fail({ code: 'draft-not-found', id, message: 'Draft not found.' });
    return decodeDraft(value, id);
  }

  private checkRevision(record: { id: string; revision: number }, expected: number, code: 'draft-conflict' | 'session-conflict'): void {
    if (!isRevision(expected)) fail({ code: 'invalid-input', message: 'An explicit expected revision is required.' });
    if (record.revision !== expected) fail({ code, id: record.id, expectedRevision: expected, actualRevision: record.revision, message: 'Workspace record changed since it was loaded.' });
    if (record.revision === Number.MAX_SAFE_INTEGER) fail({ code: 'corrupt-data', message: 'Workspace revision exhausted.' });
  }

  private checkToken(draft: OpenDraft, token: DraftVersion): void {
    this.checkRevision(draft, token.revision, 'draft-conflict');
    validateEditSequence(token.editSequence);
    if (draft.editSequence !== token.editSequence) fail({ code: 'stale-edit', draftId: draft.id, receivedSequence: token.editSequence, currentSequence: draft.editSequence, message: 'Persist the current edit sequence before a manual operation.' });
  }

  private async openDraft(tx: IDBTransaction, id: string): Promise<OpenDraft> {
    const draft = await this.draft(tx, id);
    if (draft.state === 'closed') fail({ code: 'draft-closed', id, message: 'Closed drafts cannot be updated or reopened with the same ID.' });
    const session = await this.session(tx, draft.sessionId);
    if (!session.draftIds.includes(id)) fail({ code: 'corrupt-data', message: 'Open draft is not registered in its session.' });
    return draft;
  }

  private async sessionDrafts(tx: IDBTransaction, session: SessionRecord): Promise<OpenDraft[]> {
    return Promise.all(session.draftIds.map(async id => {
      const draft = await this.draft(tx, id);
      if (draft.state !== 'open' || draft.sessionId !== session.id) fail({ code: 'corrupt-data', message: 'Session references a closed draft or a draft owned by another session.' });
      return draft;
    }));
  }

  private receipt(draft: OpenDraft): DraftWriteResult {
    return { draft, acknowledgement: { draftId: draft.id, revision: draft.revision, editSequence: draft.editSequence } };
  }

  private newDraft(id: string, sessionId: string, document: ProjectDocument, now: number, plan?: ProjectSnapshot): OpenDraft {
    const encoded = encodeDraftDocument(document), base = plan ? savedBase(plan) : null;
    const createdAt = Math.max(now, base?.savedAt ?? 0);
    return { schemaVersion: 1, kind: 'topology-draft', id, sessionId, revision: 1, editSequence: 0, createdAt, updatedAt: createdAt,
      state: 'open', document: encoded.document, base, dirty: base === null || encoded.json !== base.documentJson };
  }

  private validId(id: string): string {
    if (!isProjectId(id)) fail({ code: 'invalid-input', message: 'Workspace identifiers must be UUIDs.' });
    return id;
  }

  async createSession(input: CreateSessionInput = {}, options?: WriteOptions): Promise<RepositoryResult<SessionSnapshot>> {
    try {
      const id = this.validId(input.id ?? createProjectId()), tab = input.initialTab ? { ...input.initialTab } : undefined, now = this.host.timestamp();
      if (tab && tab.kind !== 'new' && tab.kind !== 'plan') fail({ code: 'invalid-input', message: 'Unknown initial tab kind.' });
      const draftId = tab ? this.validId(tab.id ?? createProjectId()) : null;
      const prepared = tab?.kind === 'new' ? encodeDraftDocument(tab.document).document : null;
      return await this.host.execute('readwrite', async tx => {
        const plan = tab?.kind === 'plan' ? await this.host.readProject(tx, tab.planId) : undefined;
        const draft = tab ? this.newDraft(draftId!, id, prepared ?? plan!.document, now, plan) : null;
        const session: SessionRecord = { schemaVersion: 1, kind: 'topology-session', id, revision: 1, draftIds: draft ? [draft.id] : [],
          activeDraftId: draft?.id ?? null, createdAt: now, updatedAt: Math.max(now, draft?.updatedAt ?? 0) };
        await Promise.all([issueRequest(() => tx.objectStore('meta').add(workspaceMeta(session))),
          ...(draft ? [issueRequest(() => tx.objectStore('meta').add(workspaceMeta(draft)))] : [])]);
        return { session, drafts: draft ? [draft] : [] };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  listSessions(): Promise<RepositoryResult<SessionRecord[]>> {
    return this.host.execute('readonly', async tx => {
      const records: unknown[] = await requestValue(tx.objectStore('meta').getAll(IDBKeyRange.bound(SESSION_PREFIX, SESSION_PREFIX + '\uffff')));
      return records.map(record => {
        const id = (record as { key: string }).key.slice(SESSION_PREFIX.length);
        return decodeSession(record, id);
      }).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    });
  }

  restoreSession(id: string): Promise<RepositoryResult<SessionSnapshot>> {
    return this.host.execute('readonly', async tx => {
      const session = await this.session(tx, id);
      return { session, drafts: await this.sessionDrafts(tx, session) };
    });
  }

  loadDraft(id: string): Promise<RepositoryResult<DraftRecord>> { return this.host.execute('readonly', tx => this.draft(tx, id)); }

  async createDraft(sessionId: string, expectedSessionRevision: number, input: CreateDraftInput, options?: WriteOptions): Promise<RepositoryResult<SessionDraftResult>> {
    try {
      const id = this.validId(input.id ?? createProjectId()), document = encodeDraftDocument(input.document).document, activate = input.activate, now = this.host.timestamp();
      return await this.host.execute('readwrite', async tx => {
        const current = await this.session(tx, sessionId, expectedSessionRevision);
        await this.sessionDrafts(tx, current);
        const draft = this.newDraft(id, sessionId, document, now);
        const session: SessionRecord = { ...current, revision: current.revision + 1, draftIds: [...current.draftIds, id],
          activeDraftId: activate === false && current.activeDraftId ? current.activeDraftId : id, updatedAt: Math.max(now, current.updatedAt) };
        await Promise.all([issueRequest(() => tx.objectStore('meta').add(workspaceMeta(draft))), issueRequest(() => tx.objectStore('meta').put(workspaceMeta(session)))]);
        return { ...this.receipt(draft), session };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async openPlanDraft(sessionId: string, expectedSessionRevision: number, planId: string, options?: WriteOptions & { activate?: boolean }): Promise<RepositoryResult<SessionDraftResult>> {
    try {
      const id = createProjectId(), now = this.host.timestamp(), activate = options?.activate !== false;
      return await this.host.execute('readwrite', async tx => {
        const current = await this.session(tx, sessionId, expectedSessionRevision), drafts = await this.sessionDrafts(tx, current);
        const existing = drafts.find(d => d.base?.planId === planId);
        if (existing) {
          const session = !activate || current.activeDraftId === existing.id ? current : { ...current, revision: current.revision + 1, activeDraftId: existing.id, updatedAt: Math.max(now, current.updatedAt) };
          if (session !== current) await requestValue(tx.objectStore('meta').put(workspaceMeta(session)));
          return { ...this.receipt(existing), session };
        }
        const plan = await this.host.readProject(tx, planId), draft = this.newDraft(id, sessionId, plan.document, now, plan);
        const session: SessionRecord = { ...current, revision: current.revision + 1, draftIds: [...current.draftIds, id], activeDraftId: activate || !current.activeDraftId ? id : current.activeDraftId, updatedAt: Math.max(now, current.updatedAt, draft.updatedAt) };
        await Promise.all([issueRequest(() => tx.objectStore('meta').add(workspaceMeta(draft))), issueRequest(() => tx.objectStore('meta').put(workspaceMeta(session)))]);
        return { ...this.receipt(draft), session };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async updateDraft(id: string, input: DraftUpdateInput, options?: WriteOptions): Promise<RepositoryResult<DraftWriteResult>> {
    try {
      const encoded = encodeDraftDocument(input.document), now = this.host.timestamp(), { expectedRevision, editSequence } = input; validateEditSequence(editSequence);
      return await this.host.execute('readwrite', async tx => {
        const current = await this.openDraft(tx, id); this.checkRevision(current, expectedRevision, 'draft-conflict');
        if (editSequence <= current.editSequence) fail({ code: 'stale-edit', draftId: id, receivedSequence: editSequence, currentSequence: current.editSequence, message: 'An older edit cannot overwrite a newer draft.' });
        const draft: OpenDraft = { ...current, revision: current.revision + 1, editSequence, document: encoded.document,
          dirty: current.base === null || encoded.json !== current.base.documentJson, updatedAt: Math.max(now, current.updatedAt) };
        await requestValue(tx.objectStore('meta').put(workspaceMeta(draft)));
        return this.receipt(draft);
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async setSessionLayout(id: string, expectedRevision: number, input: SessionLayoutInput, options?: WriteOptions): Promise<RepositoryResult<SessionRecord>> {
    try {
      const now = this.host.timestamp(), order = input.draftIds === undefined ? undefined : [...input.draftIds], requestedActive = input.activeDraftId, targetRevision = input.expectedActiveDraftRevision;
      return await this.host.execute('readwrite', async tx => {
        const current = await this.session(tx, id, expectedRevision); await this.sessionDrafts(tx, current);
        const draftIds = order ?? current.draftIds, activeDraftId = requestedActive === undefined ? current.activeDraftId : requestedActive;
        if (draftIds.length !== current.draftIds.length || new Set(draftIds).size !== draftIds.length || !draftIds.every(d => current.draftIds.includes(d)) || (draftIds.length ? !draftIds.includes(activeDraftId!) : activeDraftId !== null)) fail({ code: 'invalid-input', message: 'Layout must preserve open tabs exactly and select an open tab.' });
        if (targetRevision !== undefined) {
          if (!activeDraftId) fail({ code: 'invalid-input', message: 'A prepared draft revision requires an active tab.' });
          this.checkRevision(await this.openDraft(tx, activeDraftId), targetRevision, 'draft-conflict');
        }
        if (JSON.stringify(draftIds) === JSON.stringify(current.draftIds) && activeDraftId === current.activeDraftId) return current;
        const session = { ...current, revision: current.revision + 1, draftIds, activeDraftId, updatedAt: Math.max(now, current.updatedAt) };
        await requestValue(tx.objectStore('meta').put(workspaceMeta(session))); return session;
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async saveDraft(id: string, token: DraftVersion, options?: WriteOptions): Promise<RepositoryResult<DraftSaveResult>> {
    try {
      token = { ...token };
      const now = this.host.timestamp();
      return await this.host.execute('readwrite', async tx => {
        const current = await this.openDraft(tx, id); this.checkToken(current, token);
        if (!current.base) fail({ code: 'draft-not-saved', id, message: 'An unnamed draft requires Save As.' });
        const previous = await this.host.readProject(tx, current.base.planId); this.host.checkRevision(previous.project, current.base.planRevision);
        if (encodeDraftDocument(previous.document).json !== current.base.documentJson) fail({ code: 'corrupt-data', message: 'Saved plan and draft baseline disagree at the same revision.' });
        if (!current.dirty) return { ...this.receipt(current), plan: previous };
        const plan = await this.host.writeRevision(tx, previous, { document: current.document,
          project: { ...previous.project, revision: previous.project.revision + 1, updatedAt: Math.max(now, previous.project.updatedAt) } }, 'update');
        const draft: OpenDraft = { ...current, revision: current.revision + 1, base: savedBase(plan), dirty: false, updatedAt: Math.max(now, current.updatedAt, plan.project.updatedAt) };
        await requestValue(tx.objectStore('meta').put(workspaceMeta(draft)));
        return { ...this.receipt(draft), plan };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async saveAsDraft(id: string, token: DraftVersion, inputName: string, options?: WriteOptions): Promise<RepositoryResult<DraftSaveResult>> {
    try {
      token = { ...token };
      const planId = createProjectId(), name = projectName(inputName), now = this.host.timestamp();
      return await this.host.execute('readwrite', async tx => {
        const current = await this.openDraft(tx, id); this.checkToken(current, token);
        const plan = await this.host.writeNew(tx, planId, name, current.document, now);
        const draft: OpenDraft = { ...current, revision: current.revision + 1, base: savedBase(plan), dirty: false, updatedAt: Math.max(now, current.updatedAt) };
        await requestValue(tx.objectStore('meta').put(workspaceMeta(draft)));
        return { ...this.receipt(draft), plan };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  closeDraft(sessionId: string, expectedSessionRevision: number, id: string, token: DraftVersion, options?: WriteOptions & { expectedActiveDraftRevision?: number }): Promise<RepositoryResult<DraftCloseResult>> {
    return this.close(sessionId, expectedSessionRevision, id, token, false, options);
  }
  discardDraft(sessionId: string, expectedSessionRevision: number, id: string, token: DraftVersion, options?: WriteOptions & { expectedActiveDraftRevision?: number }): Promise<RepositoryResult<DraftCloseResult>> {
    return this.close(sessionId, expectedSessionRevision, id, token, true, options);
  }
  private async close(sessionId: string, expectedSessionRevision: number, id: string, token: DraftVersion, discard: boolean, options?: WriteOptions & { expectedActiveDraftRevision?: number }): Promise<RepositoryResult<DraftCloseResult>> {
    try {
      token = { ...token };
      const now = this.host.timestamp(), targetRevision = options?.expectedActiveDraftRevision;
      return await this.host.execute('readwrite', async tx => {
        const current = await this.openDraft(tx, id), session = await this.session(tx, sessionId, expectedSessionRevision);
        if (current.sessionId !== sessionId) fail({ code: 'invalid-input', message: 'Draft belongs to another session.' });
        this.checkToken(current, token); await this.sessionDrafts(tx, session);
        if (current.dirty && !discard) fail({ code: 'unsaved-draft', id, message: 'Save or explicitly discard changes before closing the tab.' });
        // A clean baseline is insufficient when its saved plan was deleted.
        // Keep that recoverable working copy until an explicit discard/Save As.
        if (!discard && current.base) await this.host.readProject(tx, current.base.planId);
        const index = session.draftIds.indexOf(id), draftIds = session.draftIds.filter(d => d !== id), timestamp = Math.max(now, current.updatedAt);
        const next: SessionRecord = { ...session, revision: session.revision + 1, draftIds,
          activeDraftId: session.activeDraftId === id ? draftIds[Math.min(index, draftIds.length - 1)] ?? null : session.activeDraftId,
          updatedAt: Math.max(timestamp, session.updatedAt) };
        if (targetRevision !== undefined && next.activeDraftId) this.checkRevision(await this.openDraft(tx, next.activeDraftId), targetRevision, 'draft-conflict');
        const draft: ClosedDraft = { schemaVersion: 1, kind: 'topology-draft', id, sessionId, revision: current.revision + 1,
          editSequence: current.editSequence, state: 'closed', createdAt: current.createdAt, updatedAt: timestamp, closedAt: timestamp };
        await Promise.all([issueRequest(() => tx.objectStore('meta').put(workspaceMeta(next))), issueRequest(() => tx.objectStore('meta').put(workspaceMeta(draft)))]);
        return { session: next, draft };
      }, options);
    } catch (error) { return errorResult(error); }
  }
}
