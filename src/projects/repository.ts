import { openDatabase, SCHEMA_KEY, STORE_NAMES } from './database';
import { errorResult, fail } from './errors';
import { cloneMetaValue, createProjectId, isObject, isProjectId, isRevision, isTimestamp, normalizeProjectDocument, projectName, validateMetadata } from './projectDocument';
import { issueRequest, requestValue, runTransaction } from './transactions';
import { WorkspaceRepository } from './workspaceRepository';
import { WORKSPACE_PREFIX } from './workspaceTypes';
import { DEFAULT_CHECKPOINT_LIMIT, MAX_CHECKPOINT_LIMIT, type CheckpointMetadata, type CheckpointReason, type CreateProjectInput,
  type MetaMutation, type MetaRecord, type ProjectCheckpoint, type ProjectDocument, type ProjectMetadata, type ProjectRecoveryState, type ProjectSnapshot,
  type RepositoryOptions, type RepositoryResult, type StoredProjectDocument, type WriteOptions } from './types';

export async function openProjectRepository(options: RepositoryOptions = {}): Promise<RepositoryResult<ProjectRepository>> {
  const limit = options.checkpointLimit ?? DEFAULT_CHECKPOINT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CHECKPOINT_LIMIT) return { ok: false, error: { code: 'invalid-input', message: 'Checkpoint limit must be between 1 and ' + MAX_CHECKPOINT_LIMIT + '.' } };
  const connection = await openDatabase(options);
  return connection.ok ? { ok: true, value: new ProjectRepository(connection.value, limit, options) } : connection;
}

/** Explicitly opened storage only. Importing this module never opens a database,
 * reads localStorage, installs UI callbacks or activates a simulation. */
export class ProjectRepository {
  readonly workspace: WorkspaceRepository;
  private closedReason: 'closed' | 'version-changed' | 'unavailable' | null = null;
  constructor(private readonly db: IDBDatabase, private readonly checkpointLimit: number, private readonly options: RepositoryOptions) {
    this.workspace = new WorkspaceRepository({
      execute: (mode, work, writeOptions) => this.execute(mode, work, writeOptions), timestamp: () => this.timestamp(),
      readProject: (tx, id) => this.readProject(tx, id), checkRevision: (project, revision) => this.checkRevision(project, revision),
      writeNew: (tx, id, name, document, now) => this.writeNew(tx, id, name, document, now),
      writeRevision: (tx, previous, next, reason) => this.writeRevision(tx, previous, next, reason),
    });
    db.onversionchange = () => this.closeWithReason('version-changed');
    db.onclose = () => this.closeWithReason('unavailable');
  }

  close(): void { this.closeWithReason('closed'); }

  private closeWithReason(reason: 'closed' | 'version-changed' | 'unavailable'): void {
    if (this.closedReason) return;
    this.closedReason = reason;
    this.db.close();
    try { this.options.onConnectionStateChange?.(reason); } catch { /* Observers cannot interfere with closing. */ }
  }

  private execute<T>(mode: 'readonly' | 'readwrite', work: (tx: IDBTransaction) => Promise<T>, options?: WriteOptions): Promise<RepositoryResult<T>> {
    if (this.closedReason) return Promise.resolve({ ok: false, error: { code: this.closedReason, message: 'Repository connection is ' + this.closedReason + '; reopen explicitly.' } });
    return runTransaction(this.db, STORE_NAMES, mode, work, options?.signal);
  }

  private timestamp(): number {
    const value = (this.options.now ?? Date.now)();
    if (!isTimestamp(value)) fail({ code: 'invalid-input', message: 'Clock must return a nonnegative integer timestamp.' });
    return value;
  }

  private async metadata(tx: IDBTransaction, id: string, includeDeleted = false): Promise<ProjectMetadata> {
    const value: unknown = await requestValue(tx.objectStore('projects').get(id));
    if (value === undefined) fail({ code: 'not-found', projectId: id, message: 'Project not found.' });
    const project = validateMetadata(value, id);
    if (!includeDeleted && project.deletedAt !== null) fail({ code: 'deleted', current: project, message: 'Project was deleted; explicit recovery is required.' });
    return project;
  }

  private async readProject(tx: IDBTransaction, id: string, includeDeleted = false): Promise<ProjectSnapshot> {
    const [metadata, stored] = await Promise.all([
      issueRequest<unknown>(() => tx.objectStore('projects').get(id)), issueRequest<unknown>(() => tx.objectStore('documents').get(id)),
    ]);
    if (metadata === undefined) {
      if (stored !== undefined) fail({ code: 'corrupt-data', message: 'Orphan project document: ' + id });
      fail({ code: 'not-found', projectId: id, message: 'Project not found.' });
    }
    const project = validateMetadata(metadata, id);
    if (!includeDeleted && project.deletedAt !== null) fail({ code: 'deleted', current: project, message: 'Project was deleted; explicit recovery is required.' });
    if (!isObject(stored) || stored.projectId !== id || stored.revision !== project.revision) fail({ code: 'corrupt-data', message: 'Project document and metadata revisions disagree.' });
    return { project, document: normalizeProjectDocument(stored.document) };
  }

