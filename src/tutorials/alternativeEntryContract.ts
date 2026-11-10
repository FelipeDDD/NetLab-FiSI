import type { ProjectDocument } from '../projects/types';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { ALTERNATIVE_IDS as I, alternativeConditions } from './alternativePathsChapter';
import { emptyLpm, lpmRoutesReady, type LpmProgress } from './alternativeLpm';

export const ALTERNATIVE_ENTRY_C = 'tutorial-05-c';

/** Supplied configuration is not learner evidence or historical completion. */
export const ALTERNATIVE_ENTRIES = {
  'part-2': { schemaVersion: 1, chapter: 'alternative-paths', scenarioVersion: 1, point: 'part-2', firstTask: 7,
    configuration: 'transit-and-lans', suppliedTasks: [1, 2, 3, 4, 5, 6], prerequisites: ['transit-addresses', 'local-lans-and-gateways'] },
  'part-3': { schemaVersion: 1, chapter: 'alternative-paths', scenarioVersion: 1, point: 'part-3', firstTask: 14,
    configuration: 'transit-lans-and-static-routes-via-r2', suppliedTasks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], prerequisites: ['transit-addresses', 'local-lans-and-gateways', 'bidirectional-routes-via-r2'] },
  'part-4': { schemaVersion: 1, chapter: 'alternative-paths', scenarioVersion: 1, point: 'part-4', firstTask: 20,
    configuration: 'complete-lans-and-lpm-before-storm', suppliedTasks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], prerequisites: ['transit-addresses', 'local-lans-and-gateways', 'bidirectional-routes-via-r2', 'lan-c-and-matching-24-25-routes', 'operational-r2-r3'] },
} as const;
export type AlternativeEntryPoint = keyof typeof ALTERNATIVE_ENTRIES;
export type AlternativeEntry = typeof ALTERNATIVE_ENTRIES[AlternativeEntryPoint];
export function readAlternativeEntry(value: unknown): AlternativeEntry {
  const point = (value as Partial<AlternativeEntry> | null)?.point;
  if (point !== 'part-2' && point !== 'part-3' && point !== 'part-4') throw Error('Incompatible alternative entry.');
  const expected = ALTERNATIVE_ENTRIES[point];
  if (!value || typeof value !== 'object' || Object.keys(value).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([key, expectedValue]) => JSON.stringify((value as Record<string, unknown>)[key]) !== JSON.stringify(expectedValue))) throw Error('Incompatible alternative entry.');
  return structuredClone(expected);
}

/** Identity supplied by the scenario, with no observation or learner answer. */
export function suppliedAlternativeLpm(document: ProjectDocument): LpmProgress {
  const pc=document.topology.devices.find(d=>d.id===ALTERNATIVE_ENTRY_C),iface=pc?.ifaces[0];
  if(pc?.kind!=='host'||pc.ifaces.length!==1||iface?.name!=='eth0'||!iface.mac)throw Error('Invalid supplied PC C.');
  return {...emptyLpm(),stage:'ready',baseline:Object.values(I),pc:{id:pc.id,mac:iface.mac,nameChecked:true}};
}

/** Checks the supplied initial baseline, never historical packet evidence. */
export function alternativeEntryInitialValid(document: ProjectDocument, entry: AlternativeEntry) {
  const prepared=prepareTopologyDocument(document.topology);
  try {
    const net=prepared.network,c=alternativeConditions(net);
    if(entry.point==='part-4')return net.devices.size===6&&Object.values(I).every(id=>net.devices.has(id))&&c.via&&lpmRoutesReady(net,suppliedAlternativeLpm(document));
    return net.devices.size===5 && Object.values(I).every(id=>net.devices.has(id)) && c.strict && c.lans &&
      !net.devices.get(I.r3)!.getInterface('eth3')!.ip && !net.devices.get(I.r3)!.getInterface('eth3')!.link &&
      (entry.point==='part-2' ? [I.r1,I.r2,I.r3].every(id=>document.topology.devices.find(d=>d.id===id)!.routes.length===0) : c.via);
  } finally { disposeNetwork(prepared.network); }
}
