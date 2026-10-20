export interface InspectorDraft { identity: string; source: string; text: string; stale: boolean }
export const newInspectorDraft = (identity: string, value: string): InspectorDraft => ({ identity, source: value, text: value, stale: false });

// Reconcile confirmed values, never simulation pulses. Keep a dirty draft
// visible, but prevent a later blur from overwriting a newer external value.
export function syncInspectorDraft(draft: InspectorDraft, identity: string, value: string): InspectorDraft {
  if (draft.identity !== identity) return newInspectorDraft(identity, value);
  if (draft.source === value) return draft;
  if (draft.text === draft.source || draft.text === value) return newInspectorDraft(identity, value);
  return { ...draft, source: value, stale: true };
}
