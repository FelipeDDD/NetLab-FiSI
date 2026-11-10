import { expect, it } from 'vitest';
import { createAlternativeEntryAttempt, createAlternativeBeginningAttempt, prepareAlternativeEntryRestart } from './alternativeEntries';
import { ALTERNATIVE_ENTRIES, ALTERNATIVE_ENTRY_C, readAlternativeEntry } from './alternativeEntryContract';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, alternativeConditions, failureBaselineSignature } from './alternativePathsChapter';
import { readAlternativeProgress } from './alternativePathsProgress';
import { readChapterCheckpoint, chapterRestartDocument } from './chapterCheckpoints';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { alternativePathsCompletion, alternativePart4Complete } from './completion';
import type { MetaValue } from '../projects/types';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { tutorialFingerprint } from './tutorialProgress';

it('initializes the same beginning triangle atomically without learner credit or a supplied-entry flag',()=>{
  const a=createAlternativeBeginningAttempt(),prepared=prepareTopologyDocument(a.document.topology);
  try{
    expect(a.document.topology.devices.map(d=>d.id).sort()).toEqual([I.r1,I.r2,I.r3].sort());
    expect([...prepared.network.devices.values()].every(d=>d instanceof IpDevice&&d.interfaces.every(i=>!i.ip)&&d.staticRoutes.length===0)).toBe(true);
    expect(a.progress).toMatchObject({schemaVersion:1,prepared:true,stage:'triangle',step:1,completed:[],storm:'pending'});expect(a.progress.entry).toBeUndefined();
    expect(readChapterCheckpoint(a.checkpoint,a.progress.draftId,'alternative-paths').progress).toEqual(a.progress);
  }finally{disposeNetwork(prepared.network);}
});

