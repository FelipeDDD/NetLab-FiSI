import type { ProjectDocument } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import type { LabProgress } from '../labs/types';
import { NAT_INVESTIGATION_RESULTS, natConfiguration, natIntroComplete, natInvestigationComplete, natIntroSignature } from '../labs/natLearning';
import { PROGRESSIVE_NAT_PAT_ID } from '../labs/progressiveNatPat';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import type { ChapterCompletion } from './completion';

const finish = 'nat-after-pair';
const total = NAT_INVESTIGATION_RESULTS.length + 2;
export const natPatCompleted: ChapterCompletion = { completed: total, total, complete: true };
const completionKey = 'guided:chapter-completion:v1:' + PROGRESSIVE_NAT_PAT_ID;
type Repository = Pick<ProjectRepository, 'getMeta' | 'setMeta'>;

export function natPatProgress({ results, quiz }: Pick<LabProgress, 'results' | 'quiz'>, configuration: string, introSignature: string): ChapterCompletion {
  const proved = (id: string) => results[id]?.pass && results['nat-proof-' + id]?.pass &&
    results['nat-proof-' + id]?.detail === configuration;
  const intro = natIntroComplete(results);
  const investigation = natInvestigationComplete(results, quiz['nat-rule-screen']);
  const first = results['nat-first-http'];
  const completed = Number(intro || !!first?.pass && first.detail === introSignature) +
    NAT_INVESTIGATION_RESULTS.filter(id => investigation || proved(id)).length + Number(!!proved(finish));
  return { completed, total, complete: intro && investigation && !!proved(finish) };
}

export function savedNatPatProgress(document: ProjectDocument | null): ChapterCompletion | null {
  const topology = document?.topology;
  if (topology?.lab?.id !== PROGRESSIVE_NAT_PAT_ID) return null;
  try {
    if (!topology.labProgress || !Object.values(topology.labProgress.results).some(result => result.pass)) return { completed: 0, total, complete: false };
    const { network } = prepareTopologyDocument(topology);
    try { return natPatProgress(topology.labProgress, natConfiguration(network), natIntroSignature(network)); }
    finally { disposeNetwork(network); }
  } catch {
    return null;
  }
}

export async function readNatPatCompletion(repository: Repository): Promise<boolean> {
  const result = await repository.getMeta(completionKey);
  if (!result.ok) throw Error(result.error.code);
  return result.value?.value === true;
}

// Closed unsaved drafts lose their document. Keep one achievement marker
// after a verified completion, using the same metadata store as Chapters 4/5.
export async function rememberNatPatCompletion(repository: Repository): Promise<boolean> {
  if (await readNatPatCompletion(repository)) return true;
  const result = await repository.setMeta({ key: completionKey, expectedRevision: null, value: true });
  if (result.ok) return true;
  if (result.error.code === 'meta-conflict') return readNatPatCompletion(repository);
  throw Error(result.error.code);
}
