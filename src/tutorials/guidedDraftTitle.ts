import type { TranslationKey } from '../i18n';
import type { ProjectRepository } from '../projects/repository';
import { TUTORIAL_PROGRESS_PREFIX, readTutorialProgress } from './tutorialProgress';
import { SUBNET_PROGRESS_PREFIX, readSubnetProgress } from './subnetProgress';
import { ROUTER_PROGRESS_PREFIX, readRouterProgress } from './routerProgress';
import { STATIC_PROGRESS_PREFIX, readStaticRoutingProgress } from './staticRoutingProgress';
import { ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress } from './alternativePathsProgress';
import { LPM_PROGRESS_PREFIX, readLpmProgress } from './lpmProgress';

// The later chapter wins when two chapters use the same draft.
const chapters = [
  [LPM_PROGRESS_PREFIX, readLpmProgress, 'guidedLpm.title'],
  [ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress, 'guidedAlternative.title'],
  [STATIC_PROGRESS_PREFIX, readStaticRoutingProgress, 'guidedStatic.title'],
  [ROUTER_PROGRESS_PREFIX, readRouterProgress, 'guidedRouter.title'],
  [SUBNET_PROGRESS_PREFIX, readSubnetProgress, 'guidedSubnet.title'],
  [TUTORIAL_PROGRESS_PREFIX, readTutorialProgress, 'guided.title'],
] as const;

export async function readGuidedDraftTitle(repository: Pick<ProjectRepository, 'getMeta'>, id: string): Promise<TranslationKey | undefined> {
  for (const [prefix, read, title] of chapters) {
    const result = await repository.getMeta(prefix + id);
    if (!result.ok) return;
    if (!result.value) continue;
    try { read(result.value.value, id); return title; }
    catch { return; }
  }
}
