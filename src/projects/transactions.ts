import { classifyError, RepositoryFault } from './errors';
import type { RepositoryError, RepositoryResult } from './types';

export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

/** A synchronous DOMException must become a handled rejection before the rest
 * of a parallel request batch is evaluated (otherwise aborted siblings leak). */
export function issueRequest<T>(issue: () => IDBRequest<T>): Promise<T> {
  try { return requestValue(issue()); } catch (error) { return Promise.reject(error); }
}

/** work may await IDB requests only: no network, timers, UI or external hooks.
 * All outcomes wait for complete/abort; request success is never a commit. */
export function runTransaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>, signal?: AbortSignal): Promise<RepositoryResult<T>> {
  if (signal?.aborted) return Promise.resolve({ ok: false, error: { code: 'aborted', message: 'Operation cancelled before the transaction.' } });
  return new Promise(resolve => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction(stores, mode); }
    catch (error) { resolve({ ok: false, error: classifyError(error) }); return; }
    let result: T;
    let ready = false;
    let cause: RepositoryError | undefined;
    const cancel = () => {
      try {
        transaction.abort();
        cause = { code: 'aborted', message: 'Operation cancelled; transaction rolled back.' };
      } catch { /* A committed transaction cannot be cancelled retroactively. */ }
    };
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    transaction.oncomplete = () => {
      cleanup();
      resolve(ready && !cause ? { ok: true, value: result } : { ok: false, error: cause ?? { code: 'storage-error', message: 'Transaction completed without a result.' } });
    };
    transaction.onabort = () => {
      cleanup();
      resolve({ ok: false, error: cause ?? classifyError(transaction.error ?? new DOMException('Transaction aborted.', 'AbortError')) });
    };
    transaction.onerror = event => {
      const request = event.target as IDBRequest;
      cause ??= classifyError(request.error ?? transaction.error);
      // Do not preventDefault: request errors must abort and roll back.
    };
    signal?.addEventListener('abort', cancel, { once: true });
    void work(transaction).then(value => { result = value; ready = true; }).catch(error => {
      cause ??= error instanceof RepositoryFault ? error.detail : classifyError(error);
      try { transaction.abort(); } catch { /* The native error may already have aborted it. */ }
    });
  });
}