it.each(['part-2','part-3'] as const)('builds a versioned %s scenario with real configurations and no learner evidence',point=>{
  const a=createAlternativeEntryAttempt(point),id=a.progress.draftId,p=prepareTopologyDocument(a.document.topology);
  try{
    expect(alternativeConditions(p.network)).toMatchObject({strict:true,lans:true,via:point==='part-3'});
    expect(p.network.devices.size).toBe(5);expect(p.network.devices.get(I.r3)!.getInterface('eth3')!.ip).toBeNull();
    expect(a.progress).toMatchObject({schemaVersion:2,step:point==='part-2'?7:14,completed:[],hopUnderstood:false,remoteUnderstood:false,lpmUnderstood:false,viaReplies:{ab:null,ba:null},failure:null,viaBaseline:null,lpm:{stage:'unprepared',pc:null,legacy:false,experiment:{legacy:false,r2:null,broad:null,specific:null}}});
    expect(Object.values(a.progress.neighbors)).toEqual(Array(6).fill(null));expect(alternativePathsCompletion(a.progress)).toEqual({completed:0,total:22,complete:false});
    expect(readAlternativeProgress(a.progress,id)).toEqual(a.progress);expect(readChapterCheckpoint(a.checkpoint,id,'alternative-paths').progress).toEqual(a.progress);
    const again=prepareTopologyDocument(a.document.topology);try{expect(again.network.devices.get(I.a)!.interfaces[0].mac).toBe(a.progress.extension!.a);}finally{disposeNetwork(again.network);}
    expect(a.options.initialization!.id).toBe(id);expect(a.options.initialization!.control).toHaveLength(2);
  }finally{disposeNetwork(p.network);}
});
it('refuses arbitrary skip lists, unsupported scenarios and incompatible contract versions',()=>{
  for(const patch of [{firstTask:20},{scenarioVersion:2},{suppliedTasks:[1]},{point:'part-5'},{legacy:true}])expect(()=>readAlternativeEntry({...ALTERNATIVE_ENTRIES['part-3'],...patch})).toThrow();
});
it('never accepts supplied steps as completed or fabricated prior receipts and answers',()=>{
  const {progress:p}=createAlternativeEntryAttempt('part-3');
  for(const patch of [{schemaVersion:1},{entry:undefined},{completed:[1]},{step:13},{hopUnderstood:true},{viaReplies:{ab:'sha256-v1:'+'a'.repeat(64),ba:null}},{lpm:{...p.lpm,legacy:true}}])expect(()=>readAlternativeProgress({...p,...patch},p.draftId)).toThrow();
});
it.each(['part-2','part-3'] as const)('restarts %s at its own initial task, preserving supplied addresses, routes, MACs and independent devices',point=>{
  const {checkpoint:cp,progress}=createAlternativeEntryAttempt(point),id=progress.draftId,current=structuredClone(cp.initial!);
  const c={id:'student-c',name:'PC C',kind:'host' as const,os:'windows' as const,forwarding:false,x:1800,y:900,routes:[],ifaces:[{name:'eth0',mac:'02:00:00:00:00:ee',up:true,ip:'192.168.30.130/25',ipv4Mode:'static' as const,gateway:'192.168.30.129'}]};
  current.topology.devices.push(c,{...structuredClone(c),id:'independent',name:'Independent',ifaces:[{...c.ifaces[0],mac:'02:00:00:00:00:ef',ip:null,gateway:undefined}]});
  current.topology.devices.find(d=>d.id===I.r3)!.ifaces[3].ip='192.168.30.129/25';current.topology.devices.find(d=>d.id===I.r1)!.x+=100;
  current.topology.links.push({id:'student-c-link',a:[c.id,'eth0'],b:[I.r3,'eth3'],latency:40});
  const p={...progress,step:15,completed:[14],lpm:{...progress.lpm,stage:'ready' as const,baseline:Object.values(I),pc:{id:c.id,mac:c.ifaces[0].mac}}};
  const reset=chapterRestartDocument(readChapterCheckpoint(cp,id,'alternative-paths'),current,p as unknown as MetaValue);
  expect(reset.topology.devices.some(d=>d.id===c.id)).toBe(false);expect(reset.topology.devices.some(d=>d.id==='independent')).toBe(true);
  for(const before of cp.initial!.topology.devices)expect(reset.topology.devices.find(d=>d.id===before.id)).toEqual(before);
  expect(cp.progress).toMatchObject({step:point==='part-2'?7:14,completed:[]});
  expect(()=>chapterRestartDocument(cp,current,{...p,entry:undefined} as unknown as MetaValue)).toThrow();
});
it('rejects a corrupted restart baseline instead of trusting the scenario label',()=>{
  const {checkpoint:cp,progress:p}=createAlternativeEntryAttempt('part-3');
  cp.before.topology.devices.find(d=>d.id===I.r1)!.routes=[];cp.initial=structuredClone(cp.before);
  expect(()=>readChapterCheckpoint(cp,p.draftId,'alternative-paths')).toThrow();
});
it('plans task 14 automatic preparation together with restart progress, without a new Inspector write or fake evidence',async()=>{
  const {document,progress}=createAlternativeEntryAttempt('part-3'),before=structuredClone(document);
  const reset=await prepareAlternativeEntryRestart(document,progress as unknown as MetaValue);
  expect(document).toEqual(before);expect(reset.progress).toMatchObject({step:14,completed:[],viaReplies:{ab:null,ba:null},hopUnderstood:false,lpm:{stage:'ready',pc:null,localReply:null,experiment:{r2:null,broad:null,specific:null}}});
  expect(reset.document.topology.devices).toHaveLength(5);expect(reset.document.topology.devices.find(d=>d.id===I.r3)!.ifaces[3].ip).toBe('192.168.30.129/25');
  const conflict=structuredClone(document);conflict.topology.devices.find(d=>d.id===I.r3)!.ifaces[3].ip='203.0.113.1/24';
  await expect(prepareAlternativeEntryRestart(conflict,progress as unknown as MetaValue)).rejects.toThrow('checkpoint-conflict');
});
it('creates Part 4 before the incident with functional A/B/C, real /24 and /25 alternatives and only a technical baseline',async()=>{
  const a=await createAlternativeEntryAttempt('part-4'),p=prepareTopologyDocument(a.document.topology),net=p.network;
  try{
    const before=structuredClone(a.progress);
    expect(a.progress).toMatchObject({step:20,completed:[],storm:'pending',viaBaseline:null,scenarioBaseline:expect.stringMatching(/^sha256-v1:/),hopUnderstood:false,lpmUnderstood:false,lpm:{stage:'ready',pc:{id:ALTERNATIVE_ENTRY_C},localReply:null,pathReply:null,legacy:false,experiment:{legacy:false,r2:null,broad:null,specific:null}}});
    expect(alternativeConditions(net)).toMatchObject({via:true,direct:false,broken:false});expect(net.links.get(L.right)!.operational).toBe(true);
    expect(a.progress.scenarioBaseline).toBe(await tutorialFingerprint(failureBaselineSignature(net)));
    const r1=net.devices.get(I.r1) as IpDevice;
    expect(r1.lookupRoute(parseIp('192.168.30.130')!)).toMatchObject({prefix:25,via:parseIp('10.0.13.2'),ifaceName:'eth1'});
    expect(r1.staticRoutes).toEqual(expect.arrayContaining([expect.objectContaining({prefix:24,via:parseIp('10.0.12.2')})]));
    for(const [from,target] of [[I.a,'192.168.20.20'],[I.b,'192.168.10.10'],[I.a,'192.168.30.130'],[ALTERNATIVE_ENTRY_C,'192.168.10.10'],[ALTERNATIVE_ENTRY_C,'192.168.30.129']]){
      let out='';new Shell(net.devices.get(from) as IpDevice).exec('ping -c 1 '+target,{write:s=>{out+=s;}},()=>{});net.scheduler.advanceTo(net.now+6000);expect(out).toContain('64 bytes from '+target);
    }
    expect(a.progress).toEqual(before);expect(alternativePathsCompletion(a.progress)).toEqual({completed:0,total:22,complete:false});expect(alternativePart4Complete(a.progress)).toBe(false);
    expect(readChapterCheckpoint(a.checkpoint,a.progress.draftId,'alternative-paths').progress).toEqual(a.progress);
  }finally{disposeNetwork(net);}
});
it('refuses fabricated supplied evidence, invalid C identities and missing Part 4 technical baselines',async()=>{
  const a=await createAlternativeEntryAttempt('part-4'),p=a.progress;
  for(const patch of [{completed:[19]},{viaBaseline:p.scenarioBaseline},{scenarioBaseline:null},{lpmUnderstood:true},{storm:'legacy'},
    {lpm:{...p.lpm,localReply:p.scenarioBaseline}},{lpm:{...p.lpm,pc:{...p.lpm.pc,id:'independent'}}}])expect(()=>readAlternativeProgress({...p,...patch},p.draftId)).toThrow();
  const corrupted=structuredClone(a.checkpoint);(corrupted.progress as unknown as typeof p).lpm.pc!.mac='02:00:00:ff:ff:ff';expect(()=>readChapterCheckpoint(corrupted,p.draftId,'alternative-paths')).toThrow();
  const b=createAlternativeEntryAttempt('part-2');expect(()=>readAlternativeProgress({...b.progress,scenarioBaseline:p.scenarioBaseline},b.progress.draftId)).toThrow();
});
it('restores the supplied PC C and the pre-storm topology, renewing only the technical baseline for retained independent devices',async()=>{
  const a=await createAlternativeEntryAttempt('part-4'),current=structuredClone(a.document),p=structuredClone(a.progress);
  current.topology.devices.find(d=>d.id===I.r2)!.ifaces[1].up=false;
  current.topology.devices.find(d=>d.id===I.r1)!.routes=[];
  const independent={...structuredClone(current.topology.devices.find(d=>d.id===ALTERNATIVE_ENTRY_C)!),id:'independent',name:'Independent',ifaces:[{name:'eth0',up:true,ip:null,mac:'02:00:00:ff:00:01',ipv4Mode:'unconfigured' as const}]};current.topology.devices.push(independent);
  p.storm='applied';const after=chapterRestartDocument(a.checkpoint,current,p as unknown as MetaValue),reset=await prepareAlternativeEntryRestart(after,a.checkpoint.progress!);
  expect(reset.progress).toMatchObject({step:20,completed:[],storm:'pending',failure:null,viaBaseline:null,lpm:{pc:a.progress.lpm.pc,localReply:null}});
  expect(reset.document.topology.devices.find(d=>d.id===ALTERNATIVE_ENTRY_C)).toEqual(a.document.topology.devices.find(d=>d.id===ALTERNATIVE_ENTRY_C));
  expect(reset.document.topology.devices.find(d=>d.id==='independent')).toMatchObject(independent);expect(reset.document.topology.devices.find(d=>d.id===I.r2)!.ifaces[1].up).toBe(true);
  const prepared=prepareTopologyDocument(reset.document.topology);try{expect((reset.progress as unknown as typeof p).scenarioBaseline).toBe(await tutorialFingerprint(failureBaselineSignature(prepared.network)));}finally{disposeNetwork(prepared.network);}
  const bad=structuredClone(current);bad.topology.devices.find(d=>d.id===ALTERNATIVE_ENTRY_C)!.ifaces[0].mac='02:00:00:ff:ff:ff';expect(()=>chapterRestartDocument(a.checkpoint,bad,p as unknown as MetaValue)).toThrow();
});
