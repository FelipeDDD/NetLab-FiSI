import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useStore} from '../store';
import {sim} from '../sim';
import {disposeNetwork} from '../engine/networkLifecycle';
import type {MetaValue,ProjectDocument} from '../projects/types';
import {DIRECT_C,ROUTER_IDS,routerDirectDocument} from './routerChapter';
import {FIRST_DEVICES,firstConnectionDocument} from './firstConnection';
import {SUBNET_PC_ID} from './subnetChapter';
import {newSubnetProgress} from './subnetProgress';
import {chapterRestartDocument,readChapterCheckpoint,type ChapterCheckpoint} from './chapterCheckpoints';
vi.mock('../terminals',()=>({disposeAllSessions:vi.fn(),disposeSession:vi.fn(),getSession:vi.fn(),refreshSessionProfile:vi.fn()}));
beforeEach(()=>vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}));
afterEach(()=>{useStore.getState().flushAutosave();disposeNetwork(sim.net);vi.unstubAllGlobals();});
const capture=()=>useStore.getState().captureWorkspaceDocument();
const saved=(d:ProjectDocument,id:string)=>d.topology.devices.find(n=>n.id===id)!;
function router(){
 useStore.getState().importJson(JSON.stringify(routerDirectDocument().topology));
 const before=capture();expect(useStore.getState().addRouterTutorialGroup(DIRECT_C)).toBeNull();const initial=capture();
 const progress={schemaVersion:2,chapterVersion:2,chapterId:'two-networks',draftId:'draft',pcC:DIRECT_C,source:'direct',prepared:true,step:1,completed:[1],replies:{a:null,f:null},diagnosis:{failure:false,reply:null}};
 const cp:ChapterCheckpoint={schemaVersion:1,kind:'chapter-checkpoint',draftId:'draft',chapter:'two-networks',attemptId:crypto.randomUUID(),before,initial,progress};
 const current=structuredClone(initial);saved(current,ROUTER_IDS.router).ifaces[0].ip='192.168.10.254/24';saved(current,ROUTER_IDS.router).ifaces[1].ip='192.168.20.254/24';
 return {cp,current,progress:progress as unknown as MetaValue};
}
it('restores only Chapter 3 ownership, preserving earlier masks, positions, DNS and unrelated static routes',()=>{
 const {cp,current,progress}=router();
 for(const d of [cp.before,cp.initial!,current]){saved(d,SUBNET_PC_ID).ifaces[0].ip='192.168.10.12/27';saved(d,FIRST_DEVICES.a).ifaces[0].gateway='192.168.10.9';saved(d,FIRST_DEVICES.b).routes=[{dest:'198.51.100.0/24',via:'192.168.10.9',dev:'eth0'}];}
 saved(current,FIRST_DEVICES.a).ifaces[0].gateway='192.168.10.254';saved(current,FIRST_DEVICES.a).ifaces[0].dns='1.1.1.1';saved(current,FIRST_DEVICES.a).x+=30;
 saved(current,FIRST_DEVICES.b).ifaces[0].gateway='192.168.10.254';saved(current,FIRST_DEVICES.b).routes.push({dest:'192.168.20.0/24',via:'192.168.10.254',dev:'eth0'},{dest:'203.0.113.0/24',via:'192.168.10.9',dev:'eth0'});
 saved(current,ROUTER_IDS.f).ifaces[0].ip='192.168.20.50/24';saved(current,ROUTER_IDS.f).routes=[{dest:'0.0.0.0/0',via:'192.168.20.254',dev:'eth0'}];
 const result=chapterRestartDocument(readChapterCheckpoint(cp,'draft','two-networks'),current,progress);
 expect(saved(result,FIRST_DEVICES.a).ifaces[0]).toMatchObject({gateway:'192.168.10.9',dns:'1.1.1.1'});expect(saved(result,FIRST_DEVICES.a).x).toBe(saved(current,FIRST_DEVICES.a).x);
 expect(saved(result,FIRST_DEVICES.b).routes.map(r=>r.dest)).toEqual(['198.51.100.0/24','203.0.113.0/24']);expect(saved(result,SUBNET_PC_ID)).toEqual(saved(current,SUBNET_PC_ID));
 for(const id of Object.values(ROUTER_IDS))expect(saved(result,id)).toEqual(saved(cp.initial!,id));
 expect(current.topology.devices.find(d=>d.id===ROUTER_IDS.f)!.ifaces[0].ip).toBe('192.168.20.50/24');
});
it.each(['gateway','route','previous-route','device','external-link','identity'] as const)('blocks ambiguous %s changes without mutating the input',kind=>{
 const {cp,current,progress}=router();
 if(kind==='gateway')saved(current,FIRST_DEVICES.b).ifaces[0].gateway='192.168.10.99';
 if(kind==='route')saved(current,FIRST_DEVICES.b).routes.push({dest:'0.0.0.0/0',via:'192.168.10.99',dev:'eth0'});
 if(kind==='previous-route'){const r={dest:'198.51.100.0/24',via:'192.168.10.9',dev:'eth0'};saved(cp.before,FIRST_DEVICES.b).routes.push(r);saved(cp.initial!,FIRST_DEVICES.b).routes.push(r);}
 if(kind==='device')current.topology.devices=current.topology.devices.filter(d=>d.id!==FIRST_DEVICES.b);
 if(kind==='identity')saved(current,ROUTER_IDS.router).ifaces[0].mac='02:ff:ff:ff:ff:ff';
 if(kind==='external-link'){const extra=structuredClone(saved(current,FIRST_DEVICES.a));extra.id='extra';extra.ifaces[0].mac='02:ff:ff:ff:ff:ff';current.topology.devices.push(extra);current.topology.links.push({id:'extra-link',a:[extra.id,'eth0'],b:[ROUTER_IDS.sw,'eth7']});}
 const snapshot=structuredClone(current);expect(()=>chapterRestartDocument(cp,current,progress)).toThrow('checkpoint-conflict');expect(current).toEqual(snapshot);
});
it('refuses missing, incompatible or incomplete checkpoint records and never invents a baseline',()=>{
 const {cp,current,progress}=router();expect(()=>readChapterCheckpoint(null,'draft','two-networks')).toThrow('checkpoint-invalid');
 expect(()=>readChapterCheckpoint({...cp,chapter:'subnet-mask'},'draft','two-networks')).toThrow('checkpoint-invalid');
 expect(()=>readChapterCheckpoint({...cp,before:null},'draft','two-networks')).toThrow('checkpoint-invalid');
 expect(()=>readChapterCheckpoint({...cp,initial:{...cp.initial!,topology:{...cp.initial!.topology,devices:cp.before.topology.devices}}},'draft','two-networks')).toThrow('checkpoint-invalid');
 expect(()=>chapterRestartDocument({...cp,initial:null,progress:null},current,progress)).toThrow('checkpoint-missing');
});
it('resets Chapter 1 from its own initial topology and removes only its identified C',()=>{
 useStore.getState().importJson(JSON.stringify(firstConnectionDocument().topology));const initial=capture();
 const p={schemaVersion:1,tutorialId:'first-connection',tutorialVersion:1,draftId:'draft',startedAt:1,step:1,completed:[],devices:{...FIRST_DEVICES,c:null},baseline:null,ipv4Applied:false,a:null,c:null};
 const cp:ChapterCheckpoint={schemaVersion:1,kind:'chapter-checkpoint',draftId:'draft',chapter:'first-connection',attemptId:crypto.randomUUID(),before:initial,initial,progress:p};
 const current=structuredClone(initial),c=structuredClone(saved(initial,FIRST_DEVICES.b));c.id='pc-c';c.ifaces[0].mac='02:ff:ff:ff:ff:01';current.topology.devices.push(c);saved(current,FIRST_DEVICES.a).ifaces[0].ip='192.168.10.10/24';
 expect(chapterRestartDocument(readChapterCheckpoint(cp,'draft','first-connection'),current,{...p,devices:{...p.devices,c:'pc-c'}})).toEqual(initial);
});
it('resets Chapter 2 D while preserving all Chapter 1 entities and positions',async()=>{
 useStore.getState().importJson(JSON.stringify(routerDirectDocument().topology));useStore.getState().deleteDevice(SUBNET_PC_ID);const before=capture();
 expect(useStore.getState().addSubnetTutorialPC(DIRECT_C)).toBeNull();const initial=capture(),p={...await newSubnetProgress('draft',DIRECT_C,'baseline'),prepared:true};
 const cp:ChapterCheckpoint={schemaVersion:1,kind:'chapter-checkpoint',draftId:'draft',chapter:'subnet-mask',attemptId:crypto.randomUUID(),before,initial,progress:p as unknown as MetaValue};
 const current=structuredClone(initial);saved(current,SUBNET_PC_ID).ifaces[0].ip='192.168.10.12/24';saved(current,SUBNET_PC_ID).x+=100;
 expect(chapterRestartDocument(readChapterCheckpoint(cp,'draft','subnet-mask'),current,p as unknown as MetaValue)).toEqual(initial);
});
