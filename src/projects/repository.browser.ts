// Runs against native IndexedDB in an isolated Chromium profile, never the app.
import { openProjectRepository, SCHEMA_KEY } from './repository';
import { PROJECT_DATABASE_VERSION, PROJECT_DOCUMENT_VERSION, type ProjectDocument } from './types';
import { normalizeProjectDocument } from './projectDocument';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { assert, equal, take, code, document, changed, request, dump, fixture } from './browserFixtures';
import { migrationBrowserCases } from './legacyMigration.browser';
import { workspaceBrowserCases } from './workspace.browser';
import { controllerBrowserCases } from '../persistence/sessionController.browser';

export const browserCases: Record<string, () => Promise<void>> = {
  ...migrationBrowserCases,
  ...workspaceBrowserCases,
  ...controllerBrowserCases,
  'four stores, independent versions and explicit opening': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw();
    equal([...db.objectStoreNames], ['documents', 'meta', 'projects', 'revisions']); equal(db.version, PROJECT_DATABASE_VERSION);
    const marker = take(await repo.getMeta(SCHEMA_KEY)); assert(marker && typeof marker.value === 'object');
    equal(take(await repo.listProjects()), []); equal(PROJECT_DOCUMENT_VERSION, 1);
    code(await repo.setMeta({ key: SCHEMA_KEY, expectedRevision: 1, value: null }), 'invalid-input');
  }),

  'CRUD, isolated snapshots, unique IDs and persistence after reopening': () => fixture(async ({ open }) => {
    let time = 1000; const repo = await open({ now: () => time++ });
    const input = document(), a = take(await repo.createProject({ name: '  First  ', document: input }));
    equal(a.project.name, 'First'); equal(a.project.revision, 1); equal(a.project.createdAt, a.project.updatedAt);
    assert(!a.document.topology.devices.some(d => d.id === a.project.id));
    input.topology.devices[0].name = 'caller mutation'; a.document.topology.devices[0].name = 'result mutation';
    assert(take(await repo.loadProject(a.project.id)).document.topology.devices[0].name !== 'result mutation');
    const updated = take(await repo.updateProject(a.project.id, 1, changed('saved')));
    equal(updated.project.revision, 2); const renamed = take(await repo.renameProject(a.project.id, 2, 'Renamed'));
    equal(renamed.project.revision, 3); equal(renamed.document, updated.document);
    const copy = take(await repo.duplicateProject(a.project.id, 3, 'Copy'));
    assert(copy.project.id !== a.project.id); equal(copy.project.revision, 1); equal(copy.document, renamed.document);
    equal(take(await repo.listProjects()).map(p => p.name), ['Copy', 'Renamed']);
    repo.close(); const reopened = await open(); equal(take(await reopened.loadProject(a.project.id)), renamed);
    code(await repo.loadProject(a.project.id), 'closed'); code(await reopened.loadProject(crypto.randomUUID()), 'not-found');
  }),

  'v1 legacy compatibility and exclusion of runtime fields': () => fixture(async ({ open }) => {
    const repo = await open();
    for (const topology of [...LABS, ...EXAMPLES.map(e => e.file)]) {
      const legacy = structuredClone(topology);
      for (const d of legacy.devices) if (d.kind === 'switch') d.ifaces = [];
      const input: ProjectDocument = { schemaVersion: 1, topology: legacy };
      Object.assign(input.topology, { packets: ['runtime'], topologyHistory: {}, scheduler: { now: 9000 } });
      Object.assign(input.topology.devices[0], { arpTable: { temporary: true }, sessions: ['xterm'] });
      const original = structuredClone(input);
      const created = take(await repo.createProject({ name: 'Legacy', document: input }));
      equal(input, original); equal(created.document, normalizeProjectDocument(input));
      for (const d of created.document.topology.devices) if (d.kind === 'switch') equal(d.ifaces.length, 8);
      const json = JSON.stringify(created.document);
      for (const key of ['topologyHistory', 'arpTable', 'xterm', 'scheduler']) assert(!json.includes(key));
      equal(take(await repo.loadProject(created.project.id)).document, created.document);
    }
  }),

  'invalid documents and names leave existing data intact': () => fixture(async ({ open }) => {
    const repo = await open(), a = take(await repo.createProject({ name: 'Original', document: document() }));
    code(await repo.updateProject(a.project.id, 1, { ...document(), schemaVersion: 2 } as never), 'incompatible-document');
    const future = document(); (future.topology as { version: number }).version = 2;
    code(await repo.updateProject(a.project.id, 1, future), 'incompatible-document');
    const broken = document(); broken.topology.links[0].a[0] = 'missing';
    code(await repo.updateProject(a.project.id, 1, broken), 'invalid-document');
    code(await repo.renameProject(a.project.id, 1, '  '), 'invalid-input');
    code(await repo.updateProject(a.project.id, 0, document()), 'invalid-input');
    equal(take(await repo.loadProject(a.project.id)), a); equal(take(await repo.listCheckpoints(a.project.id)), []);
  }),

  'legacy cable colors, terminal appearance, IPv4 and DHCP survive canonical storage': () => fixture(async ({ open }) => {
    const repo = await open(), input = document(), device = input.topology.devices.find(d => d.kind === 'host')!;
    device.ifaces[0] = { ...(device.ifaces[0] ?? { name: 'eth0', up: true }), ip: '192.0.2.2/24', ipv4Mode: 'static', gateway: '192.0.2.1', dns: '192.0.2.53' };
    device.os = 'windows'; device.nameserver = '192.0.2.54';
    device.dhcpServer = { enabled: false, rangeStart: '192.0.2.100', rangeEnd: '192.0.2.150', router: '192.0.2.1', dns: '192.0.2.53' };
    device.dhcpPools = { eth0: { ...device.dhcpServer } }; device.services = { tcp: [80, 443], udp: [53] };
    input.topology.ui = { terminalColors: { [device.id]: '#ABCDEF' }, terminalAppearance: { style: 'diagonal', intensity: 80 },
      terminalLayoutMode: 'by-type', cableColors: { [input.topology.links[0].id]: 'red' } };
    const snapshot = take(await repo.createProject({ name: 'Full legacy document', document: input }));
    const loaded = take(await repo.loadProject(snapshot.project.id)); equal(loaded.document, normalizeProjectDocument(input));
    equal(loaded.document.topology.ui?.terminalAppearance?.fontSize, 13);
    equal(loaded.document.topology.ui?.terminalColors?.[device.id], '#abcdef');
    equal(loaded.document.topology.ui?.cableColors?.[input.topology.links[0].id], { mode: 'manual', color: '#e76670' });
    equal(loaded.document.topology.devices.find(d => d.id === device.id)?.dhcpPools?.eth0.enabled, false);
  }),

  'optimistic concurrency across two independent connections': () => fixture(async ({ open }) => {
    const one = await open(), two = await open(), a = take(await one.createProject({ name: 'Concurrent', document: document() }));
    const results = await Promise.all([one.updateProject(a.project.id, 1, changed('one')), two.updateProject(a.project.id, 1, changed('two'))]);
    equal(results.filter(r => r.ok).length, 1); equal(results.filter(r => !r.ok && r.error.code === 'conflict').length, 1);
    const winner = take(await one.loadProject(a.project.id)); equal(winner.project.revision, 2);
    for (const action of [two.renameProject(a.project.id, 1, 'stale'), two.deleteProject(a.project.id, 1), two.duplicateProject(a.project.id, 1, 'stale copy'), two.restoreCheckpoint(a.project.id, 1, 1)]) code(await action, 'conflict');
    equal(take(await two.loadProject(a.project.id)), winner); equal(take(await one.listProjects()).length, 1);
  }),

  'bounded checkpoints, preview and explicit restoration with a new revision': () => fixture(async ({ open, raw }) => {
    const repo = await open({ checkpointLimit: 2 }); let a = take(await repo.createProject({ name: 'History', document: changed('one') }));
    for (const name of ['two', 'three', 'four']) a = take(await repo.updateProject(a.project.id, a.project.revision, changed(name)));
    equal(take(await repo.listCheckpoints(a.project.id)).map(c => c.revision), [3, 2]);
    code(await repo.loadCheckpoint(a.project.id, 1), 'checkpoint-not-found');
    const preview = take(await repo.loadCheckpoint(a.project.id, 2)); equal(preview.document.topology.devices[0].name, 'two');
    equal(take(await repo.loadProject(a.project.id)), a);
    const restored = take(await repo.restoreCheckpoint(a.project.id, 2, 4));
    equal(restored.project.revision, 5); equal(restored.project.name, 'History'); equal(restored.document, preview.document);
    equal(take(await repo.listCheckpoints(a.project.id)).map(c => c.revision), [4, 3]);
    equal(take(await repo.loadCheckpoint(a.project.id, 4)).document, a.document);
    const records = await dump(await raw()) as [unknown[], { revision: number }[], { revision: number }[], unknown[]];
    equal(records[1][0].revision, restored.project.revision); assert(records[2].every(c => c.revision < restored.project.revision));
  }),

  'soft deletion cannot be undone by stale writes or recreating the same ID': () => fixture(async ({ open }) => {
    const one = await open(), two = await open(), a = take(await one.createProject({ name: 'Deleted', document: document() }));
    const removed = take(await one.deleteProject(a.project.id, 1)); equal(removed.project.revision, 2); assert(removed.project.deletedAt !== null);
    equal(take(await one.listProjects()), []); equal(take(await one.listProjects({ includeDeleted: true })).length, 1);
    for (const action of [two.updateProject(a.project.id, 1, document()), two.renameProject(a.project.id, 1, 'old'), two.markOpened(a.project.id), two.duplicateProject(a.project.id, 1, 'old copy')]) code(await action, 'deleted');
    code(await two.createProject({ id: a.project.id, name: 'Recreate', document: document() }), 'already-exists');
    equal(take(await two.loadProject(a.project.id, { includeDeleted: true })), removed);
    code(await two.restoreDeletedProject(a.project.id, 1), 'conflict');
    const restored = take(await one.restoreDeletedProject(a.project.id, 2)); equal(restored.project.revision, 3); equal(restored.project.deletedAt, null);
    code(await two.updateProject(a.project.id, 1, document()), 'conflict'); equal(restored.document, a.document);
  }),

  'last opening is activity metadata and does not invalidate content revisions': () => fixture(async ({ open }) => {
    let now = 1000; const repo = await open({ now: () => now });
    const a = take(await repo.createProject({ name: 'Opened', document: document() })); now = 2000;
    const opened = take(await repo.markOpened(a.project.id)); equal(opened.lastOpenedAt, 2000); equal(opened.revision, 1); equal(opened.updatedAt, 1000);
    now = 3000; const updated = take(await repo.updateProject(a.project.id, 1, changed('after opening')));
    equal(updated.project.lastOpenedAt, 2000); equal(updated.project.updatedAt, 3000);
    now = 500; equal(take(await repo.markOpened(a.project.id)).lastOpenedAt, 2000);
    equal(take(await repo.listProjects({ sortBy: 'lastOpenedAt' }))[0].id, a.project.id);
  }),

  'control records use CAS and can commit atomically with project creation': () => fixture(async ({ open }) => {
    const repo = await open(), id = crypto.randomUUID();
    const a = take(await repo.createProject({ id, name: 'Atomic control', document: document(), control: [{ key: 'test:marker', expectedRevision: null, value: { projectId: id, raw: 'legacy text fixture' } }] }));
    const marker = take(await repo.getMeta('test:marker')); equal(marker?.revision, 1);
    code(await repo.createProject({ name: 'Must roll back', document: document(), control: [{ key: 'test:marker', expectedRevision: null, value: 'duplicate' }] }), 'meta-conflict');
    equal(take(await repo.listProjects()).length, 1); equal(take(await repo.loadProject(id)), a);
    const next = take(await repo.setMeta({ key: 'test:marker', expectedRevision: 1, value: ['updated'] })); equal(next.revision, 2);
    code(await repo.setMeta({ key: 'test:marker', expectedRevision: 1, value: null }), 'meta-conflict');
    code(await repo.setMeta({ key: 'bad', expectedRevision: null, value: { cache: new Map() } as never }), 'invalid-input');
  }),

  'quota failures roll back document, metadata, checkpoint and retention': () => fixture(async ({ open, raw }) => {
    const repo = await open({ checkpointLimit: 1 }), db = await raw();
    let a = take(await repo.createProject({ name: 'Before quota', document: document() }));
    a = take(await repo.updateProject(a.project.id, 1, changed('second'))); const before = await dump(db);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'documents') throw new DOMException('Synthetic quota at the native write boundary.', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { code(await repo.updateProject(a.project.id, 2, changed('lost write')), 'quota-exceeded'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before); equal(take(await repo.loadProject(a.project.id)), a);
  }),

  'abort after native request success cannot report success before commit': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw(), before = await dump(db);
    const controller = new AbortController(), add = IDBObjectStore.prototype.add;
    let requestSucceeded = false, settled = false;
    IDBObjectStore.prototype.add = function(...args: Parameters<typeof add>) {
      const r = add.apply(this, args);
      if (this.name === 'documents') r.addEventListener('success', () => { assert(!settled, 'Repository settled before commit.'); requestSucceeded = true; controller.abort(); });
      return r;
    };
    try {
      const result = await repo.createProject({ name: 'Abort', document: document(), control: [{ key: 'test:abort', expectedRevision: null, value: 'must not persist' }] }, { signal: controller.signal }).then(r => { settled = true; return r; });
      assert(requestSucceeded); code(result, 'aborted');
    } finally { IDBObjectStore.prototype.add = add; }
    equal(await dump(db), before);
    const already = new AbortController(); already.abort();
    code(await repo.createProject({ name: 'Cancelled', document: document() }, { signal: already.signal }), 'aborted'); equal(await dump(db), before);
  }),

  'successful writes resolve only after the native transaction complete event': () => fixture(async ({ open }) => {
    const repo = await open(), transaction = IDBDatabase.prototype.transaction;
    let committed = false;
    IDBDatabase.prototype.transaction = function(...args: Parameters<typeof transaction>) {
      const tx = transaction.apply(this, args);
      tx.addEventListener('complete', () => { committed = true; });
      return tx;
    };
    try { take(await repo.createProject({ name: 'Confirmed commit', document: document() })); assert(committed); }
    finally { IDBDatabase.prototype.transaction = transaction; }
  }),

  'native request errors also abort all pending writes': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw(), a = take(await repo.createProject({ name: 'Original', document: document() })), before = await dump(db);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      return this.name === 'projects' ? this.add(args[0]) : put.apply(this, args);
    };
    try { code(await repo.updateProject(a.project.id, 1, changed('constraint failure')), 'already-exists'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await dump(db), before);
  }),

  'abort after retention deletion restores pruned checkpoints and the current document': () => fixture(async ({ open, raw }) => {
    const repo = await open({ checkpointLimit: 1 }), db = await raw();
    let a = take(await repo.createProject({ name: 'Retention rollback', document: document() }));
    a = take(await repo.updateProject(a.project.id, 1, changed('second'))); const before = await dump(db);
    const controller = new AbortController(), remove = IDBObjectStore.prototype.delete; let pruned = false;
    IDBObjectStore.prototype.delete = function(key) {
      const r = remove.call(this, key);
      if (this.name === 'revisions') r.addEventListener('success', () => { pruned = true; controller.abort(); });
      return r;
    };
    try { code(await repo.updateProject(a.project.id, 2, changed('third'), { signal: controller.signal }), 'aborted'); assert(pruned); }
    finally { IDBObjectStore.prototype.delete = remove; }
    equal(await dump(db), before);
  }),

  'blocked opening returns a typed failure and cancels its delayed upgrade': () => fixture(async ({ name, open, raw }) => {
    const repo = await open(); repo.close();
    const blocking = await raw(); // Deliberately does not close on versionchange.
    const factory = { open: (n: string) => indexedDB.open(n, PROJECT_DATABASE_VERSION + 1) };
    code(await openProjectRepository({ databaseName: name, factory, openTimeoutMs: 1000 }), 'blocked');
    blocking.close();
    const unchanged = await raw(); equal(unchanged.version, PROJECT_DATABASE_VERSION);
    equal([...unchanged.objectStoreNames], ['documents', 'meta', 'projects', 'revisions']);
  }),

  'opening timeout behind a blocked deletion never creates a delayed database': () => fixture(async ({ name, open, raw }) => {
    const repo = await open(); repo.close(); const blocking = await raw();
    const deletion = indexedDB.deleteDatabase(name), deleted = request(deletion);
    let settleLate: () => void = () => {};
    const late = new Promise<void>(resolve => { settleLate = resolve; });
    const factory = { open: (n: string, version?: number) => {
      const r = indexedDB.open(n, version);
      r.addEventListener('success', settleLate); r.addEventListener('error', settleLate);
      return r;
    } };
    code(await openProjectRepository({ databaseName: name, factory, openTimeoutMs: 20 }), 'blocked');
    blocking.close(); await deleted; await late;
    assert(!(await indexedDB.databases()).some(db => db.name === name), 'Timed-out open created a database after returning failure.');
  }),

  'versionchange closes old connections and future database versions are preserved': () => fixture(async ({ name, open, raw }) => {
    const states: string[] = [], repo = await open({ onConnectionStateChange: state => { states.push(state); throw Error('Observer must not prevent close.'); } });
    const a = take(await repo.createProject({ name: 'Keep through upgrade', document: document() }));
    const future = await raw(PROJECT_DATABASE_VERSION + 1);
    equal(states, ['version-changed']); code(await repo.loadProject(a.project.id), 'version-changed');
    code(await openProjectRepository({ databaseName: name }), 'incompatible-database');
    const tx = future.transaction('projects');
    const completed = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    equal((await request(tx.objectStore('projects').get(a.project.id))).name, a.project.name); await completed;
  }),

  'unexpected connection closure is visible and does not reopen itself': () => fixture(async ({ name, open }) => {
    let connection: IDBDatabase | undefined;
    const factory = { open: (n: string, version?: number) => {
      const r = indexedDB.open(n, version); r.addEventListener('success', () => { connection = r.result; }); return r;
    } };
    const repo = await open({ factory }); take(await repo.createProject({ name: 'Survives closure', document: document() }));
    connection!.close(); connection!.dispatchEvent(new Event('close'));
    code(await repo.listProjects(), 'unavailable');
    const recovered = take(await openProjectRepository({ databaseName: name }));
    try { equal(take(await recovered.listProjects()).length, 1); } finally { recovered.close(); }
  }),

  'mismatched document and checkpoint revisions fail without repairing data': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw();
    const a = take(await repo.createProject({ name: 'Detect corruption', document: document() }));
    const tx = db.transaction('documents', 'readwrite');
    await request(tx.objectStore('documents').put({ projectId: a.project.id, revision: 99, document: a.document }));
    const before = await dump(db); code(await repo.loadProject(a.project.id), 'corrupt-data');
    code(await repo.updateProject(a.project.id, 1, document()), 'corrupt-data'); equal(await dump(db), before);
    const fix = db.transaction(['documents', 'revisions'], 'readwrite');
    await Promise.all([request(fix.objectStore('documents').put({ projectId: a.project.id, revision: 1, document: a.document })),
      request(fix.objectStore('revisions').put({ projectId: a.project.id, revision: 1, savedAt: 0, name: 'Impossible checkpoint', reason: 'update', document: a.document }))]);
    code(await repo.listCheckpoints(a.project.id), 'corrupt-data'); code(await repo.loadCheckpoint(a.project.id, 1), 'corrupt-data');
  }),

  'incompatible store layouts are rejected without rebuilding the database': () => fixture(async ({ name, raw }) => {
    const db = await raw(1, connection => connection.createObjectStore('unrelated')); db.close();
    code(await openProjectRepository({ databaseName: name }), 'incompatible-database');
    const after = await raw(); equal([...after.objectStoreNames], ['unrelated']); equal(after.version, 1);
  }),

  'unavailable storage and invalid repository options return typed failures': async () => {
    code(await openProjectRepository({ factory: null }), 'unavailable');
    code(await openProjectRepository({ factory: { open: () => { throw new DOMException('Denied', 'SecurityError'); } } }), 'unavailable');
    code(await openProjectRepository({ checkpointLimit: 0 }), 'invalid-input');
    code(await openProjectRepository({ checkpointLimit: 101 }), 'invalid-input');
    code(await openProjectRepository({ databaseName: '' }), 'invalid-input');
  },

  'incompatible stored document versions are reported without repair or overwrite': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw(), a = take(await repo.createProject({ name: 'Future document', document: document() }));
    const tx = db.transaction('documents', 'readwrite');
    await request(tx.objectStore('documents').put({ projectId: a.project.id, revision: 1, document: { schemaVersion: 2, topology: document().topology } }));
    const before = await dump(db);
    code(await repo.loadProject(a.project.id), 'incompatible-document');
    code(await repo.updateProject(a.project.id, 1, document()), 'incompatible-document'); equal(await dump(db), before);
  }),

  'valid checkpoints remain readable when the current document cannot be loaded': () => fixture(async ({ open, raw }) => {
    const repo = await open(), db = await raw(), a = take(await repo.createProject({ name: 'Recovery source', document: changed('checkpoint') }));
    take(await repo.updateProject(a.project.id, 1, changed('current')));
    const tx = db.transaction('documents', 'readwrite');
    await request(tx.objectStore('documents').put({ projectId: a.project.id, revision: 2, document: { schemaVersion: 2, topology: document().topology } }));
    const before = await dump(db);
    code(await repo.loadProject(a.project.id), 'incompatible-document'); equal(take(await repo.listCheckpoints(a.project.id)).length, 1);
    const checkpoint = take(await repo.loadCheckpoint(a.project.id, 1)); equal(checkpoint.document, a.document);
    code(await repo.restoreCheckpoint(a.project.id, 1, 2), 'incompatible-document'); equal(await dump(db), before);
    const copy = take(await repo.createProject({ name: 'Recovered copy', document: checkpoint.document }));
    assert(copy.project.id !== a.project.id); equal(copy.document, a.document);
  }),
};

export function crossTabDocument(): ProjectDocument { return document(); }
