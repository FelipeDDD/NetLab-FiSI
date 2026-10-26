import { classifyError } from './errors';
import { PROJECT_DATABASE_NAME, type RepositoryOptions, type RepositoryResult } from './types';

/** Read raw records, including unsupported documents, without upgrading or
 * creating a database. This diagnostic backup is not a normal topology JSON. */
export async function readRecoveryArchive(options: RepositoryOptions = {}): Promise<RepositoryResult<{
  format: 'netlab-storage-recovery'; version: 1; database: string; databaseVersion: number; stores: Record<string, unknown[]>; keys: Record<string, IDBValidKey[]>;
}>> {
  try {
    const factory = options.factory === undefined ? globalThis.indexedDB : options.factory;
    if (!factory) return { ok: false, error: { code: 'unavailable', message: 'IndexedDB is unavailable.' } };
    const name = options.databaseName ?? PROJECT_DATABASE_NAME;
    return await new Promise(resolve => {
      let done = false, created = false;
      const request = factory.open(name); // No version: never upgrade existing storage.
      const finish = (result: Parameters<typeof resolve>[0]) => { if (!done) { done = true; clearTimeout(timer); resolve(result); } };
      const timer = setTimeout(() => finish({ ok: false, error: { code: 'blocked', message: 'Recovery read timed out.' } }), options.openTimeoutMs ?? 5000);
      request.onupgradeneeded = () => { created = true; request.transaction!.abort(); };
      request.onblocked = () => finish({ ok: false, error: { code: 'blocked', message: 'Recovery read is blocked.' } });
      request.onerror = () => finish({ ok: false, error: created ? { code: 'unavailable', message: 'No existing database to export.' } : classifyError(request.error) });
      request.onsuccess = () => {
        const db = request.result;
        if (done) { db.close(); return; }
        db.onversionchange = () => db.close();
        try {
          const names = [...db.objectStoreNames], stores: Record<string, unknown[]> = Object.create(null), keys: Record<string, IDBValidKey[]> = Object.create(null);
          if (!names.length) { db.close(); finish({ ok: true, value: { format: 'netlab-storage-recovery', version: 1, database: name, databaseVersion: db.version, stores, keys } }); return; }
          const tx = db.transaction(names, 'readonly');
          for (const store of names) {
            const source = tx.objectStore(store), read = source.getAll(), readKeys = source.getAllKeys();
            read.onsuccess = () => { stores[store] = read.result; }; readKeys.onsuccess = () => { keys[store] = readKeys.result; };
          }
          tx.oncomplete = () => { db.close(); finish({ ok: true, value: { format: 'netlab-storage-recovery', version: 1, database: name, databaseVersion: db.version, stores, keys } }); };
          tx.onabort = () => { db.close(); finish({ ok: false, error: classifyError(tx.error) }); };
        } catch (error) { db.close(); finish({ ok: false, error: classifyError(error) }); }
      };
    });
  } catch (error) { return { ok: false, error: classifyError(error) }; }
}
