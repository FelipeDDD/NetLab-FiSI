import type { ProjectDocument, MetaValue } from '../projects/types';
import { createProjectId } from '../projects/projectDocument';
import type { OpenDocumentOptions } from '../persistence/sessionController';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { serializeNetwork } from '../engine/serialize';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, TRANSIT_PLAN, alternativePathsDocument, pcIdentity, alternativeConditions, failureBaselineSignature } from './alternativePathsChapter';
import { ALTERNATIVE_ENTRIES, readAlternativeEntry, type AlternativeEntryPoint } from './alternativeEntryContract';
import { ALTERNATIVE_PROGRESS_PREFIX, newAlternativeProgress, readAlternativeProgress } from './alternativePathsProgress';
import { checkpointKey, readChapterCheckpoint, type ChapterCheckpoint } from './chapterCheckpoints';
import type { AlternativePathsProgress } from './alternativePathsProgress';
import { tutorialFingerprint } from './tutorialProgress';

/** Four real static routes, shared by the prepared /24 LANs. No packet receipts. */
const VIA_ROUTES = [
  [I.r1, '192.168.20.0/24', '10.0.12.2', 'eth0'], [I.r2, '192.168.20.0/24', '10.0.23.2', 'eth1'],
  [I.r3, '192.168.10.0/24', '10.0.23.1', 'eth0'], [I.r2, '192.168.10.0/24', '10.0.12.1', 'eth0'],
] as const;

export function alternativeEntryDocument(point: AlternativeEntryPoint): ProjectDocument {
  const entry = readAlternativeEntry(ALTERNATIVE_ENTRIES[point]), document = alternativePathsDocument(), t = document.topology;
  for (const row of TRANSIT_PLAN) {
    const iface = t.devices.find(d => d.id === row.device)!.ifaces.find(i => i.name === row.iface)!;
    iface.ip = row.address; iface.ipv4Mode = 'static';
  }
  for (const [id, router, link, name, address, gateway, x] of [
    [I.a, I.r1, L.a, 'PC A', '192.168.10.10/24', '192.168.10.1', 220],
    [I.b, I.r3, L.b, 'PC B', '192.168.20.20/24', '192.168.20.1', 1600],
  ] as const) {
    const iface = t.devices.find(d => d.id === router)!.ifaces.find(i => i.name === 'eth2')!;
    iface.ip = gateway + '/24'; iface.ipv4Mode = 'static';
    t.devices.push({id,name,kind:'host',os:'linux',forwarding:false,x,y:790,routes:[],ifaces:[{name:'eth0',up:true,ip:address,ipv4Mode:'static',gateway}]});
    t.links.push({id:link,a:[id,'eth0'],b:[router,'eth2'],latency:40});
  }
  if (entry.point !== 'part-2') for (const [id,dest,via,dev] of VIA_ROUTES) t.devices.find(d => d.id === id)!.routes.push({dest,via,dev});
  // Materialize MACs once, before controls are committed. F5 keeps these identities.
  const prepared = prepareTopologyDocument(t);
  try { return {schemaVersion:1,topology:serializeNetwork(prepared.network,Object.fromEntries(t.devices.map(d=>[d.id,{x:d.x,y:d.y}])))}; }
  finally { disposeNetwork(prepared.network); }
}

export interface AlternativeEntryAttempt { document: ProjectDocument; progress: AlternativePathsProgress; checkpoint: ChapterCheckpoint; options: OpenDocumentOptions }
/** Same unconfigured triangle; materialize identities and controls before opening.
 * This allows the current-attempt marker to commit with every new attempt. */
export function createAlternativeBeginningAttempt():AlternativeEntryAttempt {
  const original=alternativePathsDocument(),prepared=prepareTopologyDocument(original.topology);
  let document:ProjectDocument;
  try{document={schemaVersion:1,topology:serializeNetwork(prepared.network,Object.fromEntries(original.topology.devices.map(d=>[d.id,{x:d.x,y:d.y}])))};}
  finally{disposeNetwork(prepared.network);}
  return finishEntryAttempt(document,{...newAlternativeProgress(createProjectId()),prepared:true});
}
function finishEntryAttempt(document:ProjectDocument,initial:AlternativePathsProgress):AlternativeEntryAttempt {
  const id=initial.draftId,progress=readAlternativeProgress(initial,id);
  const checkpoint:ChapterCheckpoint={schemaVersion:1,kind:'chapter-checkpoint',chapter:'alternative-paths',draftId:id,attemptId:progress.attemptId,before:document,initial:document,progress:progress as unknown as MetaValue};
  readChapterCheckpoint(checkpoint,id,'alternative-paths');
  const options:OpenDocumentOptions={initialization:{id,control:[
    {key:ALTERNATIVE_PROGRESS_PREFIX+id,expectedRevision:null,value:progress as unknown as MetaValue},
    {key:checkpointKey(id,'alternative-paths'),expectedRevision:null,value:checkpoint as unknown as MetaValue},
  ]}};
  return {document,progress,checkpoint,options};
}
/** Prepared entries persist configuration, never packet evidence. */
export async function createAlternativeEntryAttempt(point: AlternativeEntryPoint):Promise<AlternativeEntryAttempt> {
  const entry=readAlternativeEntry(ALTERNATIVE_ENTRIES[point]),document=alternativeEntryDocument(point),id=createProjectId(),prepared=prepareTopologyDocument(document.topology);
  let extension,signature='';
  try{extension=pcIdentity(prepared.network);if(point==='part-3')signature=failureBaselineSignature(prepared.network);}finally{disposeNetwork(prepared.network);}
  if(!extension)throw Error('Invalid entry identities.');
  return finishEntryAttempt(document,{...newAlternativeProgress(id),schemaVersion:2,prepared:true,stage:'lans',step:entry.firstTask,entry,extension,...(point==='part-3'?{scenarioBaseline:await tutorialFingerprint(signature)}:{})});
}
/** Restart uses the restored actual network, including preserved independent entities. */
export async function prepareAlternativeEntryRestart(document:ProjectDocument,value:MetaValue){
  const progress=readAlternativeProgress(value,(value as unknown as AlternativePathsProgress).draftId);
  if(progress.entry?.point!=='part-3')return {document,progress:value};
  const prepared=prepareTopologyDocument(document.topology);let signature;
  try{if(!alternativeConditions(prepared.network).via)throw Error('checkpoint-conflict');signature=failureBaselineSignature(prepared.network);}finally{disposeNetwork(prepared.network);}
  progress.scenarioBaseline=await tutorialFingerprint(signature);
  return {document,progress:progress as unknown as MetaValue};
}
