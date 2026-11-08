import { expect, it } from 'vitest';
import { readAlternativeProgress, emptyNeighborProofs } from './alternativePathsProgress';
import { alternativePathsCompletion } from './completion';
import { alternativePathsDocument } from './alternativePathsChapter';
import { readChapterCheckpoint } from './chapterCheckpoints';

const hash = `sha256-v1:${'a'.repeat(64)}`, other = `sha256-v1:${'b'.repeat(64)}`;
const legacy = () => ({ schemaVersion: 1, chapterId: 'alternative-paths', chapterVersion: 1, draftId: 'draft', attemptId: '00000000-0000-4000-8000-000000000001',
  prepared: true, stage: 'triangle', step: 1, completed: [] as number[], extension: null as null | { a: string; b: string }, neighbors: emptyNeighborProofs(), remoteUnderstood: false,
  hopUnderstood: false, lpmUnderstood: false, viaReplies: { ab: null as string | null, ba: null as string | null }, viaBaseline: null as string | null,
  failure: null as string | null, directReplies: { ab: null as string | null, ba: null as string | null } });
function through(step: number, completed = Array.from({ length: step - 1 }, (_, i) => i + 1)) {
  const p = legacy(); p.step = step; p.completed = completed;
  if (step >= 3 || completed.includes(2)) for (const key of Object.keys(p.neighbors) as (keyof typeof p.neighbors)[]) p.neighbors[key] = hash;
  if (step >= 4 || completed.includes(3)) p.remoteUnderstood = true;
  if (step >= 4) { p.stage = 'lans'; p.extension = { a: '02:00:00:00:00:01', b: '02:00:00:00:00:02' }; }
  if (step >= 6 || completed.includes(5)) p.viaReplies = { ab: hash, ba: hash };
  if (step >= 7 || completed.includes(6)) { p.hopUnderstood = p.lpmUnderstood = true; p.viaBaseline = hash; }
  if (step >= 8 || completed.includes(7)) p.failure = other;
  if (completed.includes(8)) p.directReplies = { ab: other, ba: other };
  return p;
}
it.each([[1, 1], [2, 1], [3, 4], [4, 5], [5, 7], [6, 13], [7, 15], [8, 16]])('migrates legacy navigation %i → %i without changing its receipts or input', (oldStep, nextStep) => {
  const p = through(oldStep), before = structuredClone(p), result = readAlternativeProgress(p, 'draft');
  expect(result.step).toBe(nextStep); expect(result.chapterVersion).toBe(2); expect(p).toEqual(before);
  for (const field of ['attemptId', 'prepared', 'stage', 'extension', 'neighbors', 'viaReplies', 'viaBaseline', 'failure', 'directReplies'] as const) expect(result[field]).toEqual(p[field]);
  expect(readAlternativeProgress(result, 'draft')).toEqual(result);
});
it('keeps a completed old attempt complete and maps all eight tasks to the seventeen new tasks', () => {
  const p = through(8, [1, 2, 3, 4, 5, 6, 7, 8]), result = readAlternativeProgress(p, 'draft');
  expect(result.step).toBe(17); expect(result.completed).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  expect(alternativePathsCompletion(result)).toEqual({ completed: 17, total: 17, complete: true });
  expect(result.investigated).toBe(hash); expect(result.returnInvestigated).toBe(hash);
});
it('does not invent ping evidence for an old addressing-only task or an unfinished route task', () => {
  const addressed = readAlternativeProgress(through(2, [1]), 'draft');
  expect(addressed.completed).toEqual([]); expect(addressed.neighbors).toEqual(emptyNeighborProofs());
  const partial = readAlternativeProgress(through(5), 'draft');
  expect(partial.completed).toEqual([1, 2, 3, 4, 5, 6]); expect(partial.investigated).toBeNull(); expect(partial.returnInvestigated).toBeNull();
});
it('recovers an old pending PC insertion at its mapped transition and retains initial checkpoints', () => {
  const pending = through(3, [1, 2, 3]); pending.stage = 'adding-pcs';
  expect(readAlternativeProgress(pending, 'draft')).toMatchObject({ stage: 'adding-pcs', step: 4, extension: null });
  const document = alternativePathsDocument(), checkpoint = { schemaVersion: 1, kind: 'chapter-checkpoint', chapter: 'alternative-paths', draftId: 'draft', attemptId: legacy().attemptId,
    before: document, initial: document, progress: legacy() };
  const before = structuredClone(checkpoint), read = readChapterCheckpoint(checkpoint, 'draft', 'alternative-paths');
  expect(read.progress).toMatchObject({ chapterVersion: 2, step: 1, completed: [] }); expect(checkpoint).toEqual(before);
});
it('rejects invalid old evidence before migrating and incomplete new final claims', () => {
  const bad = through(8, [1, 2, 3, 4, 5, 6, 7, 8]); bad.directReplies.ba = hash;
  expect(() => readAlternativeProgress(bad, 'draft')).toThrow('Incompatible');
  const p = through(3); p.neighbors.n21 = other;
  expect(() => readAlternativeProgress(p, 'draft')).toThrow('Incompatible');
  const next = readAlternativeProgress(legacy(), 'draft'); next.completed = [17];
  expect(() => readAlternativeProgress(next, 'draft')).toThrow('Incompatible');
  expect(() => readAlternativeProgress({ ...legacy(), chapterVersion: 3 }, 'draft')).toThrow('Incompatible');
});