  private checkRevision(project: ProjectMetadata, expectedRevision: number): void {
    if (!isRevision(expectedRevision)) fail({ code: 'invalid-input', message: 'An explicit positive expected revision is required.' });
    if (project.revision !== expectedRevision) fail({ code: 'conflict', projectId: project.id, expectedRevision, current: project, message: 'Project changed since it was loaded.' });
    if (project.revision === Number.MAX_SAFE_INTEGER) fail({ code: 'corrupt-data', message: 'Project revision exhausted.' });
  }

  private prepareControl(control: readonly MetaMutation[] = []): MetaMutation[] {
    const keys = new Set<string>();
    return control.map(mutation => {
      if (!mutation || typeof mutation.key !== 'string' || !mutation.key || mutation.key.startsWith('repository:') || mutation.key.startsWith(WORKSPACE_PREFIX) || keys.has(mutation.key) || (mutation.expectedRevision !== null && !isRevision(mutation.expectedRevision))) fail({ code: 'invalid-input', message: 'Invalid, reserved or repeated control key/revision.' });
      keys.add(mutation.key);
      return { ...mutation, value: cloneMetaValue(mutation.value) };
    });
  }

  private async readMeta(tx: IDBTransaction, key: string): Promise<MetaRecord | null> {
    const record: unknown = await requestValue(tx.objectStore('meta').get(key));
    if (record === undefined) return null;
    if (!isObject(record) || record.key !== key || !isRevision(record.revision)) fail({ code: 'corrupt-data', message: 'Invalid control record: ' + key });
    return { key, revision: record.revision, value: cloneMetaValue(record.value as MetaRecord['value']) };
  }

  private async writeControl(tx: IDBTransaction, control: readonly MetaMutation[]): Promise<MetaRecord[]> {
    const result: MetaRecord[] = [];
    for (const mutation of control) {
      const current = await this.readMeta(tx, mutation.key);
      if ((current?.revision ?? null) !== mutation.expectedRevision) fail({ code: 'meta-conflict', key: mutation.key, expectedRevision: mutation.expectedRevision, current, message: 'Control metadata changed.' });
      const next = { key: mutation.key, revision: (current?.revision ?? 0) + 1, value: mutation.value };
      if (!isRevision(next.revision)) fail({ code: 'corrupt-data', message: 'Control revision exhausted.' });
      await requestValue(tx.objectStore('meta').put(next));
      result.push(next);
    }
    return result;
  }

  private async writeNew(tx: IDBTransaction, id: string, name: string, document: ProjectDocument, now: number): Promise<ProjectSnapshot> {
    const project: ProjectMetadata = { id, name, createdAt: now, updatedAt: now, lastOpenedAt: null, revision: 1, deletedAt: null };
    await Promise.all([
      issueRequest(() => tx.objectStore('projects').add(project)),
      issueRequest(() => tx.objectStore('documents').add({ projectId: id, revision: 1, document } satisfies StoredProjectDocument)),
    ]);
    return { project, document };
  }

  private async writeRevision(tx: IDBTransaction, previous: ProjectSnapshot, next: ProjectSnapshot, reason: CheckpointReason): Promise<ProjectSnapshot> {
    const checkpoint: ProjectCheckpoint = { projectId: previous.project.id, revision: previous.project.revision,
      savedAt: previous.project.updatedAt, name: previous.project.name, reason, document: previous.document };
    await Promise.all([
      issueRequest(() => tx.objectStore('revisions').add(checkpoint)),
      issueRequest(() => tx.objectStore('projects').put(next.project)),
      issueRequest(() => tx.objectStore('documents').put({ projectId: next.project.id, revision: next.project.revision, document: next.document } satisfies StoredProjectDocument)),
    ]);
    const revisions = tx.objectStore('revisions');
    const keys = await requestValue(revisions.index('byProject').getAllKeys(previous.project.id));
    // Native index order is primary-key order within this exact project key.
    await Promise.all(keys.slice(0, Math.max(0, keys.length - this.checkpointLimit)).map(key => issueRequest(() => revisions.delete(key))));
    return next;
  }

