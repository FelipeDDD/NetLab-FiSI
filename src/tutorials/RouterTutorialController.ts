import type { SessionController } from '../persistence/sessionController';
import type { SubnetTutorialController } from './SubnetTutorialController';
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import type { TerminalCommandContext, TerminalCommandEvent } from '../terminalCommandEvents';
import { FIRST_DEVICES } from './firstConnection';
import { tutorialFingerprint } from './tutorialProgress';
import { RouterProgressStore, type RouterProgress } from './routerProgress';
import { DIRECT_C, ROUTER_IDS, initialRouterGroup, routerConditions, routerDirectDocument, routerPreparationError, routerSignature, routerTarget, type RouterWarning } from './routerChapter';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import type { MetaValue } from '../projects/types';

type Sessions = Pick<SessionController,'getState'|'subscribe'|'hasPendingOperations'|'openDocument'>;
type Previous = Pick<SubnetTutorialController,'getState'|'subscribe'|'flushProgress'>;
export interface RouterRuntime {
  openAttempt?: SessionController['openDocument'];
  checkpoint?:ChapterCheckpointHooks;suspended?():boolean;restarting?():boolean;
  network():Network; activeDraftId():string|null; pendingForms():boolean;
  subscribe(fn:()=>void):()=>void; observeCommands(fn:(event:TerminalCommandEvent)=>void):()=>void;
  insert(pcC:string):RouterWarning|null; started?(draftId:string):void;
  repeat?(step:5|6,signature:string,pcC:string):RouterWarning|null;
}
export interface RouterRepeatTicket {draftId:string;step:5|6;signature:string;network:Network}
export interface RouterState {
  active:boolean; busy:boolean; saving:boolean; storageError:boolean; record:RouterProgress|null; passed:boolean; warning:RouterWarning|null; loadedDraft:string|null; repeatError:boolean; replies:{a:boolean;f:boolean;b:boolean};
}
export class RouterTutorialController {
  private state:RouterState={active:false,busy:false,saving:false,storageError:false,record:null,passed:false,warning:null,loadedDraft:null,repeatError:false,replies:{a:false,f:false,b:false}};
  private listeners=new Set<()=>void>(); private releases:(()=>void)[]=[];
  private records=new Map<string,RouterProgress|null>(); private loading=new Map<string,Promise<void>>(); private failed=new Set<string>(); private readFailed=new Set<string>();
  private disposed=false; private pending=0; private restoring=false;
  private validated?:{net:Network;signature:string}; private receipts:{a:string|null;f:string|null;b:string|null}={a:null,f:null,b:null};
  private candidate?:{command:TerminalCommandContext;signature:string;target:string;key:'a'|'f'|'b';kind:'reply'|'failure';output:string;proved:boolean};
  private attempted=new WeakSet<Network>();
  constructor(private sessions:Sessions,private parent:Previous,private runtime:RouterRuntime,private progress:RouterProgressStore){}
  getState=()=>this.state;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  /** While discovering an active draft, older chapters must not rewrite history. */
  holdsDraft(id:string|null) { return !!id && (!this.records.has(id)||!!this.records.get(id)); }
  private publish(patch:Partial<RouterState>) {
    if(this.disposed)return; const next={...this.state,...patch};
    if(Object.keys(next).every(k=>next[k as keyof RouterState]===this.state[k as keyof RouterState]))return;
    this.state=next;this.listeners.forEach(fn=>fn());
  }
  connect(){
    this.releases=[this.sessions.subscribe(this.refresh),this.parent.subscribe(this.refresh),this.runtime.subscribe(this.refresh),this.runtime.observeCommands(this.command)];this.refresh();
    return()=>{this.disposed=true;this.releases.forEach(fn=>fn());this.progress.dispose();};
  }
  private async load(id:string){
    if(this.loading.has(id))return this.loading.get(id);
    const task=(async()=>{try{const r=await this.progress.load(id);if(!this.disposed)this.records.set(id,r);}catch{this.readFailed.add(id);this.publish({storageError:true});}finally{this.loading.delete(id);if(!this.disposed){this.publish({record:this.records.get(id)??null,loadedDraft:id});this.refresh();}}})();
    this.loading.set(id,task);return task;
  }
  private async save(record:RouterProgress){
    if(this.failed.has(record.draftId))return false;this.pending++;this.publish({saving:true});
    try{await this.progress.save(record);return !this.disposed;}catch{this.failed.add(record.draftId);this.publish({storageError:true});return false;}finally{this.pending--;this.publish({saving:this.pending>0});}
  }
  private update(patch:Partial<RouterProgress>){
    const old=this.state.record;if(!old)return;
    const record={...old,...patch};if(JSON.stringify(old)===JSON.stringify(record))return;
    this.records.set(record.draftId,record);this.publish({record});void this.save(record);this.refresh();
  }
  async flushProgress(){await Promise.all(this.loading.values());await this.progress.flush();}
  async retryProgress(){const id=this.runtime.activeDraftId();if(!id)return;if(this.readFailed.delete(id)){this.records.delete(id);await this.load(id);}this.failed.delete(id);this.publish({storageError:false});const r=this.records.get(id);if(r)await this.save(r);this.refresh();}
  async begin(direct=false){
    if(this.state.busy||this.sessions.hasPendingOperations())return;
    if(this.runtime.pendingForms()){this.publish({warning:'forms'});return;}
    const previous=this.parent.getState();
    const origin=this.runtime.network(),originId=this.runtime.activeDraftId();
    if(!direct&&(!previous.active||!previous.passed||previous.record?.step!==5)){this.publish({warning:'network'});return;}
    this.publish({busy:true,warning:null});
    try{
      if(!direct){await this.parent.flushProgress();if(this.parent.getState().storageError||!this.parent.getState().passed||this.runtime.network()!==origin||this.runtime.activeDraftId()!==originId)return;}
      let id=this.runtime.activeDraftId();
      if(direct){const document=routerDirectDocument();const result=await(this.runtime.openAttempt?.(document)??this.sessions.openDocument(document));if(!result.ok){this.publish({storageError:true});return;}id=result.value;this.runtime.started?.(id);}
      if(!id||id!==this.sessions.getState().activeDraftId||this.runtime.pendingForms())return;
      if(!this.records.has(id))await this.load(id);if(this.readFailed.has(id))return;
      let r=this.records.get(id);
      if(!r){
        const pcC=direct?DIRECT_C:previous.record!.pcC, error=routerPreparationError(this.runtime.network(),pcC);
        if(error){this.publish({warning:error});return;}
        await this.runtime.checkpoint?.before(id);
        r={schemaVersion:2,chapterId:'two-networks',chapterVersion:2,draftId:id,pcC,source:direct?'direct':'continue',prepared:false,step:1,completed:[],replies:{a:null,f:null},diagnosis:{failure:false,reply:null}};
        this.records.set(id,r);this.publish({record:r});if(!await this.save(r))return;
      }
      await this.prepare(r);
    }catch{this.publish({storageError:true});}finally{this.publish({busy:false});this.refresh();}
  }
  async prepare(record=this.state.record){
    if(!record||record.prepared||this.runtime.pendingForms()||this.state.storageError||this.failed.has(record.draftId))return;
    const net=this.runtime.network(),id=record.draftId;
    if(id!==this.runtime.activeDraftId()||this.sessions.hasPendingOperations())return;
    this.attempted.add(net);
    const some=Object.values(ROUTER_IDS).some(key=>net.devices.has(key));
    const error=some?initialRouterGroup(net,!!record.legacy)?null:'conflict':this.runtime.insert(record.pcC);
    if(error){this.publish({warning:error});return;}
    const prepared={...record,prepared:true};this.records.set(id,prepared);this.publish({record:prepared});
    try{await this.runtime.checkpoint?.prepared(id,prepared as unknown as MetaValue);await this.save(prepared);}catch{this.publish({storageError:true});}this.refresh();
  }
  previous(){const r=this.state.record;if(!r||!this.state.active||r.step===1||this.state.busy)return;this.candidate=undefined;this.publish({repeatError:false});this.update({step:r.step-1});}
  next(){const r=this.state.record;if(!r||!this.state.active||!this.state.passed||this.state.busy||r.step===8||this.state.storageError)return;this.candidate=undefined;this.publish({repeatError:false});this.update({step:r.step+1});}
  repeatTicket():RouterRepeatTicket|null {
    const r=this.state.record;this.publish({repeatError:false});
    return r&&this.state.active&&this.state.passed&&!this.state.busy&&!this.state.saving&&!this.state.storageError&&!this.sessions.hasPendingOperations()&&(r.step===5||r.step===6)&&!this.runtime.pendingForms()?{draftId:r.draftId,step:r.step,network:this.runtime.network(),signature:routerSignature(this.runtime.network())}:null;
  }
  repeatTask(ticket:RouterRepeatTicket) {
    const r=this.state.record;
    if(!r||!this.state.active||this.state.busy||this.state.saving||this.state.storageError||r.draftId!==ticket.draftId||r.step!==ticket.step||this.runtime.network()!==ticket.network||this.runtime.pendingForms()||this.sessions.hasPendingOperations()||routerSignature(this.runtime.network())!==ticket.signature||!this.runtime.repeat){this.publish({repeatError:true});return;}
    const error=this.runtime.repeat(ticket.step,ticket.signature,r.pcC);this.publish({repeatError:!!error});this.refresh();
  }
  private async restore(r:RouterProgress,net:Network,current:string){
    if(this.restoring)return;this.restoring=true;
    try{const hash=await tutorialFingerprint(current);if(this.disposed||this.runtime.network()!==net||this.runtime.activeDraftId()!==r.draftId||this.sessions.hasPendingOperations())return;
      this.receipts={a:r.replies.a===hash?current:null,f:r.replies.f===hash?current:null,b:r.diagnosis.reply===hash?current:null};this.validated={net,signature:current};
    }catch{this.publish({storageError:true});this.validated={net,signature:current};this.receipts={a:null,f:null,b:null};}
    finally{this.restoring=false;this.refresh();}
  }
  private refresh=()=>{
    if(this.disposed)return;const id=this.sessions.getState().activeDraftId,net=this.runtime.network();
    if(this.runtime.restarting?.()){this.candidate=undefined;return;}
    if(this.runtime.suspended?.()){this.candidate=undefined;this.publish({active:false});return;}
    if(!id||id!==this.runtime.activeDraftId()||this.sessions.hasPendingOperations()){this.candidate=undefined;this.publish({active:false});return;}
    if(!this.records.has(id)){this.publish({active:false,record:null});if(!this.readFailed.has(id))void this.load(id);return;}
    const r=this.records.get(id)??null;this.publish({record:r});if(!r){this.publish({active:false});return;}
    const current=routerSignature(net);
    if(this.validated?.net!==net||this.validated.signature!==current){this.candidate=undefined;this.publish({active:false});void this.restore(r,net,current);return;}
    if(this.restoring)return;
    if(!r.prepared){this.publish({active:true,passed:false});if(!this.state.busy&&!this.state.storageError&&!this.attempted.has(net))void this.prepare(r);return;}
    const c=routerConditions(net,r.pcC),warning:RouterWarning|null=this.runtime.pendingForms()?'forms':!c.exists?'missing':r.step>=2&&!c.cables?'cables':r.step>=3&&!c.interfaces?'interfaces':r.step>=4&&!c.hostIp?'hostIp':r.step>=5&&!c.gateways?'gateways':r.step>=6&&!c.defaultRoute?'defaultRoute':r.step===8&&!c.bReady?'pcB':null;
    if(this.candidate&&(this.candidate.signature!==current||this.runtime.pendingForms()))this.candidate=undefined;
    const replies={a:this.receipts.a===current,f:this.receipts.f===current,b:this.receipts.b===current};
    const passed=!warning&&(r.step<7||r.step===7&&replies.a&&replies.f||r.step===8&&replies.b);
    this.publish({active:true,passed,warning,replies:replies.a===this.state.replies.a&&replies.f===this.state.replies.f&&replies.b===this.state.replies.b?this.state.replies:replies});
    if(passed&&!r.completed.includes(r.step))this.update({completed:[...r.completed,r.step].sort((a,b)=>a-b)});
  };
  private command=(event:TerminalCommandEvent)=>{
    this.refresh();const r=this.state.record,command=event.command,net=this.runtime.network();
    if(!this.state.active||this.state.warning||!r||r.step<7||this.sessions.hasPendingOperations()||command.network!==net||!['keyboard','quick-ping'].includes(command.source))return;
    if(event.type==='started'){
      const target=/^ping(?:\s+-(?:c|n)\s+[1-9]\d*)?\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(command.line.trim())?.[1],fIp=routerTarget(net);
      const key=r.step===7?command.deviceId===FIRST_DEVICES.a&&target===fIp?'a':command.deviceId===ROUTER_IDS.f&&target==='192.168.10.10'?'f':null:command.deviceId===FIRST_DEVICES.b&&target===fIp?'b':null;
      const b=net.devices.get(FIRST_DEVICES.b);
      const kind=key==='b'&&b instanceof IpDevice&&b.lookupRoute(parseIp(target!)!)===null?'failure':'reply';
      if(key)this.candidate={command,signature:routerSignature(net),target:target!,key,kind,output:'',proved:false};return;
    }
    const candidate=this.candidate;if(!candidate||candidate.command.id!==command.id||candidate.signature!==routerSignature(net))return;
    if(event.type==='finished'){
      this.candidate=undefined;
      const b=net.devices.get(FIRST_DEVICES.b);
      if(candidate.kind==='failure'&&event.reason==='completed'&&/(?:^|\n)ping: connect: Network is unreachable\r?(?:\n|$)/.test(candidate.output)&&b instanceof IpDevice&&b.lookupRoute(parseIp(candidate.target)!)===null)this.update({diagnosis:{...r.diagnosis,failure:true}});
      return;
    }
    candidate.output=(candidate.output+event.text).slice(-4096);
    const replied=candidate.output.split(/\r?\n/).some(line=>{const m=/^(?:64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=\d+ ttl=\d+ time=[\d.]+ ms|Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+)$/.exec(line);return(m?.[1]??m?.[2])===candidate.target;});
    if(!replied||candidate.proved||candidate.kind==='failure')return;candidate.proved=true;
    void tutorialFingerprint(candidate.signature).then(hash=>{if(this.disposed||!this.state.active||this.state.record?.draftId!==r.draftId||this.runtime.network()!==net||routerSignature(net)!==candidate.signature||this.runtime.pendingForms())return;
      this.receipts[candidate.key]=candidate.signature;
      this.update(candidate.key==='b'?{diagnosis:{...this.state.record.diagnosis,reply:hash}}:{replies:{...this.state.record.replies,[candidate.key]:hash}});
    }).catch(()=>this.publish({storageError:true}));
  };
}
