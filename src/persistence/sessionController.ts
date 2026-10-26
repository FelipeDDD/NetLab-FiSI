import type { ProjectRepository } from '../projects/repository';
import type { WorkspaceRepository } from '../projects/workspaceRepository';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import { assessDraftAcknowledgement, type DraftWriteResult, type OpenDraft, type SessionRecord } from '../projects/workspaceTypes';
import type { ProjectDocument, ProjectSnapshot } from '../projects/types';
import { classifyError } from '../projects/errors';
import { disposeNetwork } from '../engine/networkLifecycle';
import { prepareTopologyDocument } from './topologyDocument';
import { bootstrapSession, type SessionBootstrapOptions } from './sessionBootstrap';
import type { DraftControllerState, SessionControllerState, SessionError, SessionResult, SessionRuntime } from './sessionTypes';

class SessionFault extends Error {
  constructor(readonly detail: SessionError) { super(detail.message); }
}
function take<T>(result: SessionResult<T>): T { if (!result.ok) throw new SessionFault(result.error); return result.value; }
function fault(code: 'not-started' | 'disposed' | 'runtime-changed' | 'unapplied-forms', message: string): never { throw new SessionFault({ code, message }); }
const failure = (error: unknown): SessionError => error instanceof SessionFault ? error.detail : classifyError(error);
const empty: ProjectDocument = { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [], links: [] } };
export type SessionStartOptions = SessionBootstrapOptions & { discardStartupChanges?: boolean; expectedRuntimeDocument?: ProjectDocument };

interface Entry {
  persisted: OpenDraft;
  document: ProjectDocument;
  json: string;
  sequence: number;
  persistedSequence: number;
  saving: boolean;
  error: SessionError | null;
  timer?: ReturnType<typeof setTimeout>;
  tail: Promise<unknown>;
}

/** No boot hooks, browser listeners or repository opening in this module.
 * Commands are serialized; all writes (including Save) share a per-draft queue. */
export class SessionController {
  private readonly workspace: WorkspaceRepository;
  private entries = new Map<string, Entry>();
  private session: SessionRecord | null = null;
  private activeId: string | null = null;
  private phase: SessionControllerState['phase'] = 'idle';
  private error: SessionError | null = null;
  private share: ProjectDocument | null = null;
  private commandTail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private disconnect?: () => void;
  private startupChanged = false;
  private readonly writes = new AbortController();
  private pendingCommands = 0;

