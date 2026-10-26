import { useStore } from '../store';
import { hasPendingForms } from './pendingForms';
import type { SessionRuntime } from './sessionTypes';

/** Constructing the adapter does not claim the store or open storage. */
export function createZustandSessionRuntime(options: { pauseOnActivation?: boolean } = {}): SessionRuntime {
  return {
    capture: () => useStore.getState().captureWorkspaceDocument(),
    identity: () => useStore.getState().workspaceIdentity,
    connect: sink => useStore.getState().attachWorkspacePersistence(sink),
    activate: (prepared, identity) => {
      useStore.getState().activateWorkspaceDocument(prepared, identity);
      if (options.pauseOnActivation) useStore.getState().setPaused(true);
    },
    hasPendingForms,
  };
}
