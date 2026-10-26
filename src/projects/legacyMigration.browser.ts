import LZString from 'lz-string';
import { migrateLegacyAutosave, loadLegacyArchive } from './legacyMigration';
import { identifyLegacySource, createLegacyRecoveryFile, readLegacyRecoveryFile } from './legacySource';
import { LEGACY_AUTOSAVE_KEY, type LegacyMigrationOptions, type LegacyMigrationRepository, type LegacyMigrationResult } from './legacyTypes';
import { assert, equal, take, document, changed, dump, fixture } from './browserFixtures';
import { normalizeProjectDocument } from './projectDocument';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import type { MetaValue } from './types';
import type { ProjectRepository } from './repository';

const origin = 'https://legacy-fixture.example';
const raw = () => JSON.stringify(document().topology, null, 2);
function options(repository: LegacyMigrationRepository, rawText = raw()): LegacyMigrationOptions {
  return { repository, storage: { getItem: key => { equal(key, LEGACY_AUTOSAVE_KEY); return rawText; } }, origin };
}
function succeeded(result: LegacyMigrationResult): asserts result is Extract<LegacyMigrationResult, { status: 'migrated' | 'already-migrated' }> {
  assert(result.status === 'migrated' || result.status === 'already-migrated', JSON.stringify(result));
}
function adapted(repo: ProjectRepository, override: Partial<LegacyMigrationRepository>): LegacyMigrationRepository {
  return { getMeta: repo.getMeta.bind(repo), setMeta: repo.setMeta.bind(repo), createProject: repo.createProject.bind(repo),
    loadProjectRecoveryState: repo.loadProjectRecoveryState.bind(repo), ...override };
}

