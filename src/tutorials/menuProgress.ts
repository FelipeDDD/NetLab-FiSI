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
import { alternativePathsCompletion, alternativePracticeCompletion } from './completion';
import { ALTERNATIVE_COMPLETION_KEY, ALTERNATIVE_CURRENT_KEY, readAlternativeCompletion, readAlternativeCurrent, rememberAlternativeCompletion, type AlternativeChapterCompletion } from './alternativeLearning';
import type { AlternativeEntryPoint } from './alternativeEntryContract';

export interface TutorialMenuProgress {
  first: { draftId: string; progress: ChapterCompletion } | null;
  subnet: { draftId: string; step: number; progress: ChapterCompletion } | null;
  router: { draftId: string; step: number; progress: ChapterCompletion } | null;
  routing: { draftId: string; progress: ChapterCompletion } | null;
  alternative: { draftId: string; progress: ChapterCompletion; practice: ChapterCompletion; entry?:AlternativeEntryPoint } | null;
  alternativeHistory?:AlternativeChapterCompletion;
  alternativeError?:boolean;
}
/** Read existing evidence; with a writer, retain verifiable old integral
 * completions independently. Any temporary network is disposed without running. */
export async function loadTutorialMenuProgress(repository: Pick<ProjectRepository, 'getMeta'> & Partial<Pick<ProjectRepository,'setMeta'>>, draftIds: readonly string[], firstDraft: string | null, document: (id: string) => ProjectDocument | null): Promise<TutorialMenuProgress> {
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
  try {
  const historical=await read(ALTERNATIVE_COMPLETION_KEY),current=await read(ALTERNATIVE_CURRENT_KEY);
  if(historical)result.alternativeHistory=readAlternativeCompletion(historical);
  const selected=current?readAlternativeCurrent(current):null;
  // A closed current draft may still carry the verified progress needed to
  // recover a failed historical write. It must not be reopened by this scan.
  if(!result.alternativeHistory&&selected&&!draftIds.includes(selected.draftId)&&repository.setMeta){
    const saved=await rememberAlternativeCompletion(repository as Pick<ProjectRepository,'getMeta'|'setMeta'>,selected.draftId);if(saved)result.alternativeHistory=saved;
  }
  // The active chapter draft wins, otherwise resume the explicitly last-selected
  // attempt. Tab order is only a fallback for old attempts without this metadata.
  const alternativeCandidates=[...new Set([draftIds[0],selected?.draftId,...draftIds].filter((id):id is string=>!!id&&draftIds.includes(id)))];
  for (const draftId of alternativeCandidates) {
    const raw=await read(ALTERNATIVE_PROGRESS_PREFIX+draftId);if(!raw)continue;
    const p=readAlternativeProgress(raw,draftId);
    if(!result.alternative&&(!selected||draftId!==selected.draftId||p.attemptId===selected.attemptId))result.alternative={draftId,progress:alternativePathsCompletion(p),practice:alternativePracticeCompletion(p),...(p.entry?{entry:p.entry.point}:{})};
    if(!result.alternativeHistory&&!p.entry&&alternativePathsCompletion(p).complete&&repository.setMeta){
      const saved=await rememberAlternativeCompletion(repository as Pick<ProjectRepository,'getMeta'|'setMeta'>,draftId);if(saved)result.alternativeHistory=saved;
    }
  }
  }catch{result.alternativeError=true;}
  return result;
}