  async createProject(input: CreateProjectInput, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const id = input.id ?? createProjectId(), name = projectName(input.name), document = normalizeProjectDocument(input.document);
      if (!isProjectId(id)) fail({ code: 'invalid-input', message: 'Project identifier must be a UUID independent of equipment IDs.' });
      const control = this.prepareControl(input.control), now = this.timestamp();
      if (input.initialCheckpoint !== undefined && typeof input.initialCheckpoint !== 'boolean') fail({ code: 'invalid-input', message: 'initialCheckpoint must be boolean.' });
      return await this.execute('readwrite', async tx => {
        let snapshot = await this.writeNew(tx, id, name, document, now);
        if (input.initialCheckpoint) snapshot = await this.writeRevision(tx, snapshot, {
          document, project: { ...snapshot.project, revision: 2 },
        }, 'initial');
        await this.writeControl(tx, control);
        return snapshot;
      }, options);
    } catch (error) { return errorResult(error); }
  }

  listProjects(options: { includeDeleted?: boolean; sortBy?: 'updatedAt' | 'lastOpenedAt' } = {}): Promise<RepositoryResult<ProjectMetadata[]>> {
    return this.execute('readonly', async tx => {
      const records: unknown[] = await requestValue(tx.objectStore('projects').getAll());
      const field = options.sortBy ?? 'updatedAt';
      return records.map(r => validateMetadata(r)).filter(p => options.includeDeleted || p.deletedAt === null)
        .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0) || a.id.localeCompare(b.id));
    });
  }

  loadProject(id: string, options: { includeDeleted?: boolean } = {}): Promise<RepositoryResult<ProjectSnapshot>> {
    return this.execute('readonly', tx => this.readProject(tx, id, options.includeDeleted));
  }

  /** Read back a committed project, its controls and an optional checkpoint from
   * one database snapshot. No hashing or external awaits inside the transaction. */
  loadProjectRecoveryState(id: string, options: { controlKeys: readonly string[]; checkpointRevision?: number; includeDeleted?: boolean }): Promise<RepositoryResult<ProjectRecoveryState>> {
    if (!Array.isArray(options.controlKeys) || options.controlKeys.some(k => typeof k !== 'string' || !k) || (options.checkpointRevision !== undefined && !isRevision(options.checkpointRevision))) {
      return Promise.resolve({ ok: false, error: { code: 'invalid-input', message: 'Invalid recovery read options.' } });
    }
    const keys = [...options.controlKeys], revision = options.checkpointRevision;
    return this.execute('readonly', async tx => {
      const snapshot = await this.readProject(tx, id, options.includeDeleted);
      const controls = await Promise.all(keys.map(key => this.readMeta(tx, key)));
      const exists = revision === undefined ? undefined : await requestValue(tx.objectStore('revisions').get([id, revision]));
      const checkpoint = exists === undefined ? null : await this.readCheckpoint(tx, id, revision!, snapshot.project.revision);
      return { snapshot, controls, checkpoint };
    });
  }

  async updateProject(id: string, expectedRevision: number, input: ProjectDocument, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const document = normalizeProjectDocument(input), now = this.timestamp();
      return await this.change(id, expectedRevision, 'update', previous => ({ ...previous, document,
        project: { ...previous.project, revision: previous.project.revision + 1, updatedAt: Math.max(now, previous.project.updatedAt) } }), options);
    } catch (error) { return errorResult(error); }
  }

  async renameProject(id: string, expectedRevision: number, input: string, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const name = projectName(input), now = this.timestamp();
      return await this.change(id, expectedRevision, 'rename', previous => ({ ...previous,
        project: { ...previous.project, name, revision: previous.project.revision + 1, updatedAt: Math.max(now, previous.project.updatedAt) } }), options);
    } catch (error) { return errorResult(error); }
  }

  async duplicateProject(id: string, expectedRevision: number, inputName: string, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const name = projectName(inputName), newId = createProjectId(), now = this.timestamp();
      return await this.execute('readwrite', async tx => {
        const previous = await this.readProject(tx, id);
        this.checkRevision(previous.project, expectedRevision);
        return this.writeNew(tx, newId, name, previous.document, now);
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async deleteProject(id: string, expectedRevision: number, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const now = this.timestamp();
      return await this.change(id, expectedRevision, 'delete', previous => {
        const timestamp = Math.max(now, previous.project.updatedAt);
        return { ...previous, project: { ...previous.project, revision: previous.project.revision + 1, updatedAt: timestamp, deletedAt: timestamp } };
      }, options);
    } catch (error) { return errorResult(error); }
  }

  async restoreDeletedProject(id: string, expectedRevision: number, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const now = this.timestamp();
      return await this.change(id, expectedRevision, 'restore-project', previous => {
        if (previous.project.deletedAt === null) fail({ code: 'invalid-input', message: 'Project is not deleted.' });
        return { ...previous, project: { ...previous.project, revision: previous.project.revision + 1, updatedAt: Math.max(now, previous.project.updatedAt), deletedAt: null } };
      }, options, true);
    } catch (error) { return errorResult(error); }
  }

  private change(id: string, expectedRevision: number, reason: CheckpointReason, transform: (previous: ProjectSnapshot) => ProjectSnapshot,
    options?: WriteOptions, includeDeleted = false): Promise<RepositoryResult<ProjectSnapshot>> {
    return this.execute('readwrite', async tx => {
      const previous = await this.readProject(tx, id, includeDeleted);
      this.checkRevision(previous.project, expectedRevision);
      return this.writeRevision(tx, previous, transform(previous), reason);
    }, options);
  }

  async markOpened(id: string, options?: WriteOptions): Promise<RepositoryResult<ProjectMetadata>> {
    try {
      const now = this.timestamp();
      return await this.execute('readwrite', async tx => {
        const { project } = await this.readProject(tx, id);
        const next = { ...project, lastOpenedAt: Math.max(now, project.createdAt, project.lastOpenedAt ?? 0) };
        await requestValue(tx.objectStore('projects').put(next));
        return next;
      }, options);
    } catch (error) { return errorResult(error); }
  }

  listCheckpoints(id: string): Promise<RepositoryResult<CheckpointMetadata[]>> {
    return this.execute('readonly', async tx => {
      // Recovery remains accessible even if the current document is unreadable.
      const project = await this.metadata(tx, id, true);
      const checkpoints: unknown[] = await requestValue(tx.objectStore('revisions').index('byProject').getAll(id));
      return checkpoints.map(value => this.checkpointMetadata(value, id, project.revision)).reverse();
    });
  }

  private checkpointMetadata(value: unknown, id: string, currentRevision: number): CheckpointMetadata {
    if (!isObject(value) || value.projectId !== id || !isRevision(value.revision) || value.revision >= currentRevision || !isTimestamp(value.savedAt) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || !['initial', 'update', 'rename', 'delete', 'restore-project', 'restore-checkpoint'].includes(String(value.reason))) fail({ code: 'corrupt-data', message: 'Invalid checkpoint record.' });
    return { projectId: id, revision: value.revision, savedAt: value.savedAt, name: value.name, reason: value.reason as CheckpointReason };
  }

  private async readCheckpoint(tx: IDBTransaction, id: string, revision: number, currentRevision: number): Promise<ProjectCheckpoint> {
    if (!isRevision(revision)) fail({ code: 'invalid-input', message: 'Invalid checkpoint revision.' });
    const value: unknown = await requestValue(tx.objectStore('revisions').get([id, revision]));
    if (value === undefined) fail({ code: 'checkpoint-not-found', projectId: id, revision, message: 'Checkpoint not found or no longer retained.' });
    const metadata = this.checkpointMetadata(value, id, currentRevision);
    if (!isObject(value) || value.revision !== revision) fail({ code: 'corrupt-data', message: 'Checkpoint key mismatch.' });
    return { ...metadata, document: normalizeProjectDocument(value.document) };
  }

  loadCheckpoint(id: string, revision: number): Promise<RepositoryResult<ProjectCheckpoint>> {
    return this.execute('readonly', async tx => {
      const project = await this.metadata(tx, id, true);
      return this.readCheckpoint(tx, id, revision, project.revision);
    });
  }

  async restoreCheckpoint(id: string, revision: number, expectedRevision: number, options?: WriteOptions): Promise<RepositoryResult<ProjectSnapshot>> {
    try {
      const now = this.timestamp();
      return await this.execute('readwrite', async tx => {
        const previous = await this.readProject(tx, id);
        this.checkRevision(previous.project, expectedRevision);
        if (revision >= previous.project.revision) fail({ code: 'invalid-input', message: 'Checkpoint must precede the current project revision.' });
        const checkpoint = await this.readCheckpoint(tx, id, revision, previous.project.revision);
        return this.writeRevision(tx, previous, { document: checkpoint.document, project: { ...previous.project,
          revision: previous.project.revision + 1, updatedAt: Math.max(now, previous.project.updatedAt) } }, 'restore-checkpoint');
      }, options);
    } catch (error) { return errorResult(error); }
  }

  getMeta(key: string): Promise<RepositoryResult<MetaRecord | null>> {
    if (typeof key !== 'string' || !key) return Promise.resolve({ ok: false, error: { code: 'invalid-input', message: 'A nonempty control key is required.' } });
    return this.execute('readonly', tx => this.readMeta(tx, key));
  }

  async setMeta(mutation: MetaMutation, options?: WriteOptions): Promise<RepositoryResult<MetaRecord>> {
    try {
      const control = this.prepareControl([mutation]);
      return await this.execute('readwrite', async tx => (await this.writeControl(tx, control))[0], options);
    } catch (error) { return errorResult(error); }
  }
}

// The schema marker is available for inspection, never through the write APIs.
export { SCHEMA_KEY };
