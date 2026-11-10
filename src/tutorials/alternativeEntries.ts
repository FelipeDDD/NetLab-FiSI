import type { ProjectDocument, MetaValue } from '../projects/types';
import { createProjectId } from '../projects/projectDocument';
import type { OpenDocumentOptions } from '../persistence/sessionController';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { serializeNetwork } from '../engine/serialize';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, TRANSIT_PLAN, alternativePathsDocument, pcIdentity, alternativeConditions, failureBaselineSignature } from './alternativePathsChapter';
import { ALTERNATIVE_ENTRIES, ALTERNATIVE_ENTRY_C, suppliedAlternativeLpm, readAlternativeEntry, type AlternativeEntryPoint } from './alternativeEntryContract';
import { ALTERNATIVE_PROGRESS_PREFIX, newAlternativeProgress, readAlternativeProgress } from './alternativePathsProgress';
import { checkpointKey, readChapterCheckpoint, type ChapterCheckpoint } from './chapterCheckpoints';
import { emptyLpm, LPM_GATEWAY, LPM_ADDRESS, lpmRoutesReady } from './alternativeLpm';
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
  if(entry.point==='part-4'){
    const r3=t.devices.find(d=>d.id===I.r3)!;r3.ifaces[3].ip=LPM_GATEWAY+'/25';r3.ifaces[3].ipv4Mode='static';
    t.devices.push({id:ALTERNATIVE_ENTRY_C,name:'PC C',kind:'host',os:'linux',forwarding:false,x:1780,y:900,routes:[],ifaces:[{name:'eth0',up:true,ip:LPM_ADDRESS+'/25',ipv4Mode:'static',gateway:LPM_GATEWAY}]});
    t.links.push({id:'tutorial-05-c-link',a:[ALTERNATIVE_ENTRY_C,'eth0'],b:[I.r3,'eth3'],latency:40});
    t.devices.find(d=>d.id===I.r2)!.routes.push({dest:'192.168.30.128/25',via:'10.0.23.2',dev:'eth1'});
    t.devices.find(d=>d.id===I.r1)!.routes.push({dest:'192.168.30.0/24',via:'10.0.12.2',dev:'eth0'},{dest:'192.168.30.128/25',via:'10.0.13.2',dev:'eth1'});
  }
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
/** Parts 2/3 retain their synchronous contract. Part 4 hashes its technical baseline. */
export function createAlternativeEntryAttempt(point:'part-2'|'part-3'):AlternativeEntryAttempt;
export function createAlternativeEntryAttempt(point:'part-4'):Promise<AlternativeEntryAttempt>;
export function createAlternativeEntryAttempt(point:AlternativeEntryPoint):AlternativeEntryAttempt|Promise<AlternativeEntryAttempt>;
export function createAlternativeEntryAttempt(point: AlternativeEntryPoint):AlternativeEntryAttempt|Promise<AlternativeEntryAttempt> {
  const entry=readAlternativeEntry(ALTERNATIVE_ENTRIES[point]), document=alternativeEntryDocument(point), id=createProjectId();
  const prepared=prepareTopologyDocument(document.topology);
  let extension,signature='';
  try { extension=pcIdentity(prepared.network);if(point==='part-4')signature=failureBaselineSignature(prepared.network); } finally { disposeNetwork(prepared.network); }
  if(!extension)throw Error('Invalid entry identities.');
  const initial:AlternativePathsProgress={...newAlternativeProgress(id),schemaVersion:2,prepared:true,stage:'lans',step:entry.firstTask,entry,extension};
  if(point==='part-4')return tutorialFingerprint(signature).then(scenarioBaseline=>finishEntryAttempt(document,{...initial,lpm:suppliedAlternativeLpm(document),scenarioBaseline}));
  return finishEntryAttempt(document,initial);
}

/** A reset to task 14 includes its normal automatic port preparation in the
 * same document/progress commit. Otherwise that follow-up write invalidates
 * the restart's Undo ticket. No PC, command, answer or receipt is supplied. */
export async function prepareAlternativeEntryRestart(document: ProjectDocument, value: MetaValue) {
  const initial=value as unknown as AlternativePathsProgress;
  if(initial.entry?.point==='part-4'){
    const progress=readAlternativeProgress(initial,initial.draftId),prepared=prepareTopologyDocument(document.topology);
    let signature;
    try{
      if(!alternativeConditions(prepared.network).via||!lpmRoutesReady(prepared.network,progress.lpm))throw Error('checkpoint-conflict');
      signature=failureBaselineSignature(prepared.network);
    }finally{disposeNetwork(prepared.network);}
    progress.scenarioBaseline=await tutorialFingerprint(signature);
    return {document,progress:progress as unknown as MetaValue};
  }
  if(initial.entry?.point!=='part-3')return {document,progress:value};
  const progress=readAlternativeProgress(initial,initial.draftId),after=structuredClone(document);
  const router=after.topology.devices.find(d=>d.id===I.r3),port=router?.ifaces.find(i=>i.name==='eth3');
  if(progress.step!==14||progress.completed.length||progress.lpm.stage!=='unprepared'||!port?.up||port.ip||port.gateway||after.topology.links.some(l=>l.a[0]===I.r3&&l.a[1]==='eth3'||l.b[0]===I.r3&&l.b[1]==='eth3'))throw Error('checkpoint-conflict');
  port.ip=LPM_GATEWAY+'/25';port.ipv4Mode='static';port.gateway=null;port.dns=null;
  progress.lpm={...emptyLpm(),stage:'ready',baseline:after.topology.devices.map(d=>d.id)};
  return {document:after,progress:readAlternativeProgress(progress,progress.draftId) as unknown as MetaValue};
}
