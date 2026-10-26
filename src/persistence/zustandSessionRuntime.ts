import { useStore } from '../store';
import { hasPendingForms } from './pendingForms';
import type { SessionRuntime } from './sessionTypes';

/** Opt-in only. No reference from main.tsx or the legacy boot. */
export function createZustandSessionRuntime(): SessionRuntime {
  return {
    capture: () => useStore.getState().captureWorkspaceDocument(),
    identity: () => useStore.getState().workspaceIdentity,
    connect: sink => useStore.getState().attachWorkspacePersistence(sink),
    activate: (prepared, identity) => useStore.getState().activateWorkspaceDocument(prepared, identity),
    hasPendingForms,
  };
}