export const migrationBrowserCases: Record<string, () => Promise<void>> = {
  'migration: valid source commits project, initial checkpoint, raw archive and marker': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), text = raw(), result = await migrateLegacyAutosave(options(repo, text)); succeeded(result);
    equal(result.status, 'migrated'); equal(result.project.project.revision, 2); equal(result.project.project.name, 'Topologia recuperada');
    equal(result.project.document, normalizeProjectDocument(document())); equal(result.sourceAfter.state, 'unchanged');
    const checkpoint = take(await repo.loadCheckpoint(result.project.project.id, 1)); equal(checkpoint.reason, 'initial'); equal(checkpoint.document, result.project.document);
    const archive = await loadLegacyArchive(repo, result.original.archiveKey); assert(archive.ok); equal(archive.archive.rawText, text);
    equal(readLegacyRecoveryFile(createLegacyRecoveryFile(archive.archive.rawText)), text);
    const records = await dump(await native()) as unknown[][]; equal(records.map(r => r.length), [1, 1, 1, 3]);
  }),

  'migration: rich identities, MACs, Wi-Fi, IPv4, DHCP, colors, firewall and Lab data survive': () => fixture(async ({ open }) => {
    const net = new Network(), notebook = createDevice(net, 'notebook', { os: 'windows' }), ap = createDevice(net, 'ap'), router = createDevice(net, 'router'), sw = createDevice(net, 'switch', { switchPorts: 24 });
    net.associate(notebook.id, ap.id); net.connect(ap.id, sw.id); net.connect(router.id, sw.id);
    const topology = serializeNetwork(net, Object.fromEntries([...net.devices.keys()].map((id, i) => [id, { x: i * 80, y: i * 40 }])));
    disposeNetwork(net);
    const r = topology.devices.find(d => d.id === router.id)!;
    r.ifaces[0] = { ...r.ifaces[0], ip: '192.0.2.1/24', ipv4Mode: 'static', gateway: null, dns: '192.0.2.53' };
    r.dhcpServer = { interfaceName: 'eth0', enabled: false, rangeStart: '192.0.2.100', rangeEnd: '192.0.2.150', router: '192.0.2.1', dns: '192.0.2.53' };
    r.dhcpPools = { eth0: { enabled: true, rangeStart: '192.0.2.151', rangeEnd: '192.0.2.199', router: '192.0.2.1', dns: '192.0.2.53' } };
    r.dnsServer = { enabled: false, records: [['UPPER.example', '192.0.2.2']] };
    r.httpServer = { enabled: false, port: 8080, body: 'recovery 🌐' }; r.services = { tcp: [8080, 80], udp: [53] };
    r.firewall = { tables: { filter: true, nat: true }, filter: { forward: { name: 'forward', policy: 'drop', rules: [{ match: { proto: 'tcp' }, verdict: 'accept' }] } },
      nat: { postrouting: { name: 'postrouting', rules: [{ match: { src: '192.0.2.0/24' }, action: { type: 'masquerade' } }] } } };
    topology.lab = structuredClone(LABS[0].lab!); topology.labProgress = { step: 0, results: { check: { pass: true, detail: 'kept' } }, quiz: { '0': 1 } };
    const input = { ...topology, ui: { cableColors: { [topology.links[0].id]: 'red' as const }, terminalColors: { [router.id]: '#ABCDEF' }, terminalAppearance: { style: 'diagonal' as const, intensity: 80 }, terminalLayoutMode: 'by-type' as const } };
    const text = JSON.stringify(input), repo = await open(), result = await migrateLegacyAutosave(options(repo, text)); succeeded(result);
    equal(result.project.document, normalizeProjectDocument({ schemaVersion: 1, topology: input }));
    equal(result.project.document.topology.devices.map(d => [d.id, d.ifaces.map(i => [i.name, i.mac])]), normalizeProjectDocument({ schemaVersion: 1, topology: input }).topology.devices.map(d => [d.id, d.ifaces.map(i => [i.name, i.mac]) ]));
    equal(result.original.rawText, text);
  }),

  'migration: absent autosave does not create any records': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), db = await native(), before = await dump(db);
    equal((await migrateLegacyAutosave({ ...options(repo), storage: { getItem: () => null } })).status, 'absent'); equal(await dump(db), before);
  }),

  'migration: repeated source remains idempotent after edits, checkpoint pruning and deletion': () => fixture(async ({ open }) => {
    const repo = await open({ checkpointLimit: 1 }), first = await migrateLegacyAutosave(options(repo)); succeeded(first);
    const id = first.project.project.id;
    let repeated = await migrateLegacyAutosave(options(repo)); succeeded(repeated); equal(repeated.status, 'already-migrated'); equal(repeated.project.project.id, id);
    const edited = take(await repo.updateProject(id, 2, changed('User edited project')));
    repeated = await migrateLegacyAutosave(options(repo)); succeeded(repeated); equal(repeated.project, edited);
    take(await repo.deleteProject(id, edited.project.revision));
    repeated = await migrateLegacyAutosave(options(repo)); succeeded(repeated); equal(repeated.deleted, true);
    equal(take(await repo.listProjects({ includeDeleted: true })).length, 1); equal(take(await repo.listProjects()).length, 0);
    const original = await loadLegacyArchive(repo, first.original.archiveKey); assert(original.ok); equal(original.archive.rawText, raw());
  }),

  'migration: concurrent connections commit exactly one complete bundle': () => fixture(async ({ open, raw: native }) => {
    const one = await open(), two = await open();
    const results = await Promise.all([migrateLegacyAutosave(options(one)), migrateLegacyAutosave(options(two))]);
    succeeded(results[0]); succeeded(results[1]); equal(results.map(r => r.status).sort(), ['already-migrated', 'migrated']);
    equal(results[0].project.project.id, results[1].project.project.id);
    equal((await dump(await native()) as unknown[][]).map(r => r.length), [1, 1, 1, 3]);
  }),

  'migration: changed legacy source becomes a distinct recoverable project without replacing edits': () => fixture(async ({ open }) => {
    const repo = await open(), a = await migrateLegacyAutosave(options(repo)); succeeded(a);
    const edited = take(await repo.updateProject(a.project.project.id, 2, changed('Independent user edits')));
    const nextRaw = JSON.stringify(changed('Legacy version B').topology);
    const b = await migrateLegacyAutosave(options(repo, nextRaw)); succeeded(b);
    assert(a.project.project.id !== b.project.project.id); assert(a.original.fingerprint !== b.original.fingerprint);
    equal(take(await repo.loadProject(a.project.project.id)), edited);
    equal((await loadLegacyArchive(repo, a.original.archiveKey)).ok, true); equal((await loadLegacyArchive(repo, b.original.archiveKey)).ok, true);
    equal(take(await repo.listProjects()).length, 2);
  }),

  'migration: a source changed during commit is reported and remains available for the next call': () => fixture(async ({ open }) => {
    const repo = await open(); let text = raw();
    const next = JSON.stringify(changed('Changed during commit').topology);
    const proxy = adapted(repo, { createProject: async (...args) => { const result = await repo.createProject(...args); text = next; return result; } });
    const result = await migrateLegacyAutosave({ ...options(proxy), storage: { getItem: () => text } }); succeeded(result);
    equal(result.sourceAfter, { state: 'changed', latestRawText: next });
    const second = await migrateLegacyAutosave(options(repo, text)); succeeded(second); equal(take(await repo.listProjects()).length, 2);
  }),

  'migration: interruption after all native writes but before commit rolls everything back': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), db = await native(), before = await dump(db), controller = new AbortController(), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      const r = put.apply(this, args), value = args[0] as { key?: string };
      if (this.name === 'meta' && value.key?.endsWith(':migration')) r.addEventListener('success', () => controller.abort());
      return r;
    };
    try {
      const result = await migrateLegacyAutosave({ ...options(repo), signal: controller.signal });
      assert(result.status === 'failed'); equal(result.diagnostic.code, 'aborted'); equal(await dump(db), before);
    } finally { IDBObjectStore.prototype.put = put; }
    const retry = await migrateLegacyAutosave(options(repo)); succeeded(retry); equal(retry.status, 'migrated');
  }),

  'migration: interruption after commit is recovered by verification without duplication': () => fixture(async ({ open }) => {
    const repo = await open(), controller = new AbortController();
    const proxy = adapted(repo, { createProject: async (...args) => { const result = await repo.createProject(...args); if (result.ok) controller.abort(); return result; } });
    const interrupted = await migrateLegacyAutosave({ ...options(proxy), signal: controller.signal });
    assert(interrupted.status === 'failed'); equal(interrupted.stage, 'verify'); assert(interrupted.committedProjectId);
    const retry = await migrateLegacyAutosave(options(repo)); succeeded(retry); equal(retry.status, 'already-migrated');
    equal(retry.project.project.id, interrupted.committedProjectId); equal(take(await repo.listProjects()).length, 1);
  }),

  'migration: lost commit response and failed readback never authorize a second project': () => fixture(async ({ open }) => {
    const repo = await open();
    const proxy = adapted(repo, { createProject: async (...args) => { await repo.createProject(...args); throw Error('Simulated lost response after commit.'); } });
    equal((await migrateLegacyAutosave(options(proxy))).status, 'failed');
    const readFailure = adapted(repo, { loadProjectRecoveryState: async () => ({ ok: false, error: { code: 'unavailable', message: 'Readback interrupted' } }) });
    const result = await migrateLegacyAutosave(options(readFailure)); assert(result.status === 'failed'); equal(result.stage, 'verify');
    const retry = await migrateLegacyAutosave(options(repo)); succeeded(retry); equal(retry.status, 'already-migrated'); equal(take(await repo.listProjects()).length, 1);
  }),

  'migration: localStorage read exceptions create no records': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), db = await native(), before = await dump(db);
    const result = await migrateLegacyAutosave({ ...options(repo), storage: { getItem: () => { throw Error('Read denied'); } } });
    assert(result.status === 'failed'); equal(result.stage, 'read'); equal(result.diagnostic.code, 'read-failed'); equal(await dump(db), before);
  }),

  'migration: unavailable IndexedDB preserves the raw source in memory for emergency export': () => fixture(async ({ open }) => {
    const repo = await open(); repo.close(); const text = raw();
    const result = await migrateLegacyAutosave(options(repo, text)); assert(result.status === 'failed'); equal(result.original?.rawText, text);
    equal(result.diagnostic.repositoryError?.code, 'closed'); equal(readLegacyRecoveryFile(createLegacyRecoveryFile(result.original!.rawText)), text);
    const invalid = await migrateLegacyAutosave(options(repo, '{broken')); assert(invalid.status === 'failed');
    equal(invalid.sourceDiagnostic?.code, 'invalid-json'); equal(invalid.original?.rawText, '{broken');
  }),

  'migration: quota failure at the final marker rolls back project, checkpoint and raw copy': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), db = await native(), before = await dump(db), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
      if (this.name === 'meta' && (args[0] as { key?: string }).key?.endsWith(':migration')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try {
      const result = await migrateLegacyAutosave(options(repo)); assert(result.status === 'failed'); equal(result.diagnostic.repositoryError?.code, 'quota-exceeded'); equal(await dump(db), before);
    } finally { IDBObjectStore.prototype.put = put; }
    const retry = await migrateLegacyAutosave(options(repo)); succeeded(retry);
  }),

  'migration: invalid JSON, future versions and partial/unknown data are archived without conversion': () => fixture(async ({ open, raw: native }) => {
    const repo = await open();
    const badLink = document().topology; badLink.links[0].a[0] = 'missing';
    const unknown = document().topology; (unknown.devices[0] as { kind: string }).kind = 'future-device';
    const cases = ['{broken', '', '\ud800', JSON.stringify({ app: 'netsim', version: 2, devices: [], links: [] }), JSON.stringify(badLink), JSON.stringify(unknown), JSON.stringify({ ...document().topology, ui: { cableColors: { orphan: 'red' } } }), JSON.stringify({ ...document().topology, unknown: false })];
    for (const text of cases) {
      const result = await migrateLegacyAutosave(options(repo, text)); assert(result.status === 'rejected', JSON.stringify(result));
      equal(result.archive.rawText, text); equal(take(await repo.getMeta(result.original.markerKey)), null);
      const persisted = await loadLegacyArchive(repo, result.original.archiveKey); assert(persisted.ok); equal(persisted.archive.rawText, text);
      const retry = await migrateLegacyAutosave(options(repo, text)); equal(retry.status, 'rejected');
    }
    equal(take(await repo.listProjects()), []); const records = await dump(await native()) as unknown[][]; equal(records[2].length, 0); equal(records[3].length, cases.length + 1);
  }),

  'migration: known legacy templates keep their compatibility': () => fixture(async ({ open }) => {
    const repo = await open();
    for (const topology of [...LABS, ...EXAMPLES.map(e => e.file)]) {
      const result = await migrateLegacyAutosave(options(repo, JSON.stringify(topology))); succeeded(result);
      equal(result.project.document, normalizeProjectDocument({ schemaVersion: 1, topology }));
    }
  }),

  'migration: tampered markers or archives fail verification without overwriting any records': () => fixture(async ({ open, raw: native }) => {
    const repo = await open(), result = await migrateLegacyAutosave(options(repo)); succeeded(result);
    const archive = take(await repo.getMeta(result.original.archiveKey))!;
    take(await repo.setMeta({ key: archive.key, expectedRevision: archive.revision, value: { ...(archive.value as object), rawText: 'tampered' } as MetaValue }));
    const db = await native(), before = await dump(db), failed = await migrateLegacyAutosave(options(repo));
    assert(failed.status === 'failed'); equal(failed.stage, 'verify'); equal(failed.diagnostic.code, 'integrity-error'); equal(await dump(db), before);
    equal(take(await repo.listProjects()).length, 1);
  }),

  'migration: Share Link cannot replace the legacy source, and native storage writers are never used': () => fixture(async ({ open }) => {
    const previous = localStorage.getItem(LEGACY_AUTOSAVE_KEY), previousUrl = location.href, text = raw();
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem, clear = Storage.prototype.clear;
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, text);
    history.replaceState(null, '', '#t=' + LZString.compressToEncodedURIComponent(JSON.stringify(changed('Shared separately').topology)));
    const hash = location.hash;
    Storage.prototype.setItem = Storage.prototype.removeItem = Storage.prototype.clear = () => { throw Error('Migration must never write browser storage.'); };
    try {
      const repo = await open(), result = await migrateLegacyAutosave({ ...options(repo), storage: { getItem: key => localStorage.getItem(key) } }); succeeded(result);
      equal(result.original.rawText, text); equal(localStorage.getItem(LEGACY_AUTOSAVE_KEY), text); equal(location.hash, hash);
    } finally {
      Storage.prototype.setItem = set; Storage.prototype.removeItem = remove; Storage.prototype.clear = clear;
      if (previous === null) localStorage.removeItem(LEGACY_AUTOSAVE_KEY); else localStorage.setItem(LEGACY_AUTOSAVE_KEY, previous);
      history.replaceState(null, '', previousUrl);
    }
  }),

  'migration: existing raw archive is reused with CAS in the same creation transaction': () => fixture(async ({ open }) => {
    const repo = await open(), original = await identifyLegacySource({ source: { storage: 'localStorage', key: LEGACY_AUTOSAVE_KEY, origin }, rawText: raw() });
    take(await repo.setMeta({ key: original.archiveKey, expectedRevision: null, value: { schemaVersion: 1, kind: 'legacy-autosave-archive', source: original.source, rawText: original.rawText, fingerprint: original.fingerprint, capturedAt: 1000, diagnostic: null } as unknown as MetaValue }));
    const result = await migrateLegacyAutosave(options(repo)); succeeded(result);
    const archive = await loadLegacyArchive(repo, original.archiveKey); assert(archive.ok); equal(archive.archive.capturedAt, 1000); equal(archive.archive.rawText, original.rawText);
  }),
};
