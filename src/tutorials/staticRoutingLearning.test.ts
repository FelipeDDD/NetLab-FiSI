import { expect, it } from 'vitest';
import type { MetaRecord, MetaValue, RepositoryError } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import { STATIC_COMPLETION_KEY, readStaticCompletion, rememberStaticCompletion } from './staticRoutingLearning';
import { STATIC_PROGRESS_PREFIX, StaticRoutingProgressStore, readStaticRoutingProgress } from './staticRoutingProgress';
import { loadTutorialMenuProgress } from './menuProgress';

const hash = 'sha256-v1:' + 'a'.repeat(64);
function full(draftId = 'done') {
  return { schemaVersion: 1, chapterId: 'static-routing', chapterVersion: 2, draftId, attemptId: crypto.randomUUID(), prepared: true,
    stage: 'lan-c', step: 11, completed: Array.from({ length: 11 }, (_, i) => i + 1), investigated: hash, missingAnswer: 'r1',
    extension: { pcMac: '02:00:00:00:00:01', switchMacs: Array.from({ length: 8 }, (_, i) => `02:00:00:00:01:0${i}`) },
    inspectedR1: true, retested: hash, returnInvestigated: hash, lineReplies: { ab: hash, ba: hash }, finalReplies: { ab: hash, ba: hash, ac: hash, ca: hash, bc: hash, cb: hash } };
}
function storage() {
  const meta = new Map<string, MetaRecord>(); let fault: RepositoryError | null = null, intercept: (() => void) | undefined;
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async (m, options) => {
      const action = intercept; intercept = undefined; action?.(); if (fault) return { ok: false, error: fault };
      for (const g of [...options?.guards ?? [], m]) { const current = meta.get(g.key) ?? null; if ((current?.revision ?? null) !== g.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: g.key, current, expectedRevision: g.expectedRevision, message: 'Conflict' } }; }
      const record = { key: m.key, revision: (meta.get(m.key)?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, record); return { ok: true, value: record };
    },
  };
  return { meta, repository, put(id: string, value: unknown) { meta.set(STATIC_PROGRESS_PREFIX + id, { key: STATIC_PROGRESS_PREFIX + id, revision: 1, value: structuredClone(value) as MetaValue }); }, beforeWrite(fn: () => void) { intercept = fn; }, fail(value: RepositoryError | null) { fault = value; } };
}
it('finds a completed attempt behind the active incomplete attempt without changing Resume priority', async () => {
  const s = storage(), p = full(); s.put('done', p); s.put('current', { ...full('current'), completed: [1], step: 2 });
  const before = structuredClone(s.meta.get(STATIC_PROGRESS_PREFIX + 'done'));
  const menu = await loadTutorialMenuProgress(s.repository, ['current', 'done'], null, () => null);
  expect(menu.routing?.draftId).toBe('current'); expect(menu.routing?.progress.complete).toBe(false); expect(menu.routingHistory?.source.attemptId).toBe(p.attemptId); expect(s.meta.get(STATIC_PROGRESS_PREFIX + 'done')).toEqual(before);
  expect((await loadTutorialMenuProgress(s.repository, [], null, () => null)).routingHistory).toEqual(menu.routingHistory);
});
it('persists history when the final progress is saved, and keeps it after reset or source removal', async () => {
  const s = storage(), p = readStaticRoutingProgress(full(), 'done');
  const store = new StaticRoutingProgressStore(s.repository, { getState: () => ({ drafts: [{ id: 'done' }] }) as never, flush: async () => ({ ok: true, value: undefined }) });
  await store.save(p); const history = readStaticCompletion(s.meta.get(STATIC_COMPLETION_KEY)!.value);
  await store.save({ ...p, step: 1, completed: [] }); s.meta.delete(STATIC_PROGRESS_PREFIX + 'done');
  expect(await rememberStaticCompletion(s.repository, 'missing')).toEqual(history); store.dispose();
});
it('recovers verifiable legacy completion without rewriting its source or inventing an old completion date', async () => {
  const s = storage(), p = { ...full(), chapterVersion: 1, step: 8, completed: [1, 2, 3, 4, 5, 6, 7, 8] }; s.put('done', p);
  const before = structuredClone(s.meta); const h = await rememberStaticCompletion(s.repository, 'done');
  expect(h?.source.chapterVersion).toBe(1); expect(h?.recordedAt).toBeGreaterThan(0); expect(h).not.toHaveProperty('completedAt'); expect(s.meta.get(STATIC_PROGRESS_PREFIX + 'done')).toEqual(before.get(STATIC_PROGRESS_PREFIX + 'done'));
});
it('never combines partial attempts or promotes the last task without six valid receipts', async () => {
  const s = storage(); for (const [id, omitted] of [['a', 2], ['b', 3]] as const) { const p = full(id); p.completed = p.completed.filter(n => n !== omitted); s.put(id, p); expect(await rememberStaticCompletion(s.repository, id)).toBeNull(); }
  const p = { ...full('last'), completed: [1], finalReplies: { ...full().finalReplies, cb: null } }; s.put('last', p);
  expect(await rememberStaticCompletion(s.repository, 'last')).toBeNull(); expect(s.meta.has(STATIC_COMPLETION_KEY)).toBe(false);
});
it('guards the exact source revision and recovers a failed history write', async () => {
  const s = storage(); s.put('done', full()); s.beforeWrite(() => { const r = s.meta.get(STATIC_PROGRESS_PREFIX + 'done')!; s.meta.set(r.key, { ...r, revision: 2 }); });
  await expect(rememberStaticCompletion(s.repository, 'done')).rejects.toThrow('meta-conflict'); expect(s.meta.has(STATIC_COMPLETION_KEY)).toBe(false);
  s.fail({ code: 'quota-exceeded', message: 'Quota' }); await expect(rememberStaticCompletion(s.repository, 'done')).rejects.toThrow('quota-exceeded');
  s.fail(null); const [a, b] = await Promise.all([rememberStaticCompletion(s.repository, 'done'), rememberStaticCompletion(s.repository, 'done')]); expect(a).toEqual(b); expect(s.meta.get(STATIC_COMPLETION_KEY)!.revision).toBe(1);
});
it('isolates Chapter 4 history errors from the other menu groups and preserves invalid data', async () => {
  const s = storage(); s.put('done', full()); s.meta.set(STATIC_COMPLETION_KEY, { key: STATIC_COMPLETION_KEY, revision: 1, value: { schemaVersion: 99 } }); const before = structuredClone(s.meta);
  const result = await loadTutorialMenuProgress(s.repository, ['done'], null, () => null);
  expect(result.routingError).toBe(true); expect(result.alternativeError).toBeUndefined(); expect(s.meta).toEqual(before);
});
it('can display completed evidence with a read-only repository without persisting anything', async () => {
  const s = storage(); s.put('done', full()); s.put('current', { ...full('current'), completed: [1] }); const before = structuredClone(s.meta);
  const result = await loadTutorialMenuProgress({ getMeta: s.repository.getMeta }, ['current', 'done'], null, () => null); expect(result.routing?.progress.complete).toBe(true); expect(s.meta).toEqual(before);
});
