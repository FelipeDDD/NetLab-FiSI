import type { ProjectRepository } from '../projects/repository';
import type { ProjectDocument } from '../projects/types';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { correctedSubnet } from './subnetChapter';
import { readTutorialProgress, TUTORIAL_PROGRESS_PREFIX } from './tutorialProgress';
import { readSubnetProgress, SUBNET_PROGRESS_PREFIX } from './subnetProgress';
import { readRouterProgress, ROUTER_PROGRESS_PREFIX } from './routerProgress';
import { firstChapterCompletion, subnetChapterCompletion, routerChapterCompletion, type ChapterCompletion } from './completion';
import { staticRoutingCompletion } from './completion';
import { STATIC_PROGRESS_PREFIX, readStaticRoutingProgress } from './staticRoutingProgress';
import { ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress } from './alternativePathsProgress';
import { alternativePathsCompletion } from './completion';

export interface TutorialMenuProgress {
  first: { draftId: string; progress: ChapterCompletion } | null;
  subnet: { draftId: string; step: number; progress: ChapterCompletion } | null;
  router: { draftId: string; step: number; progress: ChapterCompletion } | null;
  routing: { draftId: string; progress: ChapterCompletion } | null;
  alternative: { draftId: string; progress: ChapterCompletion } | null;
}
/** Read existing evidence only. Any temporary network is disposed without running it. */
export async function loadTutorialMenuProgress(repository: Pick<ProjectRepository, 'getMeta'>, draftIds: readonly string[], firstDraft: string | null, document: (id: string) => ProjectDocument | null): Promise<TutorialMenuProgress> {
  const result: TutorialMenuProgress = { first: null, subnet: null, router: null, routing: null, alternative: null };
  const read = async (key: string) => {
    const found = await repository.getMeta(key);
    if (!found.ok) throw Error(found.error.code);
    return found.value?.value ?? null;
  };
  // Earlier controllers can be suspended while Chapter 3 owns the simulation.
  // Discover their persisted attempt instead of interpreting an inactive UI as
  // "not started". Prefer this plan, then the previously selected attempt.
  const candidates = [...new Set([draftIds[0], firstDraft, ...draftIds].filter((id): id is string => !!id && draftIds.includes(id)))];
  for (const id of candidates) {
    const first = await read(TUTORIAL_PROGRESS_PREFIX + id);
    if (!first) continue;
    result.first = { draftId: id, progress: firstChapterCompletion(readTutorialProgress(first, id)) };
    break;
  }
  const basicsId = result.first?.draftId ?? (firstDraft && draftIds.includes(firstDraft) ? firstDraft : null);
  if (basicsId) {
    const subnet = await read(SUBNET_PROGRESS_PREFIX + basicsId);
    if (subnet) {
      const record = readSubnetProgress(subnet, basicsId), saved = document(basicsId);
      let corrected = false;
      if (saved) {
        const prepared = prepareTopologyDocument(saved.topology);
        try { corrected = correctedSubnet(prepared.network, record.pcC); }
        finally { disposeNetwork(prepared.network); }
      }
      result.subnet = { draftId: basicsId, step: record.step, progress: subnetChapterCompletion(record, corrected) };
    }
  }
  for (const draftId of draftIds) {
    const raw = await read(ROUTER_PROGRESS_PREFIX + draftId);
    if (!raw) continue;
    const record = readRouterProgress(raw, draftId);
    result.router = { draftId, step: record.step, progress: routerChapterCompletion(record) };
    break;
  }
  for (const draftId of draftIds) {
    const raw = await read(STATIC_PROGRESS_PREFIX + draftId); if (!raw) continue;
    result.routing = { draftId, progress: staticRoutingCompletion(readStaticRoutingProgress(raw, draftId)) }; break;
  }
  for (const draftId of draftIds) {
    const raw = await read(ALTERNATIVE_PROGRESS_PREFIX + draftId); if (!raw) continue;
    result.alternative = { draftId, progress: alternativePathsCompletion(readAlternativeProgress(raw, draftId)) }; break;
  }
  return result;
}
