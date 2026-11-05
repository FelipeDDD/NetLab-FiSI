import { expect, it } from 'vitest';
import { firstChapterCompletion, routerChapterCompletion, subnetChapterCompletion } from './completion';
import { newSubnetProgress } from './subnetProgress';
import type { RouterProgress } from './routerProgress';

const hash = 'sha256-v1:' + 'a'.repeat(64);
const router = (): RouterProgress => ({ schemaVersion: 2, chapterId: 'two-networks', chapterVersion: 2, draftId: 'router-attempt', pcC: 'c', source: 'direct', prepared: true, step: 8, completed: [1, 2, 3], replies: { a: null, f: null }, diagnosis: { failure: false, reply: null } });
it('counts validated tasks rather than the open step, deduplicating task IDs', () => {
  expect(firstChapterCompletion({ completed: [1, 2, 3, 3] })).toEqual({ completed: 3, total: 8, complete: false });
  expect(firstChapterCompletion({ completed: [1, 2, 3, 4, 5, 6, 7] }).complete).toBe(false);
  expect(firstChapterCompletion({ completed: [1, 2, 3, 4, 5, 6, 7, 8] }).complete).toBe(true);
  expect(routerChapterCompletion(router())).toEqual({ completed: 3, total: 8, complete: false });
});
it('requires a real persisted final Echo Reply for Chapter 3, including older write ordering', () => {
  const r = router(); r.completed = [1, 2, 3, 4, 5, 6, 7, 8];
  expect(routerChapterCompletion(r)).toEqual({ completed: 7, total: 8, complete: false });
  r.diagnosis.reply = hash;
  expect(routerChapterCompletion(r).complete).toBe(true);
  r.completed = [1, 2, 3, 4, 5, 6, 7];
  expect(routerChapterCompletion(r)).toEqual({ completed: 8, total: 8, complete: true });
  r.completed = [1, 2];
  expect(routerChapterCompletion(r).complete).toBe(false);
});
it('uses Chapter 2 evidence and the existing correction validation, independently of its step', async () => {
  const r = await newSubnetProgress('subnet-attempt', 'c', 'network');
  r.step = 5;
  expect(subnetChapterCompletion(r, false)).toEqual({ completed: 0, total: 5, complete: false });
  r.inspected = r.answerAccepted = r.demoClaimed = r.demoPassed = r.unreachable = true;
  expect(subnetChapterCompletion(r, false)).toEqual({ completed: 3, total: 5, complete: false });
  expect(subnetChapterCompletion(r, true)).toEqual({ completed: 4, total: 5, complete: false });
  r.replies.b = hash;
  expect(subnetChapterCompletion(r, true).complete).toBe(false);
  r.replies.c = hash;
  expect(subnetChapterCompletion(r, true)).toEqual({ completed: 5, total: 5, complete: true });
  expect(subnetChapterCompletion(r, false).complete).toBe(false);
});
