import type { RepositoryError, RepositoryResult } from './types';

export class RepositoryFault extends Error {
  constructor(readonly detail: RepositoryError) { super(detail.message); }
}
export function fail(detail: RepositoryError): never { throw new RepositoryFault(detail); }
export function errorResult<T = never>(error: unknown): RepositoryResult<T> {
  return { ok: false, error: classifyError(error) };
}
export function classifyError(error: unknown): RepositoryError {
  if (error instanceof RepositoryFault) return error.detail;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : String(error);
  const codes = {
    QuotaExceededError: 'quota-exceeded', SecurityError: 'unavailable', NotSupportedError: 'unavailable',
    VersionError: 'incompatible-database', AbortError: 'aborted', ConstraintError: 'already-exists',
    InvalidStateError: 'closed', DataCloneError: 'invalid-input',
  } as const;
  return { code: codes[name as keyof typeof codes] ?? 'storage-error', message };
}
