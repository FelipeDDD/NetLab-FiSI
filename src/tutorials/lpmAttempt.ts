import { createProjectId } from '../projects/projectDocument';
import type { MetaValue } from '../projects/types';
import type { OpenDocumentOptions } from '../persistence/sessionController';
import { lpmDocument } from './lpmChapter';
import { readLpmProgress, LPM_PROGRESS_PREFIX, type LpmProgress } from './lpmProgress';
import { checkpointKey, readChapterCheckpoint, type ChapterCheckpoint } from './chapterCheckpoints';

/** Draft, topology, progress and restart baseline commit together, before activation. */
export function createLpmAttempt() {
  const document = lpmDocument(), id = createProjectId();
  const progress = readLpmProgress({ schemaVersion: 1, chapterId: 'longest-prefix-match', chapterVersion: 1, draftId: id, attemptId: createProjectId(), step: 1, completed: [], inspected: false, compared: false, rule: false,
    identities: Object.fromEntries(document.topology.devices.map(d => [d.id, d.ifaces.map(i => i.mac)])), initial: null, short: null, restored: null } satisfies Omit<LpmProgress, 'identities'> & { identities: unknown }, id);
  const checkpoint: ChapterCheckpoint = { schemaVersion: 1, kind: 'chapter-checkpoint', chapter: 'longest-prefix-match', draftId: id, attemptId: progress.attemptId, before: document, initial: document, progress: progress as unknown as MetaValue };
  readChapterCheckpoint(checkpoint, id, 'longest-prefix-match');
  const options: OpenDocumentOptions = { initialization: { id, control: [
    { key: LPM_PROGRESS_PREFIX + id, expectedRevision: null, value: progress as unknown as MetaValue },
    { key: checkpointKey(id, 'longest-prefix-match'), expectedRevision: null, value: checkpoint as unknown as MetaValue },
  ] } };
  return { document, progress, checkpoint, options };
}
