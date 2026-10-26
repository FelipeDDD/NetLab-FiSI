import { describe, expect, it } from 'vitest';
import { assessDraftAcknowledgement } from './workspaceTypes';

describe('draft acknowledgements across asynchronous controller operations', () => {
  const local = { draftId: 'draft-a', editSequence: 7, knownRevision: 3, isOpen: true };
  it('confirms the exact content sequence only after a committed write', () => {
    expect(assessDraftAcknowledgement({ draftId: 'draft-a', revision: 4, editSequence: 7 }, local)).toEqual({ acceptRevision: true, isCurrentContent: true });
  });
  it('advances the storage revision without confirming newer local edits', () => {
    expect(assessDraftAcknowledgement({ draftId: 'draft-a', revision: 4, editSequence: 6 }, local)).toEqual({ acceptRevision: true, isCurrentContent: false });
  });
  it.each([
    { draftId: 'draft-a', revision: 2, editSequence: 7 },
    { draftId: 'another-draft', revision: 4, editSequence: 7 },
  ])('ignores late revisions or acknowledgements belonging to another draft: %o', ack => {
    expect(assessDraftAcknowledgement(ack, local)).toEqual({ acceptRevision: false, isCurrentContent: false });
  });
  it('ignores all receipts once the local draft has been closed', () => {
    expect(assessDraftAcknowledgement({ draftId: 'draft-a', revision: 4, editSequence: 7 }, { ...local, isOpen: false })).toEqual({ acceptRevision: false, isCurrentContent: false });
  });
  it('does not confirm a draft write superseded by a subsequent manual Save', () => {
    expect(assessDraftAcknowledgement({ draftId: 'draft-a', revision: 4, editSequence: 7 }, { ...local, knownRevision: 5 })).toEqual({ acceptRevision: false, isCurrentContent: false });
  });
});
