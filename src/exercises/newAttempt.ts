import type { SessionController } from '../persistence/sessionController';
import type { ProjectDocument } from '../projects/types';
import { useStore } from '../store';

/** New learning attempts inherit presentation, never the previous network's sessions. */
export async function openNewLearningAttempt(sessions: Pick<SessionController, 'openDocument'>, document: ProjectDocument) {
  const current = useStore.getState();
  const appearance = { ...current.terminalAppearance }, layout = current.terminalLayoutMode, collapsed = current.terminalDockCollapsed;
  const next = structuredClone(document);
  next.topology.ui = { ...next.topology.ui, terminalAppearance: appearance, terminalLayoutMode: layout };
  const result = await sessions.openDocument(next);
  const active = useStore.getState();
  // Collapsing is transient UI state. Do not override a terminal explicitly
  // opened while the new document was activating, or a different active draft.
  if (result.ok && active.workspaceIdentity?.draftId === result.value && !active.terminals.length) {
    useStore.setState({ terminalDockCollapsed: collapsed });
  }
  return result;
}
