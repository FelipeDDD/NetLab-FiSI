// Native IndexedDB only; every case owns a disposable database/profile.
import { assert, equal, take, code, document, changed, dump, fixture, request } from './browserFixtures';
import { encodeDraftDocument } from './workspaceDocument';
import { DRAFT_PREFIX, SESSION_PREFIX, type DraftVersion, type SessionRecord } from './workspaceTypes';
import { migrateLegacyAutosave } from './legacyMigration';
import type { MetaRecord } from './types';

const token = (d: DraftVersion): DraftVersion => ({ revision: d.revision, editSequence: d.editSequence });
const sameDocument = (a: unknown, b: unknown) => equal(encodeDraftDocument(a).json, encodeDraftDocument(b).json);

export const workspaceBrowserCases: Record<string, () => Promise<void>> = {
  'workspace: independent drafts and empty sessions create no saved plans': () => fixture(async ({ open, raw }) => {
    const repo = await open(), w = repo.workspace;
    const empty = take(await w.createSession()); equal(empty.drafts, []); equal(empty.session.activeDraftId, null);
    const first = take(await w.createDraft(empty.session.id, 1, { document: document() }));
    assert(first.draft.dirty && first.draft.base === null); equal(first.draft.editSequence, 0);
    equal(first.session.draftIds, [first.draft.id]); equal(first.session.activeDraftId, first.draft.id);
    code(await w.saveDraft(first.draft.id, token(first.draft)), 'draft-not-saved');
    equal(take(await repo.listProjects()), []);
    equal((await dump(await raw())).map(r => (r as unknown[]).length), [0, 0, 0, 3]);
  }),

  'workspace: repeated draft autosaves preserve the manual document and create no checkpoints': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace;
    const plan = take(await repo.createProject({ name: 'Manual', document: document() }));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } }));
    let draft = s.drafts[0]; assert(!draft.dirty); equal(draft.base?.saveId, plan.project.id + '@1');
    for (let i = 1; i <= 12; i++) draft = take(await w.updateDraft(draft.id, { expectedRevision: draft.revision, editSequence: i, document: changed('move-' + i) })).draft;
    assert(draft.dirty); equal(draft.editSequence, 12); equal(draft.revision, 13);
    equal(take(await repo.loadProject(plan.project.id)), plan); equal(take(await repo.listCheckpoints(plan.project.id)), []);
    equal(take(await w.restoreSession(s.session.id)).session, s.session);
  }),

  'workspace: manual Save commits document, checkpoint and draft baseline together': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, plan = take(await repo.createProject({ name: 'Manual', document: document() }));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } }));
    const edited = take(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('manual Save') }));
    const saved = take(await w.saveDraft(edited.draft.id, token(edited.draft)));
    equal(saved.plan.project.revision, 2); equal(saved.draft.revision, 3); equal(saved.draft.editSequence, 1); assert(!saved.draft.dirty);
    equal(saved.draft.base?.planRevision, 2); sameDocument(saved.plan.document, edited.draft.document);
    sameDocument(take(await repo.loadCheckpoint(plan.project.id, 1)).document, plan.document);
    const noOp = take(await w.saveDraft(saved.draft.id, token(saved.draft)));
    equal(noOp.draft, saved.draft); equal(noOp.acknowledgement, saved.acknowledgement); equal(noOp.plan.project, saved.plan.project); sameDocument(noOp.plan.document, saved.plan.document);
    equal(take(await repo.listCheckpoints(plan.project.id)).map(c => c.revision), [1]);
    const newer = take(await w.updateDraft(saved.draft.id, { expectedRevision: 3, editSequence: 2, document: changed('after Save') }));
    assert(newer.draft.dirty); const stillManual = take(await repo.loadProject(plan.project.id));
    equal(stillManual.project, saved.plan.project); sameDocument(stillManual.document, saved.plan.document);
    const undone = take(await w.updateDraft(saved.draft.id, { expectedRevision: 4, editSequence: 3, document: edited.draft.document }));
    assert(!undone.draft.dirty, 'Returning to the exact Save baseline clears pending changes.');
  }),

  'workspace: Save As uses current draft and preserves the original manual plan': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, original = take(await repo.createProject({ name: 'Original', document: document() }));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: original.project.id } }));
    const edited = take(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('working copy') }));
    const copy = take(await w.saveAsDraft(edited.draft.id, token(edited.draft), ' Copy '));
    assert(copy.plan.project.id !== original.project.id); equal(copy.plan.project.name, 'Copy'); equal(copy.plan.project.revision, 1);
    sameDocument(copy.plan.document, edited.draft.document); equal(copy.draft.id, edited.draft.id); equal(copy.draft.base?.planId, copy.plan.project.id); assert(!copy.draft.dirty);
    equal(take(await repo.loadProject(original.project.id)), original); equal(take(await repo.listCheckpoints(original.project.id)), []);
    equal(take(await repo.listCheckpoints(copy.plan.project.id)), []); equal(take(await w.restoreSession(s.session.id)).session, s.session);
  }),

  'workspace: first Save As gives an unnamed draft a stable Save baseline': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: changed('untitled') } }));
    const saved = take(await w.saveAsDraft(s.drafts[0].id, token(s.drafts[0]), 'First Save'));
    equal(take(await repo.listProjects()).length, 1); assert(!saved.draft.dirty); equal(saved.draft.id, s.drafts[0].id);
    sameDocument(saved.plan.document, s.drafts[0].document); equal(saved.draft.base?.documentJson, encodeDraftDocument(saved.plan.document).json);
  }),

  'workspace: restore discovers persistent tabs, order, focus and unsaved documents after reconnect': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: changed('one') } }));
    const b = take(await w.createDraft(s.session.id, 1, { document: changed('two'), activate: false }));
    equal(b.session.activeDraftId, s.drafts[0].id);
    const c = take(await w.createDraft(s.session.id, 2, { document: changed('three') }));
    const layout = take(await w.setSessionLayout(s.session.id, 3, { draftIds: [c.draft.id, s.drafts[0].id, b.draft.id], activeDraftId: b.draft.id }));
    take(await w.updateDraft(b.draft.id, { expectedRevision: 1, editSequence: 1, document: changed('unsaved after reload') }));
    const before = take(await w.restoreSession(s.session.id)); repo.close();
    const reopened = (await open()).workspace, after = take(await reopened.restoreSession(s.session.id));
    equal(after, before); equal(after.session, layout); equal(after.drafts.map(d => d.id), layout.draftIds);
    equal(after.drafts[2].document.topology.devices[0].name, 'unsaved after reload');
    equal(take(await reopened.listSessions()).map(s => s.id), [s.session.id]);
  }),

  'workspace: opening an already open plan focuses its preserved dirty draft': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, plan = take(await repo.createProject({ name: 'Open', document: document() }));
    const s = take(await w.createSession()), loaded = take(await w.openPlanDraft(s.session.id, 1, plan.project.id));
    const edited = take(await w.updateDraft(loaded.draft.id, { expectedRevision: 1, editSequence: 1, document: changed('keep this') }));
    const other = take(await w.createDraft(s.session.id, 2, { document: document() }));
    const focused = take(await w.openPlanDraft(s.session.id, other.session.revision, plan.project.id));
    equal(focused.draft, edited.draft); equal(focused.session.activeDraftId, loaded.draft.id); equal(focused.session.draftIds.length, 2);
    equal(take(await repo.loadProject(plan.project.id)), plan);
  }),

  'workspace: closing modified tabs requires explicit discard and removes only that draft': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, plan = take(await repo.createProject({ name: 'Keep plan', document: document() }));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } }));
    const a = s.drafts[0], b = take(await w.createDraft(s.session.id, 1, { document: changed('discard me') }));
    code(await w.closeDraft(s.session.id, 2, b.draft.id, token(b.draft)), 'unsaved-draft');
    equal(take(await w.restoreSession(s.session.id)).drafts.length, 2);
    const closed = take(await w.discardDraft(s.session.id, 2, b.draft.id, token(b.draft)));
    equal(closed.session.draftIds, [a.id]); equal(closed.session.activeDraftId, a.id); assert(!('document' in closed.draft)); assert(!('base' in closed.draft));
    equal(take(await repo.loadProject(plan.project.id)), plan);
    const last = take(await w.closeDraft(s.session.id, 3, a.id, token(a))); equal(last.session.draftIds, []); equal(last.session.activeDraftId, null);
    equal(take(await w.restoreSession(s.session.id)).drafts, []);
  }),

  'workspace: late updates and stale session writes cannot resurrect discarded tabs': () => fixture(async ({ open, raw }) => {
    const one = await open(), two = await open(), s = take(await one.workspace.createSession({ initialTab: { kind: 'new', document: document() } })), d = s.drafts[0];
    const closed = take(await one.workspace.discardDraft(s.session.id, 1, d.id, token(d))), before = await dump(await raw());
    code(await two.workspace.updateDraft(d.id, { expectedRevision: 1, editSequence: 1, document: changed('late') }), 'draft-closed');
    code(await two.workspace.saveAsDraft(d.id, token(d), 'Late Save As'), 'draft-closed');
    code(await two.workspace.setSessionLayout(s.session.id, 1, { draftIds: [d.id], activeDraftId: d.id }), 'session-conflict');
    code(await two.workspace.setSessionLayout(s.session.id, closed.session.revision, { draftIds: [d.id], activeDraftId: d.id }), 'invalid-input');
    code(await two.workspace.createDraft(s.session.id, closed.session.revision, { id: d.id, document: document() }), 'already-exists');
    equal(await dump(await raw()), before); equal(take(await two.workspace.loadDraft(d.id)), closed.draft);
  }),

  'workspace: concurrent draft writers have one winner and retain the losing local document': () => fixture(async ({ open }) => {
    const one = await open(), two = await open(), s = take(await one.workspace.createSession({ initialTab: { kind: 'new', document: document() } })), d = s.drafts[0];
    const inputs = ['one', 'two'].map(name => ({ expectedRevision: 1, editSequence: 1, document: changed(name) }));
    const results = await Promise.all([one.workspace.updateDraft(d.id, inputs[0]), two.workspace.updateDraft(d.id, inputs[1])]);
    equal(results.filter(r => r.ok).length, 1); equal(results.filter(r => !r.ok && r.error.code === 'draft-conflict').length, 1);
    const persisted = take(await one.workspace.loadDraft(d.id)); assert(persisted.state === 'open');
    const winner = results.find(r => r.ok)!; assert(winner.ok); equal(persisted, winner.value.draft);
    equal(inputs.map(i => i.document.topology.devices[0].name), ['one', 'two']);
    code(await two.workspace.updateDraft(d.id, { expectedRevision: 2, editSequence: 1, document: changed('late with fresh CAS') }), 'stale-edit');
    code(await two.workspace.updateDraft(d.id, { expectedRevision: 1, editSequence: 2, document: changed('stale revision') }), 'draft-conflict');
    code(await two.workspace.saveAsDraft(d.id, { revision: 2, editSequence: 2 }, 'Not flushed'), 'stale-edit');
    equal(take(await one.workspace.loadDraft(d.id)), persisted);
  }),

  'workspace: concurrent session layouts reject stale changes without discarding draft edits': () => fixture(async ({ open }) => {
    const one = await open(), two = await open(), s = take(await one.workspace.createSession({ initialTab: { kind: 'new', document: document() } }));
    const b = take(await one.workspace.createDraft(s.session.id, 1, { document: changed('two') })), ids = b.session.draftIds;
    const results = await Promise.all([
      one.workspace.setSessionLayout(s.session.id, 2, { draftIds: [...ids].reverse(), activeDraftId: ids[0] }),
      two.workspace.setSessionLayout(s.session.id, 2, { activeDraftId: ids[0] }),
    ]);
    equal(results.filter(r => r.ok).length, 1); equal(results.filter(r => !r.ok && r.error.code === 'session-conflict').length, 1);
    take(await two.workspace.updateDraft(b.draft.id, { expectedRevision: 1, editSequence: 1, document: changed('background draft') }));
    const restored = take(await one.workspace.restoreSession(s.session.id)); equal(restored.session.revision, 3); equal(restored.drafts.length, 2);
    code(await one.workspace.setSessionLayout(s.session.id, 3, { draftIds: [ids[0], ids[0]] }), 'invalid-input');
    code(await one.workspace.setSessionLayout(s.session.id, 3, { activeDraftId: null }), 'invalid-input');
  }),

  'workspace: manual plan conflicts preserve both versions and allow explicit Save As': () => fixture(async ({ open }) => {
    const one = await open(), two = await open(), plan = take(await one.createProject({ name: 'Shared', document: document() }));
    const s = take(await one.workspace.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } }));
    const edited = take(await one.workspace.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('local') }));
    const external = take(await two.updateProject(plan.project.id, 1, changed('external')));
    code(await one.workspace.saveDraft(edited.draft.id, token(edited.draft)), 'conflict');
    equal(take(await one.loadProject(plan.project.id)), external); equal(take(await one.workspace.loadDraft(edited.draft.id)), edited.draft);
    const recovered = take(await one.workspace.saveAsDraft(edited.draft.id, token(edited.draft), 'Recovered local'));
    equal(recovered.plan.document.topology.devices[0].name, 'local'); equal(take(await two.loadProject(plan.project.id)), external);
  }),

  'workspace: drafts survive associated plan deletion and Save never revives it': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, plan = take(await repo.createProject({ name: 'Deleted', document: document() }));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } })), d = s.drafts[0];
    const deleted = take(await repo.deleteProject(plan.project.id, 1));
    equal(take(await w.restoreSession(s.session.id)).drafts[0], d);
    code(await w.closeDraft(s.session.id, 1, d.id, token(d)), 'deleted');
    const edited = take(await w.updateDraft(d.id, { expectedRevision: 1, editSequence: 1, document: changed('recovery') }));
    code(await w.saveDraft(d.id, token(edited.draft)), 'deleted');
    const recovered = take(await w.saveAsDraft(d.id, token(edited.draft), 'Recovery'));
    equal(recovered.plan.document.topology.devices[0].name, 'recovery');
    equal(take(await repo.loadProject(plan.project.id, { includeDeleted: true })), deleted);
  }),

  'workspace: abort after the last native Save request rolls back all four stores': () => fixture(async ({ open, raw }) => {
    const repo = await open({ checkpointLimit: 1 }), w = repo.workspace, plan = take(await repo.createProject({ name: 'Atomic', document: document() }));
    take(await repo.updateProject(plan.project.id, 1, changed('prior checkpoint')));
    const s = take(await w.createSession({ initialTab: { kind: 'plan', planId: plan.project.id } }));
    const edited = take(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('must abort') }));
    const db = await raw(), before = await dump(db), controller = new AbortController(), put = IDBObjectStore.prototype.put;
    let settled = false, succeeded = false;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      const r = put.apply(this, args);
      if (this.name === 'meta' && (args[0] as MetaRecord).key === DRAFT_PREFIX + edited.draft.id) r.addEventListener('success', () => {
        assert(!settled, 'Save must not resolve before the transaction commits.'); succeeded = true; controller.abort();
      });
      return r;
    };
    try { code(await w.saveDraft(edited.draft.id, token(edited.draft), { signal: controller.signal }).then(r => { settled = true; return r; }), 'aborted'); }
    finally { IDBObjectStore.prototype.put = put; }
    assert(succeeded); equal(await dump(db), before);
    equal(take(await w.loadDraft(edited.draft.id)), edited.draft);
  }),

  'workspace: quota on Save As baseline write rolls back the new saved plan': () => fixture(async ({ open, raw }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: document() } }));
    const db = await raw(), before = await dump(db), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'meta') throw new DOMException('Injected quota.', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { code(await w.saveAsDraft(s.drafts[0].id, token(s.drafts[0]), 'Must roll back'), 'quota-exceeded'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before);
  }),

  'workspace: session and draft creation, addition and closure are atomic on failure': () => fixture(async ({ open, raw }) => {
    const repo = await open(), w = repo.workspace, db = await raw();
    const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    let before = await dump(db);
    IDBObjectStore.prototype.add = function(...args: Parameters<typeof add>) {
      if (this.name === 'meta' && (args[0] as MetaRecord).key.startsWith(DRAFT_PREFIX)) throw new DOMException('Injected abort.', 'AbortError');
      return add.apply(this, args);
    };
    try { code(await w.createSession({ initialTab: { kind: 'new', document: document() } }), 'aborted'); }
    finally { IDBObjectStore.prototype.add = add; }
    equal(await dump(db), before);
    const s = take(await w.createSession({ initialTab: { kind: 'new', document: document() } })); before = await dump(db);
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'meta' && (args[0] as MetaRecord).key.startsWith(SESSION_PREFIX)) throw new DOMException('Injected abort.', 'AbortError');
      return put.apply(this, args);
    };
    try { code(await w.createDraft(s.session.id, 1, { document: changed('orphan') }), 'aborted'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before);
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      const r = put.apply(this, args);
      if (this.name === 'meta' && (args[0] as MetaRecord).key.startsWith(DRAFT_PREFIX)) r.addEventListener('success', () => this.transaction.abort());
      return r;
    };
    try { code(await w.discardDraft(s.session.id, 1, s.drafts[0].id, token(s.drafts[0])), 'aborted'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before);
  }),

  'workspace: failed draft autosave retains the previous document and no success receipt': () => fixture(async ({ open, raw }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: changed('safe') } }));
    const db = await raw(), before = await dump(db), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      const r = put.apply(this, args); if (this.name === 'meta') r.addEventListener('success', () => this.transaction.abort()); return r;
    };
    try { code(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('lost') }), 'aborted'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before);
    const controller = new AbortController(); controller.abort();
    code(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: changed('cancelled') }, { signal: controller.signal }), 'aborted');
    equal(await dump(db), before);
  }),

  'workspace: typed namespace and incompatible records are never silently repaired': () => fixture(async ({ open, raw }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: document() } })), db = await raw();
    code(await repo.setMeta({ key: DRAFT_PREFIX + s.drafts[0].id, expectedRevision: 1, value: null }), 'invalid-input');
    const tamper = async (value: unknown) => {
      const tx = db.transaction('meta', 'readwrite'); await request(tx.objectStore('meta').put(value));
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    };
    const key = DRAFT_PREFIX + s.drafts[0].id;
    await tamper({ key, revision: 1, value: { ...s.drafts[0], schemaVersion: 2 } }); const before = await dump(db);
    code(await w.restoreSession(s.session.id), 'incompatible-document');
    code(await w.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: document() }), 'incompatible-document');
    equal(await dump(db), before);
    await tamper({ key, revision: 1, value: { ...s.drafts[0], dirty: false } });
    code(await w.restoreSession(s.session.id), 'corrupt-data');
    await tamper({ key: SESSION_PREFIX + s.session.id, revision: 1, value: { ...s.session, draftIds: [crypto.randomUUID()] } });
    code(await w.restoreSession(s.session.id), 'corrupt-data');
  }),

  'workspace: persistent DTO excludes runtime, form text and history while preserving v1 appearance': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, input = document();
    input.topology.ui = { terminalAppearance: { style: 'diagonal', intensity: 70, fontSize: 16 }, terminalColors: { [input.topology.devices[0].id]: '#abcdef' } };
    Object.assign(input.topology, { arpCache: 'runtimeARP', packets: 'runtimePackets', scheduler: 'runtimeScheduler', undo: 'runtimeUndo', formText: 'unappliedText' });
    Object.assign(input.topology.devices[0], { macTable: 'runtimeMAC', xtermBuffer: 'runtimeXterm' });
    const original = structuredClone(input), s = take(await w.createSession({ initialTab: { kind: 'new', document: input } }));
    equal(input, original); const json = JSON.stringify(s.drafts[0]);
    for (const text of ['runtimeARP', 'runtimePackets', 'runtimeScheduler', 'runtimeUndo', 'runtimeMAC', 'runtimeXterm', 'unappliedText']) assert(!json.includes(text));
    sameDocument(s.drafts[0].document, input); equal(s.drafts[0].document.topology.ui?.terminalAppearance?.fontSize, 16);
    const saved = take(await w.saveAsDraft(s.drafts[0].id, token(s.drafts[0]), 'v1'));
    sameDocument(take(await repo.loadProject(saved.plan.project.id)).document, input);
    const invalid = { ...input, schemaVersion: 2 };
    code(await w.updateDraft(saved.draft.id, { expectedRevision: 2, editSequence: 1, document: invalid as never }), 'incompatible-document');
  }),

  'workspace: migrated projects, archives and technical recovery checkpoints remain compatible': () => fixture(async ({ open, raw }) => {
    const repo = await open(), result = await migrateLegacyAutosave({ repository: repo, storage: { getItem: () => JSON.stringify(document().topology) }, origin: 'https://workspace.example' });
    assert(result.status === 'migrated');
    const before = await dump(await raw()) as unknown[][], s = take(await repo.workspace.createSession({ initialTab: { kind: 'plan', planId: result.project.project.id } }));
    equal(s.drafts[0].base?.planRevision, 2); assert(!s.drafts[0].dirty);
    const preview = take(await repo.loadCheckpoint(result.project.project.id, 1));
    const edited = take(await repo.workspace.updateDraft(s.drafts[0].id, { expectedRevision: 1, editSequence: 1, document: preview.document }));
    assert(!edited.draft.dirty); const after = await dump(await raw()) as unknown[][];
    equal(after.slice(0, 3), before.slice(0, 3));
    equal(after[3].filter(r => !(r as MetaRecord).key.startsWith('workspace:')), before[3]);
  }),

  'workspace: pending API inputs are captured independently from caller mutations': () => fixture(async ({ open }) => {
    const repo = await open(), w = repo.workspace, s = take(await w.createSession({ initialTab: { kind: 'new', document: document() } }));
    const input = { expectedRevision: 1, editSequence: 1, document: changed('captured') };
    const pending = w.updateDraft(s.drafts[0].id, input); input.editSequence = 100; input.expectedRevision = 42; input.document.topology.devices[0].name = 'mutated';
    const edited = take(await pending); equal(edited.draft.editSequence, 1); equal(edited.draft.document.topology.devices[0].name, 'captured');
    const t = token(edited.draft), saving = w.saveAsDraft(edited.draft.id, t, 'Captured'); t.revision = 999; t.editSequence = 999;
    assert(!take(await saving).draft.dirty);
    const b = take(await w.createDraft(s.session.id, 1, { document: document() }));
    const layout: { draftIds: string[]; activeDraftId: string } = { draftIds: [...b.session.draftIds].reverse(), activeDraftId: edited.draft.id };
    const ordering = w.setSessionLayout(s.session.id, 2, layout); layout.draftIds.length = 0; layout.activeDraftId = 'mutated';
    const ordered: SessionRecord = take(await ordering); equal(ordered.activeDraftId, edited.draft.id); equal(ordered.draftIds.length, 2);
  }),
};
