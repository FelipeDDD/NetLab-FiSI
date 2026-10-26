import { openProjectRepository } from '../projects/repository';
import { createLegacyRecoveryFile, readLegacyAutosave } from '../projects/legacySource';
import type { RepositoryOptions } from '../projects/types';
import { SessionController } from './sessionController';
import type { SessionBootstrapOptions } from './sessionBootstrap';
import type { SessionRuntime } from './sessionTypes';

/** Explicit experimental entry. No environment detection, global storage,
 * listeners or normal-boot feature flag enables this by accident. */
export async function openSessionController(options: {
  runtime: SessionRuntime;
  repositoryOptions?: RepositoryOptions;
  bootstrap?: SessionBootstrapOptions;
}) {
  const opened = await openProjectRepository(options.repositoryOptions);
  if (opened.ok) {
    const controller = new SessionController(opened.value, options.runtime);
    const started = await controller.start(options.bootstrap);
    if (started.ok) return { ok: true as const, controller, repository: opened.value };
    controller.dispose(); opened.value.close();
    return { ok: false as const, error: started.error, legacyMode: true as const, recovery: recovery(options.bootstrap) };
  }
  return { ok: false as const, error: opened.error, legacyMode: true as const, recovery: recovery(options.bootstrap) };
}

function recovery(options?: SessionBootstrapOptions) {
  if (!options?.legacy) return null;
  const read = readLegacyAutosave(options.legacy.storage, options.legacy.origin);
  return { source: read, file: read.status === 'present' ? createLegacyRecoveryFile(read.original.rawText) : null };
}
