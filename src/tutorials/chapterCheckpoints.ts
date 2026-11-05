import type { MetaValue, ProjectDocument } from '../projects/types';
import { isProjectId,normalizeProjectDocument } from '../projects/projectDocument';
import { parseCidr, networkOf, parseIp, sameSubnet } from '../engine/ip';
import type { SavedDevice, SavedRoute } from '../engine/serialize';
import { FIRST_DEVICES } from './firstConnection';
import { SUBNET_PC_ID } from './subnetChapter';
import { ROUTER_IDS } from './routerChapter';
import { readTutorialProgress, TUTORIAL_PROGRESS_PREFIX } from './tutorialProgress';
import { readSubnetProgress, SUBNET_PROGRESS_PREFIX } from './subnetProgress';
import { readRouterProgress, ROUTER_PROGRESS_PREFIX } from './routerProgress';
import { readStaticRoutingProgress, STATIC_PROGRESS_PREFIX, type StaticRoutingProgress } from './staticRoutingProgress';
import { STATIC_BASE_IDS, STATIC_EXTENSION_IDS, STATIC_IDS } from './staticRoutingChapter';
import { readAlternativeProgress, ALTERNATIVE_PROGRESS_PREFIX, type AlternativePathsProgress } from './alternativePathsProgress';
import { ALTERNATIVE_ROUTERS, ALTERNATIVE_PCS, ALTERNATIVE_IDS } from './alternativePathsChapter';

export type ChapterId='first-connection'|'subnet-mask'|'two-networks'|'static-routing'|'alternative-paths';
export const CHAPTERS:ChapterId[]=['first-connection','subnet-mask','two-networks','static-routing','alternative-paths'];
export const checkpointKey=(id:string,chapter:ChapterId)=>`guided:checkpoint:v1:${id}:${chapter}`;
export const progressKey=(id:string,chapter:ChapterId)=>({ 'first-connection':TUTORIAL_PROGRESS_PREFIX,'subnet-mask':SUBNET_PROGRESS_PREFIX,'two-networks':ROUTER_PROGRESS_PREFIX,'static-routing':STATIC_PROGRESS_PREFIX,'alternative-paths':ALTERNATIVE_PROGRESS_PREFIX }[chapter])+id;
export interface ChapterCheckpoint {
  schemaVersion:1;kind:'chapter-checkpoint';draftId:string;chapter:ChapterId;attemptId:string;
  before:ProjectDocument;initial:ProjectDocument|null;progress:MetaValue|null;
}
export interface ChapterCheckpointHooks {before(id:string):Promise<void>;prepared(id:string,progress:MetaValue):Promise<void>}
export const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function validateProgress(chapter:ChapterId,value:unknown,id:string):MetaValue {
  return (chapter==='first-connection'?readTutorialProgress(value,id):chapter==='subnet-mask'?readSubnetProgress(value,id):chapter==='two-networks'?readRouterProgress(value,id):chapter==='static-routing'?readStaticRoutingProgress(value,id):readAlternativeProgress(value,id)) as unknown as MetaValue;
}
export function readChapterCheckpoint(value:unknown,id:string,chapter:ChapterId):ChapterCheckpoint {
  const c=value as ChapterCheckpoint;
  if(!c||c.schemaVersion!==1||c.kind!=='chapter-checkpoint'||c.draftId!==id||c.chapter!==chapter||!isProjectId(c.attemptId))throw Error('checkpoint-invalid');
  let before:ProjectDocument,initial:ProjectDocument|null;
  try{before=normalizeProjectDocument(c.before);initial=c.initial===null?null:normalizeProjectDocument(c.initial);}catch{throw Error('checkpoint-invalid');}
  if((initial===null)!==(c.progress===null))throw Error('checkpoint-invalid');
  let progress:MetaValue|null;try{progress=c.progress===null?null:validateProgress(chapter,c.progress,id);}catch{throw Error('checkpoint-invalid');}
  if(initial){
    const p=progress as unknown as Record<string,unknown>,added=chapter==='first-connection'||chapter==='static-routing'||chapter==='alternative-paths'?[]:chapter==='subnet-mask'?[SUBNET_PC_ID]:Object.values(ROUTER_IDS);
    if(p.step!==1||initial.topology.devices.length!==before.topology.devices.length+added.length||added.some(key=>before.topology.devices.some(d=>d.id===key)||!initial!.topology.devices.some(d=>d.id===key)))throw Error('checkpoint-invalid');
    if(before.topology.devices.some(d=>!initial!.topology.devices.some(n=>same(d,n))))throw Error('checkpoint-invalid');
    if(chapter==='first-connection'&&(!same(before,initial)||p.a!==null||p.c!==null||p.ipv4Applied!==false||(p.devices as {c:unknown}).c!==null))throw Error('checkpoint-invalid');
    if(chapter==='first-connection'&&!same(p.completed,[])||chapter==='two-networks'&&!same(p.completed,[1]))throw Error('checkpoint-invalid');
    if(chapter==='subnet-mask'&&['inspected','answerAccepted','demoClaimed','demoPassed','unreachable'].some(key=>p[key]!==false))throw Error('checkpoint-invalid');
    if(chapter==='two-networks'&&(!same(p.replies,{a:null,f:null})||!same(p.diagnosis,{failure:false,reply:null})))throw Error('checkpoint-invalid');
    if(chapter==='static-routing'&&(!same(before,initial)||!p.prepared||p.stage!=='line'||!same(p.completed,[])||p.investigated!==null||p.missingAnswer!==null||p.extension!==null||Object.values(p.lineReplies as object).some(Boolean)||Object.values(p.finalReplies as object).some(Boolean)||!STATIC_BASE_IDS.every(id=>initial!.topology.devices.some(d=>d.id===id))))throw Error('checkpoint-invalid');
    if(chapter==='alternative-paths'&&(!same(before,initial)||!p.prepared||p.stage!=='triangle'||!same(p.completed,[])||p.remoteUnderstood!==false||p.hopUnderstood!==false||p.lpmUnderstood!==false||p.extension!==null||p.failure!==null||p.viaBaseline!==null||Object.values(p.neighbors as object).some(Boolean)||Object.values(p.viaReplies as object).some(Boolean)||Object.values(p.directReplies as object).some(Boolean)||!ALTERNATIVE_ROUTERS.every(id=>initial!.topology.devices.some(d=>d.id===id))))throw Error('checkpoint-invalid');
  }
  return {...c,before,initial,progress};
}
const identity=(a:SavedDevice,b:SavedDevice)=>a.kind===b.kind&&a.ifaces.every(i=>b.ifaces.some(j=>j.name===i.name&&j.mac===i.mac));
const routeDestination=(r:SavedRoute)=>{const cidr=parseCidr(r.dest);return cidr?{prefix:cidr.prefix,addr:networkOf(cidr.addr,cidr.prefix)}:null;};
/** Closed ownership rules: preserve unrelated records/fields; ambiguous changes block
 * the whole plan before any write. This never operates on a live simulation. */
