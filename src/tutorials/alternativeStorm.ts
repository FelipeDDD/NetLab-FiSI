import type { ProjectDocument } from '../projects/types';
import type { AlternativePathsProgress } from './alternativePathsProgress';

/** Historical navigation must not revalidate the pre-storm LPM against the outage. */
export const completedLpmBeforeStorm = (p: AlternativePathsProgress) => (p.storm === 'applied' || p.storm === 'adopted' || p.storm === 'legacy' && !!p.failure) && p.step >= 14 && p.step <= 19 &&
  (p.completed.includes(p.step) || p.lpm.legacy || p.step >= 16 && p.lpm.experiment.legacy);

/** A selective patch: preserve devices, cable, addresses, routes and document UI. */
export function stormDocument(before: ProjectDocument) {
  const after = structuredClone(before);
  const port = after.topology.devices.find(d => d.id === 'tutorial-05-r2')?.ifaces.find(i => i.name === 'eth1');
  if (!port) throw Error('Missing storm interface.');
  port.up = false;
  return after;
}
