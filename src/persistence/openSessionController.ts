import { openProjectRepository } from '../projects/repository';
import { createLegacyRecoveryFile, readLegacyAutosave } from '../projects/legacySource';
import type { RepositoryOptions } from '../projects/types';
import { SessionController, type SessionStartOptions } from './sessionController';
import type { SessionRuntime } from './sessionTypes';

/** Explicit entry shared by normal boot and isolated reviews. Storage opening
 * never installs browser listeners or activates an implicit legacy fallback. */
export async function openSessionController(options: {
  runtime: SessionRuntime;
  repositoryOptions?: RepositoryOptions;
  bootstrap?: SessionStartOptions;
  signal?: AbortSignal;
}) {
  if (options.signal?.aborted) return { ok: false as const, error: { code: 'aborted' as const, message: 'Startup cancelled.' }, legacyMode: true as const, recovery: recovery(options.bootstrap) };
  const opened = await openProjectRepository(options.repositoryOptions);
  if (opened.ok) {
    const controller = new SessionController(opened.value, options.runtime);
    const abort = () => controller.dispose();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const started = await controller.start(options.bootstrap);
    options.signal?.removeEventListener('abort', abort);
    if (started.ok && !options.signal?.aborted) return { ok: true as const, controller, repository: opened.value };
    controller.dispose(); opened.value.close();
    return { ok: false as const, error: started.ok ? { code: 'aborted' as const, message: 'Startup cancelled.' } : started.error, legacyMode: true as const, recovery: recovery(options.bootstrap) };
  }
  return { ok: false as const, error: opened.error, legacyMode: true as const, recovery: recovery(options.bootstrap) };
}

function recovery(options?: SessionStartOptions) {
  if (!options?.legacy) return null;
  const read = readLegacyAutosave(options.legacy.storage, options.legacy.origin);
  return { source: read, file: read.status === 'present' ? createLegacyRecoveryFile(read.original.rawText) : null };
}
