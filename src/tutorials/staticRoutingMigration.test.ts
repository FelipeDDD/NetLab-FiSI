import { expect, it } from 'vitest';
import { readStaticRoutingProgress, staticFinalProved } from './staticRoutingProgress';
import { staticRoutingCompletion } from './completion';

const hash = 'sha256-v1:' + 'a'.repeat(64);
const legacy = () => ({ schemaVersion: 1, chapterId: 'static-routing', chapterVersion: 1, draftId: 'draft', attemptId: '00000000-0000-4000-8000-000000000001', prepared: true,
  stage: 'lan-c', step: 8, completed: [1, 2, 3, 4, 5, 6, 7, 8], investigated: hash, missingAnswer: 'r1',
  extension: { pcMac: '02:00:00:00:00:01', switchMacs: Array.from({ length: 8 }, (_, i) => `02:00:00:00:01:0${i}`) },
  lineReplies: { ab: hash, ba: hash }, finalReplies: { ab: hash, ba: hash, ac: hash, ca: hash, bc: hash, cb: hash } });

it('recovers a completed legacy chapter without resetting the topology, attempt identity or scenario 2 receipts', () => {
  const old = legacy(), original = structuredClone(old), next = readStaticRoutingProgress(old, 'draft');
  expect(next.chapterVersion).toBe(2); expect(next.step).toBe(11); expect(next.completed).toEqual([1,2,3,4,5,6,7,8,9,10,11]);
  expect(next.attemptId).toBe(old.attemptId); expect(next.extension).toEqual(old.extension); expect(next.finalReplies).toEqual(old.finalReplies);
  expect(staticRoutingCompletion(next)).toEqual({ completed: 11, total: 11, complete: true }); expect(staticFinalProved(next)).toBe(true); expect(old).toEqual(original);
});

it('maps partial legacy progress conservatively without inventing new inspections or test receipts', () => {
  const old = { ...legacy(), stage: 'line', step: 3, completed: [1,2], extension: null };
  const next = readStaticRoutingProgress(old, 'draft');
  expect(next.step).toBe(2); expect(next.completed).toEqual([1]); expect(next.missingAnswer).toBe('r1');
  expect(next.inspectedR1).toBe(false); expect(next.retested).toBeNull(); expect(next.returnInvestigated).toBeNull();
});

it('recovers an interrupted legacy expansion at the equivalent boundary and rejects incompatible evidence', () => {
  const old = { ...legacy(), stage: 'expanding', step: 5, completed: [1,2,3,4,5], extension: null };
  expect(readStaticRoutingProgress(old, 'draft')).toMatchObject({ stage: 'expanding', step: 8, completed: [1,2,3,4,5,6,7,8] });
  for (const broken of [{ ...old, investigated: null }, { ...old, step: 8 }, { ...old, chapterVersion: 99 }, { ...old, lineReplies: { ab: null, ba: null } }]) expect(() => readStaticRoutingProgress(broken, 'draft')).toThrow('Incompatible');
});
