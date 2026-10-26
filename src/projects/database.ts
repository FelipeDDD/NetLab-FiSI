import { classifyError, errorResult, fail } from './errors';
import { requestValue, runTransaction } from './transactions';
import { isObject } from './projectDocument';
import { PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_DOCUMENT_VERSION, type RepositoryOptions, type RepositoryResult } from './types';

export const SCHEMA_KEY = 'repository:schema';
export const STORE_NAMES = ['projects', 'documents', 'revisions', 'meta'];

const schema = {
  projects: { key: 'id', indexes: { byUpdatedAt: 'updatedAt', byLastOpenedAt: 'lastOpenedAt' } },
  documents: { key: 'projectId', indexes: {} },
  revisions: { key: ['projectId', 'revision'], indexes: { byProject: 'projectId' } },
  meta: { key: 'key', indexes: {} },
};

export function openDatabase(options: RepositoryOptions): Promise<RepositoryResult<IDBDatabase>> {
  try {
    const factory = options.factory === undefined ? globalThis.indexedDB : options.factory;
    if (!factory) return Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'IndexedDB is unavailable.' } });
    const name = options.databaseName ?? PROJECT_DATABASE_NAME;
    const timeout = options.openTimeoutMs ?? 5000;
    if (typeof name !== 'string' || !name.trim() || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) {
      return Promise.resolve({ ok: false, error: { code: 'invalid-input', message: 'Invalid database name or opening timeout (1–60000 ms).' } });
    }
    const request = factory.open(name, PROJECT_DATABASE_VERSION);
    return new Promise(resolve => {
      let settled = false;
      let upgradeError: unknown;
      const finish = (result: RepositoryResult<IDBDatabase>) => {
        if (settled) { if (result.ok) result.value.close(); return; }
        settled = true; clearTimeout(timer); resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, error: { code: 'blocked', message: 'Opening IndexedDB timed out; close other connections and retry.' } }), timeout);
      request.onblocked = () => finish({ ok: false, error: { code: 'blocked', message: 'IndexedDB opening is blocked by another connection.' } });
      request.onerror = () => finish(errorResult(upgradeError ?? request.error));
      request.onupgradeneeded = event => {
        // IDBOpenDBRequest cannot be cancelled. Abort any delayed upgrade after
        // a blocked/timeout result so it never changes a database in the background.
        if (settled) { request.transaction!.abort(); return; }
        try {
          if (event.oldVersion !== 0) fail({ code: 'incompatible-database', message: 'No database migration is implemented in this repository version.' });
          for (const [storeName, definition] of Object.entries(schema)) {
            const store = request.result.createObjectStore(storeName, { keyPath: definition.key });
            for (const [indexName, keyPath] of Object.entries(definition.indexes)) store.createIndex(indexName, keyPath);
          }
          request.transaction!.objectStore('meta').add({ key: SCHEMA_KEY, revision: 1,
            value: { databaseVersion: PROJECT_DATABASE_VERSION, projectDocumentVersion: PROJECT_DOCUMENT_VERSION, topologyApp: 'netsim', topologyVersion: 1 } });
        } catch (error) { upgradeError = error; request.transaction!.abort(); }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => { db.close(); finish({ ok: false, error: { code: 'version-changed', message: 'Database version changed while opening.' } }); };
        db.onclose = () => finish({ ok: false, error: { code: 'unavailable', message: 'Database connection closed unexpectedly.' } });
        void runTransaction(db, STORE_NAMES, 'readonly', async tx => {
          if (db.version !== PROJECT_DATABASE_VERSION || [...db.objectStoreNames].sort().join() !== [...STORE_NAMES].sort().join()) fail({ code: 'incompatible-database', message: 'Unexpected database schema.' });
          for (const [storeName, definition] of Object.entries(schema)) {
            const store = tx.objectStore(storeName);
            if (JSON.stringify(store.keyPath) !== JSON.stringify(definition.key) || store.autoIncrement || [...store.indexNames].sort().join() !== Object.keys(definition.indexes).sort().join()) fail({ code: 'incompatible-database', message: 'Unexpected store schema: ' + storeName });
            for (const [indexName, keyPath] of Object.entries(definition.indexes)) {
              const index = store.index(indexName);
              if (index.keyPath !== keyPath || index.unique || index.multiEntry) fail({ code: 'incompatible-database', message: 'Unexpected index: ' + indexName });
            }
          }
          const marker: unknown = await requestValue(tx.objectStore('meta').get(SCHEMA_KEY));
          if (!isObject(marker) || marker.revision !== 1 || !isObject(marker.value) || marker.value.databaseVersion !== PROJECT_DATABASE_VERSION || marker.value.projectDocumentVersion !== PROJECT_DOCUMENT_VERSION || marker.value.topologyApp !== 'netsim' || marker.value.topologyVersion !== 1) fail({ code: 'incompatible-database', message: 'Missing or incompatible repository schema marker.' });
          return db;
        }).then(result => {
          if (!result.ok) { db.close(); finish(result.error.code === 'storage-error' ? { ok: false, error: { code: 'incompatible-database', message: result.error.message } } : result); }
          else finish(result);
        });
      };
    });
  } catch (error) {
    const detail = classifyError(error);
    return Promise.resolve({ ok: false, error: detail.code === 'storage-error' ? { code: 'unavailable', message: detail.message } : detail });
  }
}
