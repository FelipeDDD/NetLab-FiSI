import type { ProjectRepository } from '../projects/repository';
import type { MetaValue } from '../projects/types';
import { readStaticRoutingProgress, STATIC_PROGRESS_PREFIX, staticFinalProved } from './staticRoutingProgress';

export const STATIC_COMPLETION_KEY = 'guided:chapter-completion:v1:static-routing';
export interface StaticChapterCompletion {
  schemaVersion: 1; kind: 'chapter-completion'; chapterId: 'static-routing'; chapterVersion: 2;
  source: { draftId: string; attemptId: string; chapterVersion: number };
  recordedAt: number;
}
type Repository = Pick<ProjectRepository, 'getMeta' | 'setMeta'>;
export function readStaticCompletion(value: unknown): StaticChapterCompletion {
  const p = value as StaticChapterCompletion;
  if (!p || p.schemaVersion !== 1 || p.kind !== 'chapter-completion' || p.chapterId !== 'static-routing' || p.chapterVersion !== 2 ||
      !Number.isSafeInteger(p.recordedAt) || p.recordedAt < 0 || !p.source || typeof p.source.draftId !== 'string' || !p.source.draftId ||
      typeof p.source.attemptId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.source.attemptId) || ![1, 2].includes(p.source.chapterVersion)) throw Error('Incompatible static chapter completion.');
  return structuredClone(p);
}
/** Preserve a verified completion independently of the current attempt. Metadata only. */
export async function rememberStaticCompletion(repository: Repository, draftId: string): Promise<StaticChapterCompletion | null> {
  const existing = await repository.getMeta(STATIC_COMPLETION_KEY);
  if (!existing.ok) throw Error(existing.error.code);
  if (existing.value) return readStaticCompletion(existing.value.value);
  const source = await repository.getMeta(STATIC_PROGRESS_PREFIX + draftId);
  if (!source.ok) throw Error(source.error.code);
  if (!source.value) return null;
  const p = readStaticRoutingProgress(source.value.value, draftId);
  if (!Array.from({ length: 11 }, (_, i) => i + 1).every(n => p.completed.includes(n)) || !staticFinalProved(p)) return null;
  const value: StaticChapterCompletion = { schemaVersion: 1, kind: 'chapter-completion', chapterId: 'static-routing', chapterVersion: 2,
    source: { draftId, attemptId: p.attemptId, chapterVersion: (source.value.value as unknown as { chapterVersion: number }).chapterVersion }, recordedAt: Date.now() };
  const result = await repository.setMeta({ key: STATIC_COMPLETION_KEY, expectedRevision: null, value: value as unknown as MetaValue },
    { guards: [{ key: source.value.key, expectedRevision: source.value.revision }] });
  if (result.ok) return readStaticCompletion(result.value.value);
  if (result.error.code === 'meta-conflict' && result.error.key === STATIC_COMPLETION_KEY && result.error.current) return readStaticCompletion(result.error.current.value);
  throw Error(result.error.code);
}
