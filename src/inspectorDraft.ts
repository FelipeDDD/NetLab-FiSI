export interface InspectorDraft { identity: string; source: string; text: string; stale: boolean; acceptedText?: string }
export const newInspectorDraft = (identity: string, value: string): InspectorDraft => ({ identity, source: value, text: value, stale: false });
export const inspectorDraftDirty = (draft: InspectorDraft): boolean => draft.text !== (draft.acceptedText ?? draft.source);
// A multiline editor may retain formatting which is not part of the model.
// Track the accepted text separately so formatting alone is not an unsaved form.
export function acceptedInspectorDraft(identity: string, source: string, text: string): InspectorDraft {
  return { ...newInspectorDraft(identity, source), text, acceptedText: text };
}

// Reconcile confirmed values, never simulation pulses. Keep a dirty draft
// visible, but prevent a later blur from overwriting a newer external value.
export function syncInspectorDraft(draft: InspectorDraft, identity: string, value: string): InspectorDraft {
  if (draft.identity !== identity) return newInspectorDraft(identity, value);
  if (draft.source === value) return draft;
  if (!inspectorDraftDirty(draft) || draft.text === value) return newInspectorDraft(identity, value);
  return { ...draft, source: value, stale: true };
}
