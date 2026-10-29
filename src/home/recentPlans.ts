import { PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_DOCUMENT_VERSION, type ProjectMetadata, type RepositoryOptions, type RepositoryResult } from '../projects/types';
import { validateMetadata, isObject } from '../projects/projectMetadata';
import { requestValue, runTransaction } from '../projects/transactions';
import { classifyError, fail } from '../projects/errors';

/** Metadata only. No session, migration, creation, upgrades or lastOpened writes.
 * Like readRecoveryArchive, abort creation on a fresh profile. */
export async function readRecentPlans(options: RepositoryOptions = {}): Promise<RepositoryResult<ProjectMetadata[]>> {
  try {
    const factory = options.factory === undefined ? globalThis.indexedDB : options.factory;
    if (!factory) return { ok: false, error: { code: 'unavailable', message: 'IndexedDB is unavailable.' } };
    return await new Promise(resolve => {
      let done = false, absent = false;
      const request = factory.open(options.databaseName ?? PROJECT_DATABASE_NAME);
      const finish = (value: RepositoryResult<ProjectMetadata[]>) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => finish({ ok: false, error: { code: 'blocked', message: 'Metadata read timed out.' } }), options.openTimeoutMs ?? 5000);
      request.onupgradeneeded = () => { absent = true; request.transaction!.abort(); };
      request.onblocked = () => finish({ ok: false, error: { code: 'blocked', message: 'Metadata read blocked.' } });
      request.onerror = () => finish(absent ? { ok: true, value: [] } : { ok: false, error: classifyError(request.error) });
      request.onsuccess = () => {
        const db = request.result;
        if (done) { db.close(); return; }
        db.onversionchange = () => db.close();
        void runTransaction(db, ['projects', 'meta'], 'readonly', async tx => {
          const marker = await requestValue(tx.objectStore('meta').get('repository:schema'));
          if (db.version !== PROJECT_DATABASE_VERSION || !isObject(marker) || marker.revision !== 1 || !isObject(marker.value) ||
              marker.value.databaseVersion !== PROJECT_DATABASE_VERSION || marker.value.projectDocumentVersion !== PROJECT_DOCUMENT_VERSION ||
              marker.value.topologyApp !== 'netsim' || marker.value.topologyVersion !== 1) {
            fail({ code: 'incompatible-database', message: 'Unsupported project metadata schema.' });
          }
          const records: unknown[] = await requestValue(tx.objectStore('projects').getAll());
          return records.map(record => validateMetadata(record)).filter(p => p.deletedAt === null)
            .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
        }).then(result => { db.close(); finish(result); });
      };
    });
  } catch (error) { return { ok: false, error: classifyError(error) }; }
}
