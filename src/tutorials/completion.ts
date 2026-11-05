import type { TutorialProgress } from './tutorialProgress';
import type { SubnetProgress } from './subnetProgress';
import type { RouterProgress } from './routerProgress';
import { staticFinalProved, type StaticRoutingProgress } from './staticRoutingProgress';
import { alternativeFinalProved, type AlternativePathsProgress } from './alternativePathsProgress';

export interface ChapterCompletion { completed: number; total: number; complete: boolean }
const summarize = (steps: readonly number[], total: number): ChapterCompletion => {
  const completed = new Set(steps.filter(step => Number.isInteger(step) && step >= 1 && step <= total)).size;
  return { completed, total, complete: completed === total };
};
export const firstChapterCompletion = (record: Pick<TutorialProgress, 'completed'>) => summarize(record.completed, 8);
export function subnetChapterCompletion(record: SubnetProgress, corrected: boolean): ChapterCompletion {
  return summarize([
    ...(record.inspected && record.answerAccepted ? [1] : []),
    ...(record.demoPassed ? [2] : []),
    ...(record.unreachable ? [3] : []),
    ...(record.unreachable && corrected ? [4] : []),
    ...(corrected && record.replies.b && record.replies.c ? [5] : []),
  ], 5);
}
export function routerChapterCompletion(record: RouterProgress): ChapterCompletion {
  // Historical step numbers are navigation, never evidence of completion.
  // A persisted final Echo Reply also covers the brief window before step 8
  // was appended to completed in older runtimes. No records are rewritten.
  const steps = record.completed.filter(step => step !== 8);
  if (record.diagnosis.reply) steps.push(8);
  return summarize(steps, 8);
}
export const staticRoutingCompletion = (record: StaticRoutingProgress) => summarize(record.completed.filter(step => step !== 8 || staticFinalProved(record)), 8);
export const alternativePathsCompletion = (record: AlternativePathsProgress) => summarize(record.completed.filter(step => step !== 8 || alternativeFinalProved(record)), 8);
