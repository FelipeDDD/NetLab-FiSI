import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { sim } from '../sim';
import { disposeNetwork } from '../engine/networkLifecycle';
import { createDevice } from '../engine/factory';
import { parseCidr, parseIp } from '../engine/ip';
import { Host, IpDevice } from '../engine/ipdevice';
import { serializeNetwork } from '../engine/serialize';
import { Shell } from '../commands/shell';
import { boxesOverlap, placementBox } from '../devicePlacement';
import type { ProjectRepository } from '../projects/repository';
import type { MetaRecord, ProjectDocument } from '../projects/types';
import type { SessionControllerState } from '../persistence/sessionTypes';
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import type { SubnetState } from './SubnetTutorialController';
import { FIRST_DEVICES } from './firstConnection';
import { SUBNET_PC_ID } from './subnetChapter';
import { RouterTutorialController } from './RouterTutorialController';
import { RouterProgressStore, ROUTER_PROGRESS_PREFIX, readRouterProgress } from './routerProgress';
import { DIRECT_C, ROUTER_IDS, routerDirectDocument } from './routerChapter';
vi.mock('../terminals',()=>({disposeAllSessions:vi.fn(),disposeSession:vi.fn(),getSession:vi.fn(),refreshSessionProfile:vi.fn()}));
beforeEach(()=>vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}));
afterEach(()=>{useStore.getState().flushAutosave();disposeNetwork(sim.net);vi.unstubAllGlobals();});
function fixture(){
  const meta=new Map<string,MetaRecord>(), docs=new Map<string,ProjectDocument>();let id='base',pending=false,commandId=0,writes=0,failAt=0;
  expect(useStore.getState().importJson(JSON.stringify(routerDirectDocument().topology))).toBeNull();docs.set(id,routerDirectDocument());
  const events=new Set<(e:TerminalCommandEvent)=>void>(),listeners=new Set<()=>void>(),notify=()=>listeners.forEach(fn=>fn());
  const sessions={getState:():SessionControllerState=>({phase:'ready',session:null,activeDraftId:id,error:null,pendingShare:false,drafts:[...docs.keys()].map(key=>({id:key,revision:1,editSequence:0,persistedSequence:0,pendingPersistence:false,saving:false,manualSavePending:true,base:null,error:null}))}),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},hasPendingOperations:()=>pending,
    flush:async()=>{docs.set(id,useStore.getState().captureWorkspaceDocument());return{ok:true as const,value:undefined};},
    openDocument:async(document:ProjectDocument)=>{await sessions.flush();pending=true;id='direct-'+docs.size;useStore.getState().importJson(JSON.stringify(document.topology));docs.set(id,document);pending=false;notify();return{ok:true as const,value:id};}};
  const parent:SubnetState={active:true,ready:true,busy:false,saving:false,storageError:false,passed:true,warning:null,answerError:false,demoRunning:false,record:{schemaVersion:1,chapterId:'subnet-mask',draftId:id,pcD:SUBNET_PC_ID,pcC:DIRECT_C,baseFingerprint:'sha256-v1:'+'0'.repeat(64),prepared:true,visible:true,step:5,answer:'255.255.255.240',inspected:true,answerAccepted:true,demoClaimed:true,demoPassed:true,unreachable:true,replies:{b:null,c:null}}};
  const repository:Pick<ProjectRepository,'getMeta'|'setMeta'>={getMeta:async key=>({ok:true,value:structuredClone(meta.get(key)??null)}),setMeta:async m=>{if(++writes===failAt)return{ok:false,error:{code:'quota-exceeded',message:'Quota'}};const current=meta.get(m.key)??null;if((current?.revision??null)!==m.expectedRevision)return{ok:false,error:{code:'meta-conflict',key:m.key,expectedRevision:m.expectedRevision,current,message:'Conflict'}};const r={key:m.key,revision:(current?.revision??0)+1,value:structuredClone(m.value)};meta.set(m.key,r);return{ok:true,value:r};}};
  const make=()=>new RouterTutorialController(sessions,{getState:()=>parent,subscribe:()=>()=>{},flushProgress:async()=>{}},{network:()=>sim.net,activeDraftId:()=>id,pendingForms:()=>false,subscribe:fn=>useStore.subscribe(fn),observeCommands:fn=>{events.add(fn);return()=>{events.delete(fn);};},insert:pcC=>useStore.getState().addRouterTutorialGroup(pcC),repeat:(step,sig,pcC)=>useStore.getState().repeatRouterTutorialTask(step,sig,pcC)},new RouterProgressStore(repository,sessions));
  let controller=make(),release=controller.connect();
  const settle=async()=>{for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));await controller.flushProgress();}};
  const config=(deviceId:string,iface:string,ip:string,gateway:string|null=null)=>{expect(useStore.getState().setInterfaceIpv4(deviceId,iface,{mode:'static',ip:parseCidr(ip),gateway:gateway?parseIp(gateway):null,dns:null})).toBeNull();};
  const submit=(deviceId:string,line:string,source:'keyboard'|'quick-ping'|'api'='keyboard')=>{const command={id:++commandId,network:sim.net,deviceId,line,source};events.forEach(fn=>fn({type:'started',command}));return new Shell(sim.net.devices.get(deviceId) as IpDevice).exec(line,{write:text=>events.forEach(fn=>fn({type:'output',command,text}))},()=>events.forEach(fn=>fn({type:'finished',command,reason:'completed'})));};
  const ready=async()=>{
    await controller.begin();await settle();controller.next();
    sim.net.connect(ROUTER_IDS.router,FIRST_DEVICES.sw,{aIface:'eth3',bIface:'eth4'});sim.net.connect(ROUTER_IDS.router,ROUTER_IDS.sw,{aIface:'eth1',bIface:'eth4'});useStore.getState().refresh();await settle();controller.next();
    config(ROUTER_IDS.router,'eth3','192.168.10.254/24');config(ROUTER_IDS.router,'eth1','192.168.20.253/24');await settle();controller.next();
    sim.net.connect(ROUTER_IDS.f,ROUTER_IDS.sw);config(ROUTER_IDS.f,'eth0','192.168.20.20/24');await settle();controller.next();config(FIRST_DEVICES.a,'eth0','192.168.10.10/24','192.168.10.254');await settle();controller.next();
    submit(ROUTER_IDS.f,'ip route add default via 192.168.20.253 dev eth0');useStore.getState().refresh();await settle();controller.next();await settle();
  };
  return{get controller(){return controller;},meta,docs,sessions,settle,config,submit,ready,notify,fail(n:number){failAt=n;},advance(){sim.net.scheduler.advanceTo(sim.net.now+5000);},async reload(){await settle();await sessions.flush();release();useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology));controller=make();release=controller.connect();await settle();},dispose(){release();}};
}
describe('two networks chapter',()=>{
 it.each(['inspector','terminal'] as const)('diagnoses an observed missing route, then requires a new B/F reply after %s repair',async method=>{const f=fixture();try{
  await f.ready();f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.20');f.advance();await f.settle();f.submit(ROUTER_IDS.f,'ping -c 1 192.168.10.10','quick-ping');f.advance();await f.settle();f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(8);
  f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.20');f.advance();await f.settle();expect(f.controller.getState().record?.diagnosis.failure).toBe(false);
  f.submit(FIRST_DEVICES.b,'ping -c 1 192.168.20.20','api');await f.settle();expect(f.controller.getState().record?.diagnosis.failure).toBe(false);
  f.submit(FIRST_DEVICES.b,'ping -c 1 192.168.20.20','quick-ping');await f.settle();expect(f.controller.getState().record?.diagnosis.failure).toBe(true);expect(f.controller.getState().passed).toBe(false);await f.reload();expect(f.controller.getState().record?.diagnosis.failure).toBe(true);
  if(method==='inspector')f.config(FIRST_DEVICES.b,'eth0','192.168.10.20/24','192.168.10.254');else{f.submit(FIRST_DEVICES.b,'ip route add 192.168.20.0/24 via 192.168.10.254 dev eth0');useStore.getState().refresh();}
  await f.settle();expect(f.controller.getState().passed).toBe(false);f.submit(FIRST_DEVICES.b,'ping -c 1 192.168.20.20',method==='inspector'?'quick-ping':'keyboard');f.advance();await f.settle();expect(f.controller.getState().passed).toBe(true);await f.reload();expect(f.controller.getState().passed).toBe(true);
 }finally{f.dispose();}});
 it('does not manufacture a missing-route failure when B is already configured, or has a wrong route',async()=>{const f=fixture();try{
  await f.ready();f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.20');f.advance();await f.settle();f.submit(ROUTER_IDS.f,'ping -c 1 192.168.10.10');f.advance();await f.settle();f.controller.next();await f.settle();
  f.submit(FIRST_DEVICES.b,'ip route add default via 192.168.10.99 dev eth0');useStore.getState().refresh();await f.settle();f.submit(FIRST_DEVICES.b,'ping -c 1 192.168.20.20');f.advance();await f.settle();expect(f.controller.getState().record?.diagnosis.failure).toBe(false);expect(f.controller.getState().passed).toBe(false);
  f.submit(FIRST_DEVICES.b,'ip route replace default via 192.168.10.254 dev eth0');useStore.getState().refresh();await f.settle();const before=serializeNetwork(sim.net,{});f.submit(FIRST_DEVICES.b,'ping -c 1 192.168.20.20','quick-ping');f.advance();await f.settle();expect(f.controller.getState().passed).toBe(true);expect(f.controller.getState().record?.diagnosis.failure).toBe(false);expect(serializeNetwork(sim.net,{})).toEqual(before);
 }finally{f.dispose();}});
 it('repeats only A gateway or F explicit default route, with undo/redo, F5 and stale-confirmation protection',async()=>{const f=fixture();try{
  await f.ready();f.controller.previous();f.controller.previous();await f.settle();expect(f.controller.getState().record?.step).toBe(5);
  const old=serializeNetwork(sim.net,{}),ticket=f.controller.repeatTicket()!;expect(ticket).toBeTruthy();expect(serializeNetwork(sim.net,{})).toEqual(old);
  f.config(FIRST_DEVICES.a,'eth0','192.168.10.10/24','192.168.10.1');await f.settle();const changed=serializeNetwork(sim.net,{});f.controller.repeatTask(ticket);expect(f.controller.getState().repeatError).toBe(true);expect(serializeNetwork(sim.net,{})).toEqual(changed);
  f.config(FIRST_DEVICES.a,'eth0','192.168.10.10/24','192.168.10.254');await f.settle();f.controller.repeatTask(f.controller.repeatTicket()!);await f.settle();expect(f.controller.getState().passed).toBe(false);expect(sim.net.devices.get(FIRST_DEVICES.a)!.interfaces[0].gateway).toBeNull();
  useStore.getState().undoTopology();await f.settle();expect(f.controller.getState().passed).toBe(true);useStore.getState().redoTopology();await f.settle();expect(f.controller.getState().passed).toBe(false);await f.reload();expect(f.controller.getState().passed).toBe(false);expect(sim.net.devices.get(ROUTER_IDS.f)!.interfaces[0].ip?.addr).toBe(parseIp('192.168.20.20'));
  f.config(FIRST_DEVICES.a,'eth0','192.168.10.10/24','192.168.10.254');await f.settle();f.controller.next();await f.settle();
  f.submit(ROUTER_IDS.f,'ip route add 198.51.100.0/24 via 192.168.20.253 dev eth0');useStore.getState().refresh();await f.settle();const routes=structuredClone((sim.net.devices.get(ROUTER_IDS.f) as Host).staticRoutes);f.controller.repeatTask(f.controller.repeatTicket()!);await f.settle();expect(f.controller.getState().passed).toBe(false);expect((sim.net.devices.get(ROUTER_IDS.f) as Host).staticRoutes).toEqual(routes.filter(r=>r.prefix!==0));
  useStore.getState().undoTopology();await f.settle();expect((sim.net.devices.get(ROUTER_IDS.f) as Host).staticRoutes).toEqual(routes);expect(f.controller.getState().passed).toBe(true);useStore.getState().redoTopology();await f.settle();expect(f.controller.getState().passed).toBe(false);await f.reload();expect(f.controller.getState().passed).toBe(false);expect((sim.net.devices.get(ROUTER_IDS.f) as Host).staticRoutes).toEqual(routes.filter(r=>r.prefix!==0));
 }finally{f.dispose();}});
 it.each(['interface','duplicates'] as const)('refuses an ambiguous %s default reset without partial mutations',async kind=>{const f=fixture();try{
  await f.ready();f.controller.previous();await f.settle();const host=sim.net.devices.get(ROUTER_IDS.f) as Host;
  if(kind==='interface'){host.staticRoutes=[];f.config(ROUTER_IDS.f,'eth0','192.168.20.20/24','192.168.20.253');}else{host.staticRoutes.push(structuredClone(host.staticRoutes[0]));useStore.getState().refresh();}
  await f.settle();expect(f.controller.getState().passed).toBe(true);const before=serializeNetwork(sim.net,{});f.controller.repeatTask(f.controller.repeatTicket()!);expect(f.controller.getState().repeatError).toBe(true);expect(serializeNetwork(sim.net,{})).toEqual(before);
 }finally{f.dispose();}});
 it('adapts v1 progress without reusing A/E proofs or rewriting old connected F topology',async()=>{const f=fixture();try{
  await f.ready();const r=f.controller.getState().record!,hash='sha256-v1:'+'1'.repeat(64),legacy={schemaVersion:1,chapterId:r.chapterId,chapterVersion:1,draftId:r.draftId,pcC:r.pcC,source:r.source,prepared:true,step:6,completed:[1,2,3,4,5,6],replies:{a:hash,e:hash}};
  const key=ROUTER_PROGRESS_PREFIX+r.draftId;f.meta.set(key,{key,revision:99,value:legacy});const before=serializeNetwork(sim.net,{});await f.reload();expect(serializeNetwork(sim.net,{})).toEqual(before);expect(f.controller.getState().record).toMatchObject({schemaVersion:2,chapterVersion:2,step:6,completed:[1,2,3,4,5,6],replies:{a:null,f:null},legacy:{step:6,completed:[1,2,3,4,5,6],replies:{a:hash,e:hash}}});f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(7);expect(f.controller.getState().passed).toBe(false);await f.reload();expect(f.controller.getState().record?.legacy?.replies.e).toBe(hash);
  expect(()=>readRouterProgress({...legacy,chapterVersion:99},r.draftId)).toThrow();
 }finally{f.dispose();}});
 it('continues in place, preserves D /27, positions and earlier metadata, and inserts a nonoverlapping undoable group',async()=>{
  const f=fixture();try{f.config(SUBNET_PC_ID,'eth0','192.168.10.12/27');const original=[...sim.net.devices.values()],positions=useStore.getState().nodes.map(n=>({id:n.id,position:n.position}));f.meta.set('guided:v1:draft:base',{key:'guided:v1:draft:base',revision:9,value:{historical:true}});
   await f.controller.begin();await f.settle();expect(f.docs.size).toBe(1);expect(sim.net.devices.size).toBe(9);expect(original.every(d=>sim.net.devices.get(d.id)===d)).toBe(true);expect(original.find(d=>d.id===SUBNET_PC_ID)!.interfaces[0].ip?.prefix).toBe(27);
   expect(useStore.getState().nodes.filter(n=>positions.some(p=>p.id===n.id)).map(n=>({id:n.id,position:n.position}))).toEqual(positions);
   const boxes=useStore.getState().nodes.map(placementBox);expect(boxes.some((a,i)=>boxes.slice(i+1).some(b=>boxesOverlap(a,b)))).toBe(false);expect(f.meta.get('guided:v1:draft:base')?.revision).toBe(9);
   useStore.getState().undoTopology();await f.settle();expect(sim.net.devices.size).toBe(5);expect(f.controller.getState().warning).toBe('missing');useStore.getState().redoTopology();await f.settle();expect(sim.net.devices.size).toBe(9);
   const placed=useStore.getState().nodes.map(n=>({id:n.id,position:n.position}));await f.reload();expect(useStore.getState().nodes.map(n=>({id:n.id,position:n.position}))).toEqual(placed);
  }finally{f.dispose();}
 });
 it('starts directly with the reference layout in another draft, retaining tutorial initial conditions after reload',async()=>{const f=fixture();try{
  const before=serializeNetwork(sim.net,{});await f.controller.begin(true);await f.settle();expect(f.docs.size).toBe(2);expect(f.controller.getState().record?.source).toBe('direct');expect(f.controller.getState().record?.step).toBe(1);expect([...f.meta.keys()].every(k=>k.startsWith(ROUTER_PROGRESS_PREFIX))).toBe(true);expect(f.docs.get('base')!.topology.devices.map(d=>d.id)).toEqual(before.devices.map(d=>d.id));
  const reference:Record<string,[number,number]>={[FIRST_DEVICES.a]:[255,56],[FIRST_DEVICES.b]:[570,56],[DIRECT_C]:[255,493],[SUBNET_PC_ID]:[570,493],[FIRST_DEVICES.sw]:[371,280],[ROUTER_IDS.router]:[1012,268],[ROUTER_IDS.sw]:[1346,280],[ROUTER_IDS.e]:[1676,130],[ROUTER_IDS.f]:[1676,470]};
  for(const n of useStore.getState().nodes){expect(Math.abs(n.position.x-reference[n.id][0])).toBeLessThan(10);expect(Math.abs(n.position.y-reference[n.id][1])).toBeLessThan(1);}
  const boxes=useStore.getState().nodes.map(placementBox);expect(boxes.some((a,i)=>boxes.slice(i+1).some(b=>boxesOverlap(a,b)))).toBe(false);
  const initial=serializeNetwork(sim.net,{}),positions=useStore.getState().nodes.map(n=>({id:n.id,position:n.position}));expect(sim.net.devices.get(ROUTER_IDS.f)!.interfaces[0].ip).toBeNull();expect(sim.net.devices.get(ROUTER_IDS.f)!.interfaces[0].link).toBeNull();expect(sim.net.devices.get(ROUTER_IDS.router)!.interfaces.every(i=>!i.ip&&!i.link)).toBe(true);expect(sim.net.devices.get(FIRST_DEVICES.a)!.interfaces[0].gateway).toBeNull();
  await f.reload();expect(serializeNetwork(sim.net,{})).toEqual(initial);expect(useStore.getState().nodes.map(n=>({id:n.id,position:n.position}))).toEqual(positions);
 }finally{f.dispose();}});
 it('matches cables and interfaces, requires F cable/IP, A gateway and an effective F default route',async()=>{const f=fixture();try{
  await f.controller.begin();await f.settle();f.controller.next();expect(f.controller.getState().passed).toBe(false);
  sim.net.connect(ROUTER_IDS.router,FIRST_DEVICES.sw,{aIface:'eth3',bIface:'eth4'});sim.net.connect(ROUTER_IDS.router,ROUTER_IDS.sw,{aIface:'eth1',bIface:'eth4'});useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(true);f.controller.next();
  f.config(ROUTER_IDS.router,'eth3','192.168.20.1/24');f.config(ROUTER_IDS.router,'eth1','192.168.10.1/24');await f.settle();expect(f.controller.getState().passed).toBe(false);
  f.submit(ROUTER_IDS.router,'ip address del 192.168.20.1/24 dev eth3');f.submit(ROUTER_IDS.router,'ip address add 192.168.10.254/24 dev eth3');f.config(ROUTER_IDS.router,'eth1','192.168.20.253/24');useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(true);f.controller.next();
  for(const ip of ['192.168.20.0/24','192.168.20.255/24','192.168.20.10/24','192.168.10.50/24','192.168.20.50/25']){f.config(ROUTER_IDS.f,'eth0',ip);await f.settle();expect(f.controller.getState().passed).toBe(false);}
  f.config(ROUTER_IDS.f,'eth0','192.168.20.20/24');await f.settle();expect(f.controller.getState().passed).toBe(false);
  sim.net.connect(ROUTER_IDS.f,FIRST_DEVICES.sw);useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(false);sim.net.disconnect(sim.net.devices.get(ROUTER_IDS.f)!.interfaces[0].link!.id);
  sim.net.connect(ROUTER_IDS.f,ROUTER_IDS.sw);useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(true);f.controller.next();f.config(FIRST_DEVICES.a,'eth0','192.168.10.10/24','192.168.10.254');await f.settle();expect(f.controller.getState().passed).toBe(true);expect((sim.net.devices.get(FIRST_DEVICES.a) as Host).staticRoutes).toEqual([]);expect(sim.net.devices.get(ROUTER_IDS.e)!.interfaces[0].gateway).toBeNull();
  f.controller.next();await f.settle();expect(f.controller.getState().passed).toBe(false);
  f.submit(ROUTER_IDS.f,'ip route add default via 192.168.20.99 dev eth0');useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(false);
  f.submit(ROUTER_IDS.f,'ip route replace default via 192.168.20.253 dev eth0');useStore.getState().refresh();await f.settle();expect(f.controller.getState().passed).toBe(true);
 }finally{f.dispose();}});
 it('requires A/F replies, rejects E and API/probes, and restores only configuration-matched receipts',async()=>{const f=fixture();try{await f.ready();expect(f.controller.getState().record?.step).toBe(7);f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.20','api');f.advance();await f.settle();expect(f.controller.getState().passed).toBe(false);
  f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.10');f.advance();await f.settle();expect(f.controller.getState().replies.a).toBe(false);
  f.submit(FIRST_DEVICES.a,'ping -c 1 192.168.20.20','quick-ping');f.advance();await f.settle();expect(f.controller.getState().replies.a).toBe(true);expect(f.controller.getState().passed).toBe(false);await f.reload();expect(f.controller.getState().replies.a).toBe(true);
  f.submit(ROUTER_IDS.f,'ping -c 1 192.168.10.10');f.advance();await f.settle();expect(f.controller.getState().passed).toBe(true);const saved=serializeNetwork(sim.net,{});f.controller.previous();f.controller.next();await f.settle();expect(serializeNetwork(sim.net,{})).toEqual(saved);await f.reload();expect(f.controller.getState().passed).toBe(true);
  f.config(ROUTER_IDS.f,'eth0','192.168.20.21/24');await f.settle();expect(f.controller.getState().passed).toBe(false);expect(f.controller.getState().replies).toEqual({a:false,f:false,b:false});expect(f.controller.getState().record?.replies.a).toBeTruthy();
 }finally{f.dispose();}});
 it('adopts the exact prepared group after a failed receipt without duplicating it after F5',async()=>{const f=fixture();try{f.fail(2);await f.controller.begin();await f.settle();expect(f.controller.getState().storageError).toBe(true);expect(sim.net.devices.size).toBe(9);expect((f.meta.get(ROUTER_PROGRESS_PREFIX+'base')!.value as {prepared:boolean}).prepared).toBe(false);f.fail(0);await f.reload();expect(f.controller.getState().record?.prepared).toBe(true);expect(sim.net.devices.size).toBe(9);}finally{f.dispose();}});
 it('recovers an interrupted v1 insertion while retaining its original F cable',async()=>{const f=fixture();try{
  await f.controller.begin();await f.settle();sim.net.connect(ROUTER_IDS.f,ROUTER_IDS.sw,{id:'tutorial-03-f-link',aIface:'eth0',bIface:'eth1'});useStore.getState().refresh();await f.settle();
  const r=f.controller.getState().record!,key=ROUTER_PROGRESS_PREFIX+r.draftId;
  f.meta.set(key,{key,revision:99,value:{schemaVersion:1,chapterId:r.chapterId,chapterVersion:1,draftId:r.draftId,pcC:r.pcC,source:r.source,prepared:false,step:1,completed:[],replies:{a:null,e:null}}});
  const before=serializeNetwork(sim.net,{});await f.reload();expect(f.controller.getState().record?.prepared).toBe(true);expect(serializeNetwork(sim.net,{})).toEqual(before);expect(sim.net.devices.size).toBe(9);
 }finally{f.dispose();}});
 it('does not insert a group until its initial intent commits successfully',async()=>{const f=fixture();try{f.fail(1);await f.controller.begin();await f.settle();expect(f.controller.getState().storageError).toBe(true);expect(sim.net.devices.size).toBe(5);expect(f.meta.has(ROUTER_PROGRESS_PREFIX+'base')).toBe(false);f.fail(0);await f.controller.retryProgress();await f.settle();expect(sim.net.devices.size).toBe(9);expect(f.controller.getState().record?.prepared).toBe(true);}finally{f.dispose();}});
 it.each(['missing','conflict','noPort'] as const)('reports %s without mutating the existing topology',async warning=>{const f=fixture();try{
  if(warning==='missing')useStore.getState().deleteDevice(FIRST_DEVICES.sw);
  if(warning==='conflict')createDevice(sim.net,'host',{id:ROUTER_IDS.e,name:'different'});
  if(warning==='noPort')for(let i=0;i<4;i++){const h=createDevice(sim.net,'host');sim.net.connect(h.id,FIRST_DEVICES.sw);}
  const before=serializeNetwork(sim.net,{});await f.controller.begin();await f.settle();expect(f.controller.getState().warning).toBe(warning);expect(serializeNetwork(sim.net,{})).toEqual(before);
 }finally{f.dispose();}});
});
