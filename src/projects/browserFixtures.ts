import { openProjectRepository, type ProjectRepository } from './repository';
import type { ProjectDocument, RepositoryOptions, RepositoryResult } from './types';
import { LABS } from '../labs/library';
import { sim } from '../sim';

export function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
export function equal(a: unknown, b: unknown): void { assert(JSON.stringify(a) === JSON.stringify(b), `Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`); }
export function take<T>(result: RepositoryResult<T>): T { if (!result.ok) throw new Error(JSON.stringify(result.error)); return result.value; }
export function code(result: RepositoryResult<unknown>, expected: string): void { assert(!result.ok); equal(result.error.code, expected); }
export const document = (): ProjectDocument => ({ schemaVersion: 1, topology: structuredClone(LABS[0]) });
export const changed = (name: string): ProjectDocument => { const d = document(); d.topology.devices[0].name = name; return d; };
export const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function rawOpen(name: string, version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const r = indexedDB.open(name, version); r.onupgradeneeded = () => upgrade?.(r.result); return request(r);
}
async function destroy(name: string): Promise<void> {
  assert(name.startsWith('netlab-idb-test-'), 'Only disposable test databases may be deleted.');
  const r = indexedDB.deleteDatabase(name);
  await new Promise<void>((resolve, reject) => {
    r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('Test database cleanup blocked.'));
  });
}
export async function dump(db: IDBDatabase): Promise<unknown[]> {
  const tx = db.transaction(['projects', 'documents', 'revisions', 'meta']);
  const completed = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  const values = await Promise.all(['projects', 'documents', 'revisions', 'meta'].map(name => request(tx.objectStore(name).getAll())));
  await completed; return values;
}
export async function fixture(run: (f: { name: string; open: (options?: RepositoryOptions) => Promise<ProjectRepository>; raw: (version?: number, upgrade?: (db: IDBDatabase) => void) => Promise<IDBDatabase> }) => Promise<void>): Promise<void> {
  const name = 'netlab-idb-test-' + crypto.randomUUID(), repositories: ProjectRepository[] = [], native: IDBDatabase[] = [], live = sim.net;
  try {
    await run({ name,
      open: async options => { const repo = take(await openProjectRepository({ ...options, databaseName: name })); repositories.push(repo); return repo; },
      raw: async (version, upgrade) => { const db = await rawOpen(name, version, upgrade); native.push(db); return db; },
    });
    assert(sim.net === live, 'Repository must never activate a network.');
  } finally { repositories.forEach(r => r.close()); native.forEach(db => db.close()); await destroy(name); }
}