export function chapterRestartDocument(c:ChapterCheckpoint,current:ProjectDocument,rawProgress:MetaValue):ProjectDocument {
  if(!c.initial||!c.progress)throw Error('checkpoint-missing');
  const progress=validateProgress(c.chapter,rawProgress,c.draftId) as unknown as Record<string,unknown>;
  const original=c.progress as unknown as Record<string,unknown>;
  if(c.chapter==='first-connection'?progress.startedAt!==original.startedAt:c.chapter==='static-routing'||c.chapter==='alternative-paths'?progress.attemptId!==original.attemptId:progress.pcC!==original.pcC||progress.baseFingerprint!==original.baseFingerprint||progress.source!==original.source)throw Error('checkpoint-conflict');
  const baseline=c.before.topology,initial=c.initial.topology,result=structuredClone(current),now=result.topology;
  const owned=new Set(c.chapter==='first-connection'?[...Object.values(FIRST_DEVICES),...(typeof (progress.devices as {c?:unknown})?.c==='string'?[(progress.devices as {c:string}).c]:[])]:c.chapter==='subnet-mask'?[SUBNET_PC_ID]:c.chapter==='static-routing'?[...STATIC_BASE_IDS,...STATIC_EXTENSION_IDS]:c.chapter==='alternative-paths'?[...ALTERNATIVE_ROUTERS,...ALTERNATIVE_PCS]:Object.values(ROUTER_IDS));
  const beforeIds=new Set(baseline.devices.map(d=>d.id));
  const currentIds=new Set(now.devices.map(d=>d.id));
  if(c.chapter==='static-routing'){
    const extension=(progress as unknown as StaticRoutingProgress).extension;
    for(const id of STATIC_EXTENSION_IDS){const live=now.devices.find(d=>d.id===id);if(!live)continue;
      if(!extension||id===STATIC_IDS.c&&(live.kind!=='host'||live.ifaces.length!==1||live.ifaces[0].name!=='eth0'||live.ifaces[0].mac!==extension.pcMac)||id===STATIC_IDS.sc&&(live.kind!=='switch'||live.ifaces.length!==8||live.ifaces.some((iface,i)=>iface.name!==`eth${i}`||iface.mac!==extension.switchMacs[i])))throw Error('checkpoint-conflict');
    }
  }
  if(c.chapter==='alternative-paths'){
    const extension=(progress as unknown as AlternativePathsProgress).extension;
    for(const [key,id] of [['a',ALTERNATIVE_IDS.a],['b',ALTERNATIVE_IDS.b]] as const){const live=now.devices.find(d=>d.id===id);if(!live)continue;
      if(!extension||live.kind!=='host'||live.ifaces.length!==1||live.ifaces[0].name!=='eth0'||live.ifaces[0].mac!==extension[key])throw Error('checkpoint-conflict');
    }
  }
  // Deleted/reused previous devices and altered previous wiring are not ours to repair.
  for(const d of baseline.devices){const live=now.devices.find(n=>n.id===d.id);if(!live){if(owned.has(d.id))continue;throw Error('checkpoint-conflict');}if(!identity(d,live))throw Error('checkpoint-conflict');}
  for(const link of baseline.links)if(!owned.has(link.a[0])&&!owned.has(link.b[0])&&!now.links.some(l=>same(l,link)))throw Error('checkpoint-conflict');
  for(const d of initial.devices.filter(d=>owned.has(d.id))){const live=now.devices.find(n=>n.id===d.id);if(live&&!identity(d,live))throw Error('checkpoint-conflict');}
  for(const link of now.links){
    const a=owned.has(link.a[0]),b=owned.has(link.b[0]);
    if(a!==b&&!beforeIds.has(a?link.b[0]:link.a[0]))throw Error('checkpoint-conflict');
  }
  if(c.chapter==='two-networks'){
    const router=now.devices.find(d=>d.id===ROUTER_IDS.router)!;
    const gateways=router.ifaces.map(i=>i.ip?parseCidr(i.ip)?.addr:undefined).filter((ip):ip is number=>ip!==undefined&&sameSubnet(ip,parseIp('192.168.10.0')!,24));
    for(const id of [FIRST_DEVICES.a,FIRST_DEVICES.b]){
      const base=baseline.devices.find(d=>d.id===id)!,device=now.devices.find(d=>d.id===id)!;
      const bi=base.ifaces.find(i=>i.name==='eth0')!,iface=device.ifaces.find(i=>i.name==='eth0')!;
      if(iface.ip!==bi.ip||iface.up!==bi.up||iface.ipv4Mode!==bi.ipv4Mode)throw Error('checkpoint-conflict');
      if((iface.gateway??null)!==(bi.gateway??null)){
        if(iface.gateway&&!gateways.includes(parseIp(iface.gateway)!))throw Error('checkpoint-conflict');
        iface.gateway=bi.gateway??null;
      }
      const remaining=[...device.routes];
      for(const route of base.routes){const at=remaining.findIndex(r=>same(r,route));if(at<0)throw Error('checkpoint-conflict');remaining.splice(at,1);}
      const remove=new Set<SavedRoute>();
      for(const route of remaining){const destination=routeDestination(route);
        if(destination&&(destination.prefix===0||destination.prefix===24&&destination.addr===parseIp('192.168.20.0'))){
          if(route.dev!=='eth0'||!route.via||!gateways.includes(parseIp(route.via)!))throw Error('checkpoint-conflict');remove.add(route);
        }
      }
      device.routes=device.routes.filter(r=>!remove.has(r));
    }
  }
  // Initial preparation may only introduce this chapter's devices. Never remove
  // an unknown baseline entity or adopt an unknown ID into the owned group.
  for(const id of owned)if(beforeIds.has(id)&&c.chapter!=='first-connection'&&c.chapter!=='static-routing'&&c.chapter!=='alternative-paths')throw Error('checkpoint-invalid');
  const initialOwned=initial.devices.filter(d=>owned.has(d.id));
  const positions=new Map(now.devices.map((d,i)=>[d.id,i]));
  now.devices=now.devices.filter(d=>!owned.has(d.id));
  for(const d of initialOwned)now.devices.splice(Math.min(positions.get(d.id)??now.devices.length,now.devices.length),0,structuredClone(d));
  now.links=now.links.filter(l=>!owned.has(l.a[0])&&!owned.has(l.b[0]));
  for(const link of initial.links.filter(l=>owned.has(l.a[0])||owned.has(l.b[0]))){if(now.links.some(l=>l.id===link.id))throw Error('checkpoint-conflict');now.links.push(structuredClone(link));}
  // Drop only presentation references to removed owned entities. Other UI work stays.
  if(now.ui?.terminalColors)for(const id of owned)if(!initialOwned.some(d=>d.id===id))delete now.ui.terminalColors[id];
  if(now.ui?.cableColors){const links=new Set(now.links.map(l=>l.id));for(const id of Object.keys(now.ui.cableColors))if(!links.has(id))delete now.ui.cableColors[id];}
  if(!currentIds.size)throw Error('checkpoint-conflict');
  let normalized:ProjectDocument;try{normalized=normalizeProjectDocument(result);}catch{throw Error('checkpoint-conflict');}
  if(!same(result.topology.ui?.areaMarkings,normalized.topology.ui?.areaMarkings))throw Error('checkpoint-conflict');
  return normalized;
}