  constructor(private readonly repository: ProjectRepository, private readonly runtime: SessionRuntime, private readonly debounceMs = 500) {
    if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new Error('Invalid debounce.');
    this.workspace = repository.workspace;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  hasPendingOperations(): boolean { return this.pendingCommands > 0; }
  getState(): SessionControllerState {
    const drafts: DraftControllerState[] = (this.session?.draftIds ?? []).flatMap(id => {
      const e = this.entries.get(id); if (!e) return [];
      return [{ id, revision: e.persisted.revision, editSequence: e.sequence, persistedSequence: e.persistedSequence,
        pendingPersistence: e.sequence !== e.persistedSequence, saving: e.saving,
        manualSavePending: e.persisted.base === null || e.json !== e.persisted.base.documentJson,
        base: structuredClone(e.persisted.base), error: e.error ? { ...e.error } : null }];
    });
    return { phase: this.phase, session: this.session ? structuredClone(this.session) : null, activeDraftId: this.activeId,
      drafts, error: this.error ? { ...this.error } : null, pendingShare: this.share !== null };
  }
  private publish(): void { for (const listener of this.listeners) { try { listener(); } catch { /* Observer cannot break persistence. */ } } }
  private checkAlive(): void { if (this.phase === 'disposed') fault('disposed', 'Controller was disposed; no delayed operation may activate a topology.'); }
  private ready(): void { this.checkAlive(); if (this.phase !== 'ready' || !this.session) fault('not-started', 'Start the session explicitly first.'); }
  private command<T>(work: () => Promise<T>): Promise<SessionResult<T>> {
    this.pendingCommands++;
    const result = this.commandTail.then(async () => {
      try { this.checkAlive(); return { ok: true as const, value: await work() }; }
      catch (error) { const detail = failure(error); if (this.phase !== 'disposed') { this.error = detail; this.publish(); } return { ok: false as const, error: detail }; }
    });
    const settled = result.finally(() => { this.pendingCommands--; this.publish(); });
    this.commandTail = settled; return settled;
  }
  private entry(draft: OpenDraft): Entry {
    const encoded = encodeDraftDocument(draft.document);
    return { persisted: draft, document: encoded.document, json: encoded.json, sequence: draft.editSequence,
      persistedSequence: draft.editSequence, saving: false, error: null, tail: Promise.resolve() };
  }
  private active(): Entry | undefined { return this.activeId ? this.entries.get(this.activeId) : undefined; }
  private capture(): void {
    if (!this.activeId) {
      if (encodeDraftDocument(this.runtime.capture()).json !== encodeDraftDocument(empty).json) fault('runtime-changed', 'Open a draft before editing an empty session.');
      return;
    }
    const identity = this.runtime.identity();
    if (!identity || identity.sessionId !== this.session?.id || identity.draftId !== this.activeId) fault('runtime-changed', 'Topology was replaced outside the controller; keep/export the current network before recovery.');
    const e = this.active()!, encoded = encodeDraftDocument(this.runtime.capture());
    if (encoded.json === e.json) return;
    if (e.sequence === Number.MAX_SAFE_INTEGER) fault('runtime-changed', 'Edit sequence exhausted.');
    e.sequence++; e.document = encoded.document; e.json = encoded.json;
    this.schedule(e); this.publish();
  }
  private changed = (): void => {
    if (this.phase !== 'ready') return;
    try { this.capture(); } catch (error) { this.error = failure(error); this.publish(); }
  };
  private schedule(e: Entry): void {
    if (e.timer !== undefined) clearTimeout(e.timer);
    if (e.error || this.phase === 'disposed') return;
    e.timer = setTimeout(() => { e.timer = undefined; if (!e.error) void this.flush(e.persisted.id); }, this.debounceMs);
  }
  private queue<T>(e: Entry, work: () => Promise<T>): Promise<T> {
    const next = e.tail.then(() => { this.checkAlive(); return work(); });
    e.tail = next.catch(() => {}); return next;
  }
  private acknowledge(e: Entry, result: DraftWriteResult): void {
    const accepted = assessDraftAcknowledgement(result.acknowledgement, { draftId: e.persisted.id, editSequence: e.sequence,
      knownRevision: e.persisted.revision, isOpen: this.phase !== 'disposed' && this.entries.get(e.persisted.id) === e });
    if (!accepted.acceptRevision) return;
    e.persisted = result.draft; e.persistedSequence = result.acknowledgement.editSequence; e.error = null;
    // Never replace e.document/sequence with an earlier asynchronous snapshot.
  }
  private async persist(e: Entry): Promise<void> {
    if (e.timer !== undefined) { clearTimeout(e.timer); e.timer = undefined; }
    try {
      while (e.sequence !== e.persistedSequence) {
        this.checkAlive(); e.saving = true; this.publish();
        const written = take(await this.workspace.updateDraft(e.persisted.id, { expectedRevision: e.persisted.revision,
          editSequence: e.sequence, document: e.document }, { signal: this.writes.signal }));
        this.checkAlive(); this.acknowledge(e, written); this.publish();
      }
      e.error = null;
    } catch (error) { e.error = failure(error); throw error; }
    finally { e.saving = false; this.publish(); }
  }
  /** Re-read the active engine, covering applied terminal edits too. */
  async flush(id?: string): Promise<SessionResult<void>> {
    try {
      this.ready(); if (!id || id === this.activeId) this.capture();
      const e = id ? this.entries.get(id) : this.active();
      if (id && !e) throw new SessionFault({ code: 'draft-not-found', id, message: 'Draft is not open in this controller.' });
      if (e) await this.queue(e, () => this.persist(e));
      this.checkAlive(); this.error = null; this.publish(); return { ok: true, value: undefined };
    } catch (error) { const detail = failure(error); if (this.phase !== 'disposed') { this.error = detail; this.publish(); } return { ok: false, error: detail }; }
  }
  start(options: SessionStartOptions = {}): Promise<SessionResult<SessionControllerState>> {
    return this.command(async () => {
      if (this.phase === 'ready') return this.getState();
      if (this.startupChanged && !options.discardStartupChanges) fault('runtime-changed', 'Recover/export edits made during startup, or explicitly discard them before retrying restoration.');
      this.phase = 'starting'; this.error = null; this.publish();
      let prepared: ReturnType<typeof prepareTopologyDocument> | undefined;
      try {
        const initial = encodeDraftDocument(this.runtime.capture());
        if (options.expectedRuntimeDocument && initial.json !== encodeDraftDocument(options.expectedRuntimeDocument).json) fault('runtime-changed', 'Local work changed while opening storage; export it before explicitly discarding and retrying.');
        if (this.runtime.hasPendingForms()) fault('unapplied-forms', 'Apply or discard form values before restoring a session.');
        const { snapshot } = take(await bootstrapSession(this.repository, initial.document, options)); this.checkAlive();
        const selected = snapshot.drafts.find(d => d.id === snapshot.session.activeDraftId);
        prepared = prepareTopologyDocument((selected?.document ?? empty).topology);
        if (this.runtime.hasPendingForms() || encodeDraftDocument(this.runtime.capture()).json !== initial.json) fault('runtime-changed', 'Topology changed during asynchronous startup; current work was preserved.');
        this.disconnect = this.runtime.connect({ changed: this.changed, flush: () => { void this.flush(); } });
        this.runtime.activate(prepared, { sessionId: snapshot.session.id, draftId: selected?.id ?? null }); prepared = undefined;
        this.session = snapshot.session; this.entries = new Map(snapshot.drafts.map(d => [d.id, this.entry(d)]));
        this.activeId = selected?.id ?? null; this.phase = 'ready'; this.startupChanged = false; this.publish(); return this.getState();
      } catch (error) {
        if (failure(error).code === 'runtime-changed') this.startupChanged = true;
        if (prepared) disposeNetwork(prepared.network);
        this.disconnect?.(); this.disconnect = undefined;
        if (this.getState().phase !== 'disposed') this.phase = 'idle'; throw error;
      }
    });
  }
  private guardForms(discard = false): void {
    if (!discard && this.runtime.hasPendingForms()) fault('unapplied-forms', 'Unapplied form values require an explicit decision before switching/closing.');
  }
  switchDraft(id: string, options: { discardUnappliedForms?: boolean } = {}): Promise<SessionResult<void>> {
    const discard = options.discardUnappliedForms === true;
    return this.command(() => this.switchTo(id, discard));
  }
  private async switchTo(id: string, discardForms = false): Promise<void> {
    this.ready(); if (id === this.activeId) return;
    this.guardForms(discardForms); this.capture();
    if (!this.session!.draftIds.includes(id)) fault('runtime-changed', 'Destination draft is not open in this session.');
    const destination = take(await this.workspace.loadDraft(id)); this.checkAlive();
    if (destination.state !== 'open' || destination.sessionId !== this.session!.id) fault('runtime-changed', 'Destination draft is closed or belongs to another session.');
    const prepared = prepareTopologyDocument(destination.document.topology);
    let activated = false, focused = false;
    const sourceId = this.activeId;
    try {
      take(await this.flush()); this.checkAlive(); this.guardForms(discardForms);
      this.session = take(await this.workspace.setSessionLayout(this.session!.id, this.session!.revision,
        { activeDraftId: id, expectedActiveDraftRevision: destination.revision }, { signal: this.writes.signal })); focused = true;
      // Edits can arrive while the focus transaction is in flight. Persist them
      // too; no await is permitted between the final capture/check and activation.
      for (;;) {
        this.checkAlive(); this.guardForms(discardForms); this.capture();
        const source = this.active(); if (!source || source.sequence === source.persistedSequence) break;
        take(await this.flush());
      }
      this.runtime.activate(prepared, { sessionId: this.session.id, draftId: id }); activated = true;
      this.entries.set(id, this.entry(destination)); this.activeId = id; this.error = null; this.publish();
    } catch (error) {
      // A focus commit can precede a late form/edit failure. Best-effort CAS
      // compensation restores durable focus; never overwrite another tab's work.
      if (focused && this.phase !== 'disposed') {
        const reverted = await this.workspace.setSessionLayout(this.session!.id, this.session!.revision, { activeDraftId: sourceId }, { signal: this.writes.signal });
        if (reverted.ok) this.session = reverted.value;
      }
      throw error;
    } finally { if (!activated) disposeNetwork(prepared.network); }
  }
  save(nameForSaveAs?: string): Promise<SessionResult<{ plan: ProjectSnapshot; savedSequence: number; hasNewerEdits: boolean }>> {
    return this.saveWork(this.activeId, nameForSaveAs, true);
  }
  saveOpenDraft(id: string, nameForSaveAs?: string): Promise<SessionResult<{ plan: ProjectSnapshot; savedSequence: number; hasNewerEdits: boolean }>> {
    return this.saveWork(id, nameForSaveAs, false);
  }
  private saveWork(requestedId: string | null, nameForSaveAs: string | undefined, requireActive: boolean): Promise<SessionResult<{ plan: ProjectSnapshot; savedSequence: number; hasNewerEdits: boolean }>> {
    return this.command(async () => {
      if (requireActive && this.activeId !== requestedId) fault('runtime-changed', 'The active draft changed while Save was queued; no different plan was saved.');
      this.ready(); if (requestedId === this.activeId) this.capture(); const e = requestedId ? this.entries.get(requestedId) : undefined; if (!e) fault('not-started', 'No open draft.');
      return this.queue(e, async () => {
        for (;;) { await this.persist(e); if (requestedId === this.activeId) this.capture(); if (e.sequence === e.persistedSequence) break; }
        const savedSequence = e.sequence;
        try {
          e.saving = true; this.publish();
          const token = { revision: e.persisted.revision, editSequence: savedSequence };
          const saved = take(await (nameForSaveAs === undefined
            ? this.workspace.saveDraft(e.persisted.id, token, { signal: this.writes.signal })
            : this.workspace.saveAsDraft(e.persisted.id, token, nameForSaveAs, { signal: this.writes.signal })));
          this.checkAlive(); this.acknowledge(e, saved); if (requestedId === this.activeId) this.capture(); this.error = null; this.publish();
          return { plan: saved.plan, savedSequence, hasNewerEdits: e.sequence !== savedSequence };
        } catch (error) { e.error = failure(error); throw error; }
        finally { e.saving = false; if (e.sequence !== e.persistedSequence) this.schedule(e); this.publish(); }
      });
    });
  }
  /** Export/duplicate recovery input: returns an owned copy, even after failure. */
  recoveryDocument(id?: string): ProjectDocument | null {
    if (id === undefined && this.phase !== 'disposed') { try { return encodeDraftDocument(this.runtime.capture()).document; } catch { /* Last valid capture remains recoverable. */ } }
    const selected = id ?? this.activeId, e = selected ? this.entries.get(selected) : undefined; return e ? structuredClone(e.document) : null;
  }
  offerShare(document: ProjectDocument): SessionResult<void> {
    try { this.checkAlive(); this.share = encodeDraftDocument(document).document; this.publish(); return { ok: true, value: undefined }; }
    catch (error) { return { ok: false, error: failure(error) }; }
  }
  dismissShare(): void { this.share = null; this.publish(); }
  acceptShare(options: { discardUnappliedForms?: boolean } = {}): Promise<SessionResult<string>> {
    const offered = this.share;
    const discard = options.discardUnappliedForms === true;
    return this.command(async () => {
      if (this.share !== offered) fault('runtime-changed', 'The Share Link offer changed before acceptance.');
      this.ready(); this.guardForms(discard); const share = this.share; if (!share) fault('not-started', 'No Share Link was offered.');
      take(await this.flush());
      const added = take(await this.workspace.createDraft(this.session!.id, this.session!.revision, { document: share, activate: false }, { signal: this.writes.signal }));
      this.checkAlive(); this.session = added.session; this.entries.set(added.draft.id, this.entry(added.draft));
      if (this.share === share) this.share = null;
      this.publish(); await this.switchTo(added.draft.id, discard); return added.draft.id;
    });
  }
  /** New/imported configuration enters as a separate unnamed working copy. */
  openDocument(input: ProjectDocument, options: { discardUnappliedForms?: boolean } = {}): Promise<SessionResult<string>> {
    const discard = options.discardUnappliedForms === true;
    let document: ProjectDocument;
    try { document = encodeDraftDocument(input).document; }
    catch (error) { return Promise.resolve({ ok: false, error: failure(error) }); }
    return this.command(async () => {
      this.ready(); this.guardForms(discard); take(await this.flush());
      const added = take(await this.workspace.createDraft(this.session!.id, this.session!.revision, { document, activate: false }, { signal: this.writes.signal }));
      this.checkAlive(); this.session = added.session; this.entries.set(added.draft.id, this.entry(added.draft)); this.publish();
      await this.switchTo(added.draft.id, discard); return added.draft.id;
    });
  }
  /** Load a manual plan without focusing it before the guarded handoff. */
  openPlan(planId: string, options: { discardUnappliedForms?: boolean } = {}): Promise<SessionResult<string>> {
    const discard = options.discardUnappliedForms === true;
    return this.command(async () => {
      this.ready(); this.guardForms(discard); take(await this.flush());
      const opened = take(await this.workspace.openPlanDraft(this.session!.id, this.session!.revision, planId, { signal: this.writes.signal, activate: false }));
      this.checkAlive(); this.session = opened.session;
      if (!this.entries.has(opened.draft.id)) this.entries.set(opened.draft.id, this.entry(opened.draft));
      this.publish(); await this.switchTo(opened.draft.id, discard); return opened.draft.id;
    });
  }
  reorderTabs(ids: readonly string[]): Promise<SessionResult<void>> {
    const order = [...ids];
    return this.command(async () => {
      this.ready();
      this.session = take(await this.workspace.setSessionLayout(this.session!.id, this.session!.revision, { draftIds: order }, { signal: this.writes.signal }));
      this.publish();
    });
  }
  closeDraft(id: string, options: { expectedEditSequence: number; discardChanges?: boolean; discardUnappliedForms?: boolean }): Promise<SessionResult<void>> {
    const consent = { ...options };
    return this.command(async () => {
      this.ready(); if (id === this.activeId) { this.guardForms(consent.discardUnappliedForms); this.capture(); }
      const e = this.entries.get(id); if (!e) fault('not-started', 'Draft is no longer open.');
      return this.queue(e, async () => {
        if (e.timer !== undefined) { clearTimeout(e.timer); e.timer = undefined; }
        let prepared: ReturnType<typeof prepareTopologyDocument> | undefined;
        const isActive = id === this.activeId;
        try {
          if (!consent.discardChanges) await this.persist(e);
          if (isActive) this.capture();
          if (e.sequence !== consent.expectedEditSequence) fault('runtime-changed', 'New edits arrived after the close decision; the topology was preserved.');
          let destination: OpenDraft | undefined;
          if (isActive) {
            const ids = this.session!.draftIds, index = ids.indexOf(id), next = ids[index + 1] ?? ids[index - 1];
            if (next) { const loaded = take(await this.workspace.loadDraft(next)); if (loaded.state !== 'open') fault('runtime-changed', 'Destination tab was closed.'); destination = loaded; }
            prepared = prepareTopologyDocument((destination?.document ?? empty).topology);
          }
          this.checkAlive(); if (isActive) { this.guardForms(consent.discardUnappliedForms); this.capture(); }
          if (e.sequence !== consent.expectedEditSequence) fault('runtime-changed', 'New edits arrived after the close decision.');
          const closeOptions = { signal: this.writes.signal, expectedActiveDraftRevision: destination?.revision };
          const close = consent.discardChanges ? this.workspace.discardDraft.bind(this.workspace) : this.workspace.closeDraft.bind(this.workspace);
          const closed = take(await close(this.session!.id, this.session!.revision, id,
            { revision: e.persisted.revision, editSequence: e.persistedSequence }, closeOptions));
          this.checkAlive(); if (isActive) this.capture();
          if (e.sequence !== consent.expectedEditSequence) fault('runtime-changed', 'The tab closed on disk while new edits arrived; export the preserved local copy.');
          this.session = closed.session; this.entries.delete(id); if (e.timer !== undefined) clearTimeout(e.timer);
          if (isActive && prepared) {
            this.runtime.activate(prepared, { sessionId: this.session.id, draftId: destination?.id ?? null }); prepared = undefined;
            this.activeId = destination?.id ?? null; if (destination) this.entries.set(destination.id, this.entry(destination));
          }
          this.error = null; this.publish();
        } finally { if (prepared) disposeNetwork(prepared.network); }
      });
    });
  }
  /** Explicit shutdown. Caller may flush first; dispose never claims unsaved
   * memory was persisted. Pending transactions abort and late results are ignored. */
  dispose(): void {
    if (this.phase === 'disposed') return;
    this.phase = 'disposed'; this.writes.abort();
    for (const e of this.entries.values()) if (e.timer !== undefined) clearTimeout(e.timer);
    this.disconnect?.(); this.disconnect = undefined; this.publish(); this.listeners.clear();
  }
}
