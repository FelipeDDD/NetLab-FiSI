import { expect, it, vi } from 'vitest';
import { loadTutorialMenuProgress } from './menuProgress';
import { ROUTER_PROGRESS_PREFIX } from './routerProgress';
import { newSubnetProgress, SUBNET_PROGRESS_PREFIX } from './subnetProgress';
import { routerDirectDocument, DIRECT_C } from './routerChapter';
import type { MetaValue } from '../projects/types';
import { FIRST_DEVICES, FIRST_CONNECTION } from './firstConnection';
import { TUTORIAL_PROGRESS_PREFIX } from './tutorialProgress';

const completed = { schemaVersion: 2, chapterId: 'two-networks', chapterVersion: 2, draftId: 'done', pcC: 'c', source: 'direct', prepared: true, step: 8, completed: [1, 2, 3, 4, 5, 6, 7, 8], replies: { a: null, f: null }, diagnosis: { failure: false, reply: 'sha256-v1:' + 'a'.repeat(64) } };
it('recognizes an existing completed draft without rewriting progress or copying its status to a neighbor', async () => {
  const getMeta = vi.fn(async (key: string) => ({ ok: true as const, value: key === ROUTER_PROGRESS_PREFIX + 'done' ? { key, revision: 1, value: structuredClone(completed) } : null }));
  const before = structuredClone(completed);
  const result = await loadTutorialMenuProgress({ getMeta }, ['personal', 'done'], null, () => null);
  expect(result).toEqual({ first: null, subnet: null, router: { draftId: 'done', step: 8, progress: { completed: 8, total: 8, complete: true } }, routing: null, alternative: null });
  expect(completed).toEqual(before);
  expect(await loadTutorialMenuProgress({ getMeta }, ['personal'], null, () => null)).toEqual({ first: null, subnet: null, router: null, routing: null, alternative: null });
});
it('does not label a final step with no Echo Reply as completed, or hide a storage error', async () => {
  const partial = { ...completed, diagnosis: { failure: false, reply: null } };
  const getMeta = async (key: string) => ({ ok: true as const, value: key === ROUTER_PROGRESS_PREFIX + 'done' ? { key, revision: 1, value: partial } : null });
  expect((await loadTutorialMenuProgress({ getMeta }, ['done'], null, () => null)).router?.progress.complete).toBe(false);
  await expect(loadTutorialMenuProgress({ getMeta: async () => ({ ok: false, error: { code: 'unavailable', message: 'Unavailable' } }) }, ['done'], null, () => null)).rejects.toThrow('unavailable');
});

it('checks Chapter 2 correction in an isolated document without using its navigation step or modifying the document', async () => {
  const document = routerDirectDocument();
  document.topology.devices.find(d => d.id === 'tutorial-02-d')!.ifaces[0].ip = '192.168.10.12/28';
  const r = await newSubnetProgress('subnet', DIRECT_C, 'network'); r.step = 5; r.answer = '255.255.255.240';
  r.inspected = r.answerAccepted = r.demoClaimed = r.demoPassed = r.unreachable = true;
  const getMeta = async (key: string) => ({ ok: true as const, value: key === SUBNET_PROGRESS_PREFIX + 'subnet' ? { key, revision: 1, value: r as unknown as MetaValue } : null });
  const before = structuredClone(document);
  expect((await loadTutorialMenuProgress({ getMeta }, ['subnet'], 'subnet', () => document)).subnet?.progress).toEqual({ completed: 3, total: 5, complete: false });
  expect(document).toEqual(before);
  document.topology.devices.find(d => d.id === 'tutorial-02-d')!.ifaces[0].ip = '192.168.10.12/27';
  const corrected = structuredClone(document);
  expect((await loadTutorialMenuProgress({ getMeta }, ['subnet'], 'subnet', () => document)).subnet?.progress).toEqual({ completed: 4, total: 5, complete: false });
  expect(document).toEqual(corrected);
});

it('recovers Chapters 1 and 2 independently while Chapter 3 owns the active draft after F5', async () => {
  const hash = 'sha256-v1:' + 'a'.repeat(64), document = routerDirectDocument();
  const first = { schemaVersion: 1, tutorialId: FIRST_CONNECTION.id, tutorialVersion: FIRST_CONNECTION.version, draftId: 'done', startedAt: 1, step: 8, completed: [1,2,3,4,5,6,7,8], devices: { ...FIRST_DEVICES, c: DIRECT_C }, baseline: null, ipv4Applied: true, a: { fingerprint: hash, interrupted: true }, c: { fingerprint: hash, ended: true } };
  const subnet = await newSubnetProgress('done', DIRECT_C, 'network');subnet.step = 5;subnet.answer = '255.255.255.240';subnet.inspected = subnet.answerAccepted = subnet.demoClaimed = subnet.demoPassed = subnet.unreachable = true;subnet.replies = { b: hash, c: hash };
  const values: Record<string, MetaValue> = { [TUTORIAL_PROGRESS_PREFIX+'done']: first, [SUBNET_PROGRESS_PREFIX+'done']: subnet as unknown as MetaValue, [ROUTER_PROGRESS_PREFIX+'done']: completed };
  const result = await loadTutorialMenuProgress({ getMeta: async key => ({ ok: true, value: values[key] ? { key, revision: 1, value: values[key] } : null }) }, ['done'], null, () => document);
  expect(result.first?.progress).toEqual({ completed: 8, total: 8, complete: true });
  expect(result.subnet?.progress).toEqual({ completed: 5, total: 5, complete: true });
  expect(result.router?.progress.complete).toBe(true);
});
