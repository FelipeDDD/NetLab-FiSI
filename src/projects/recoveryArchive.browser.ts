import { readRecoveryArchive } from './recoveryArchive';
import { assert, code, document, dump, equal, fixture, take } from './browserFixtures';
import { openSessionController } from '../persistence/openSessionController';
import { memoryRuntime } from '../persistence/sessionController.browser';

export const recoveryBrowserCases: Record<string, () => Promise<void>> = {
  'recovery: absent storage is not created and raw backups never mutate records': () => fixture(async ({ name, open, raw }) => {
    code(await readRecoveryArchive({ databaseName: name }), 'unavailable');
    assert(!(await indexedDB.databases()).some(d => d.name === name));
    const repo = await open(); take(await repo.createProject({ name: 'Preserved', document: document() }));
    const db = await raw(), before = await dump(db);
    const archive = take(await readRecoveryArchive({ databaseName: name }));
    equal(archive.format, 'netlab-storage-recovery'); equal(archive.stores.projects.length, 1);
    equal(await dump(db), before);
  }),
  'recovery: an unsupported database remains exportable without upgrade or normalization': () => fixture(async ({ name, raw }) => {
    const db = await raw(25, database => database.createObjectStore('future'));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('future', 'readwrite'); tx.objectStore('future').put({ schemaVersion: 99, raw: 'preserve exactly' }, 'document');
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    const archive = take(await readRecoveryArchive({ databaseName: name }));
    equal(archive.databaseVersion, 25); equal(archive.stores.future, [{ schemaVersion: 99, raw: 'preserve exactly' }]); equal(archive.keys.future, ['document']);
  }),
  'boot: edits while opening storage survive failure and retries with a fresh controller': () => fixture(async ({ name, open }) => {
    await open(); const initial = document(), runtime = memoryRuntime(initial);
    runtime.edit('local edit while opening');
    try {
      for (let i = 0; i < 2; i++) {
        const result = await openSessionController({ runtime: runtime.api, repositoryOptions: { databaseName: name }, bootstrap: { expectedRuntimeDocument: initial } });
        assert(!result.ok); equal(result.error.code, 'runtime-changed'); equal(runtime.activations, 0);
        equal(runtime.api.capture().topology.devices[0].name, 'local edit while opening');
      }
    } finally { runtime.dispose(); }
  }),
  'boot: cancelled startup never claims or activates the live simulation': () => fixture(async ({ name }) => {
    const runtime = memoryRuntime(), signal = new AbortController(); signal.abort();
    try {
      const result = await openSessionController({ runtime: runtime.api, repositoryOptions: { databaseName: name }, signal: signal.signal });
      assert(!result.ok); equal(result.error.code, 'aborted'); equal(runtime.activations, 0);
      assert(!(await indexedDB.databases()).some(d => d.name === name));
    } finally { runtime.dispose(); }
  }),
};
