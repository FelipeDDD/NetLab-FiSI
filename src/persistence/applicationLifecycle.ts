import type { SessionController } from './sessionController';
import type { SessionControllerState } from './sessionTypes';

export function needsPersistenceWarning(state: SessionControllerState | null, forms: boolean, operations = false, startup = false): boolean {
  return forms || operations || startup || state?.error?.code === 'runtime-changed'
    || !!state?.drafts.some(draft => draft.pendingPersistence || draft.saving);
}

/** Anticipate persistence while the page is alive. Closing is best-effort only. */
export function installApplicationLifecycle(options: {
  controller(): SessionController | undefined;
  pendingForms(): boolean;
  pendingStartup(): boolean;
  localStartupEdits(): boolean;
}, host: Window = window, document: Document = host.document): () => void {
  const flush = () => {
    const controller = options.controller(), state = controller?.getState();
    if (!controller || state?.phase !== 'ready') return;
    // Failed/conflicted copies require explicit retry, never silent overwrites.
    const active = state.drafts.find(d => d.id === state.activeDraftId);
    if (!active?.error) void controller.flush();
    for (const draft of state.drafts) if (draft.id !== state.activeDraftId && draft.pendingPersistence && !draft.error) void controller.flush(draft.id);
  };
  const beforeunload = (event: BeforeUnloadEvent) => {
    flush(); // Capture applied changes synchronously before inspecting the guard.
    const controller = options.controller();
    if (needsPersistenceWarning(controller?.getState() ?? null, options.pendingForms(), controller?.hasPendingOperations(), options.pendingStartup() || options.localStartupEdits())) {
      event.preventDefault(); event.returnValue = '';
    }
  };
  const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
  host.addEventListener('blur', flush);
  host.addEventListener('pagehide', flush);
  host.addEventListener('beforeunload', beforeunload);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    host.removeEventListener('blur', flush); host.removeEventListener('pagehide', flush);
    host.removeEventListener('beforeunload', beforeunload); document.removeEventListener('visibilitychange', visibility);
  };
}
