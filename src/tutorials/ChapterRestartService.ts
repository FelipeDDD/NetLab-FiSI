import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import type { MetaMutation, MetaRecord, MetaValue, ProjectDocument } from '../projects/types';
import { useStore } from '../store';
import { CHAPTERS, chapterRestartDocument, checkpointKey, progressKey, readChapterCheckpoint, same, validateProgress, type ChapterCheckpoint, type ChapterId } from './chapterCheckpoints';
import type { TopologyHistory } from '../topologyHistory';
import { recordOperation } from '../topologyHistory';
import {prepareTopologyDocument} from '../persistence/topologyDocument';
import {disposeNetwork} from '../engine/networkLifecycle';
import {chapterOneSignature,correctedSubnet,subnetPeers} from './subnetChapter';
import {routerConditions} from './routerChapter';
import {tutorialFingerprint} from './tutorialProgress';
import {hasPendingForms} from '../persistence/pendingForms';

export interface RestartTicket {draftId:string;chapter:ChapterId;document:ProjectDocument;checkpoint:MetaRecord;progress:MetaRecord;guards:{key:string;expectedRevision:number|null}[]}
type HistoryEntry={draftId:string;chapter:ChapterId;before:ProjectDocument;after:ProjectDocument;beforeProgress:MetaValue;afterProgress:MetaValue;checkpoint:MetaValue};
export class ChapterRestartService {
  private state={busy:false,generation:0,error:false};
  private listeners=new Set<()=>void>();
  private history=new Map<string,HistoryEntry>();
  flushControllers:()=>Promise<void>=async()=>{};
  constructor(private repository:Pick<ProjectRepository,'getMeta'|'setMeta'>,private sessions:SessionController){}
  getState=()=>this.state;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private publish(patch:Partial<typeof this.state>){this.state={...this.state,...patch};this.listeners.forEach(f=>f());}
  resume(){if(this.state.busy)this.publish({busy:false});}
  private active(id:string){if(this.sessions.getState().activeDraftId!==id||useStore.getState().workspaceIdentity?.draftId!==id)throw Error('checkpoint-conflict');}
  private async meta(key:string){const r=await this.repository.getMeta(key);if(!r.ok)throw Error(r.error.code);return r.value;}
  async before(chapter:ChapterId,id:string){
    this.active(id);const before=useStore.getState().captureWorkspaceDocument(),key=checkpointKey(id,chapter);
    const flushed=await this.sessions.flush();if(!flushed.ok)throw Error(flushed.error.code);
    if(await this.meta(key))throw Error('checkpoint-conflict');
    this.active(id);if(!same(before,useStore.getState().captureWorkspaceDocument()))throw Error('checkpoint-conflict');
    const c:ChapterCheckpoint={schemaVersion:1,kind:'chapter-checkpoint',draftId:id,chapter,attemptId:crypto.randomUUID(),before,initial:null,progress:null};
    const result=await this.repository.setMeta({key,expectedRevision:null,value:c as unknown as MetaValue});if(!result.ok)throw Error(result.error.code);
    this.active(id);if(!same(before,useStore.getState().captureWorkspaceDocument()))throw Error('checkpoint-conflict');
  }
  async prepared(chapter:ChapterId,id:string,value:MetaValue){
    // Capture synchronously at the insertion boundary, before awaiting storage.
    this.active(id);const initial=useStore.getState().captureWorkspaceDocument(),key=checkpointKey(id,chapter),record=await this.meta(key);
    if(!record)return; // Legacy attempts never acquire a retroactive baseline.
    const c=readChapterCheckpoint(record.value,id,chapter);if(c.initial)return;
    const progress=validateProgress(chapter,chapter==='two-networks'?{...(value as object),completed:[1]}:value,id),flushed=await this.sessions.flush(id);if(!flushed.ok)throw Error(flushed.error.code);
    const ready={...c,initial:chapter==='first-connection'?c.before:initial,progress};readChapterCheckpoint(ready,id,chapter);
    const result=await this.repository.setMeta({key,expectedRevision:record.revision,value:ready as unknown as MetaValue});if(!result.ok)throw Error(result.error.code);
  }
  async inspect(chapter:ChapterId):Promise<RestartTicket>{
    if(this.state.busy||this.sessions.hasPendingOperations()||hasPendingForms())throw Error('checkpoint-conflict');
    const draftId=this.sessions.getState().activeDraftId;if(!draftId)throw Error('checkpoint-missing');this.active(draftId);
    await this.flushControllers();const flushed=await this.sessions.flush();if(!flushed.ok)throw Error(flushed.error.code);
    const document=useStore.getState().captureWorkspaceDocument(),records=await Promise.all(CHAPTERS.map(c=>this.meta(progressKey(draftId,c))));
    const checkpoint=await this.meta(checkpointKey(draftId,chapter)),progress=records[CHAPTERS.indexOf(chapter)];
    this.active(draftId);if(!same(document,useStore.getState().captureWorkspaceDocument()))throw Error('checkpoint-conflict');
    if(!checkpoint||!progress)throw Error('checkpoint-missing');
    if(records.slice(CHAPTERS.indexOf(chapter)+1).some(Boolean))throw Error('checkpoint-later');
    const planned=chapterRestartDocument(readChapterCheckpoint(checkpoint.value,draftId,chapter),document,progress.value);
    await this.checkPlan(chapter,planned,progress.value);
    return {draftId,chapter,document,checkpoint,progress,guards:CHAPTERS.map((c,i)=>({key:progressKey(draftId,c),expectedRevision:records[i]?.revision??null}))};
  }
  async restart(ticket:RestartTicket){
    if(this.state.busy)return false;this.publish({busy:true,error:false});
    try{
      await this.flushControllers();const c=readChapterCheckpoint(ticket.checkpoint.value,ticket.draftId,ticket.chapter);
      const after=chapterRestartDocument(c,ticket.document,ticket.progress.value),id=crypto.randomUUID(),history=useStore.getState().topologyHistory;
      await this.checkPlan(ticket.chapter,after,ticket.progress.value);
      await this.commit(ticket.draftId,ticket.document,after,[{key:ticket.progress.key,expectedRevision:ticket.progress.revision,value:c.progress!},{key:ticket.checkpoint.key,expectedRevision:ticket.checkpoint.revision,value:ticket.checkpoint.value}],ticket.guards);
      this.history.set(id,{draftId:ticket.draftId,chapter:ticket.chapter,before:ticket.document,after,beforeProgress:ticket.progress.value,afterProgress:c.progress!,checkpoint:ticket.checkpoint.value});
      const next=recordOperation(history,{type:'chapter-restore',label:'Kapitel neu starten',id});useStore.getState().installChapterHistory(next);
      const retained=new Set([...next.past,...next.future].flatMap(op=>op.type==='chapter-restore'?[op.id]:[]));for(const key of this.history.keys())if(!retained.has(key))this.history.delete(key);
      this.publish({generation:this.state.generation+1});return true;
    }catch{this.publish({busy:false,error:true});return false;}
  }
  async navigate(id:string,direction:'undo'|'redo'){
    if(this.state.busy)return;const item=this.history.get(id),history=useStore.getState().topologyHistory;
    const stack=direction==='undo'?history.past:history.future,op=stack.at(-1);
    if(!item||op?.type!=='chapter-restore'||op.id!==id){this.publish({error:true});return;}
    this.publish({busy:true,error:false});
    try{
      await this.flushControllers();this.active(item.draftId);
      const key=progressKey(item.draftId,item.chapter),progress=await this.meta(key),cp=await this.meta(checkpointKey(item.draftId,item.chapter));
      if(!progress||!cp||!same(cp.value,item.checkpoint)||!same(progress.value,direction==='undo'?item.afterProgress:item.beforeProgress))throw Error('checkpoint-conflict');
      const expected=direction==='undo'?item.after:item.before,document=direction==='undo'?item.before:item.after;
      const guards=await Promise.all(CHAPTERS.filter(c=>c!==item.chapter).map(async c=>{const record=await this.meta(progressKey(item.draftId,c));if(CHAPTERS.indexOf(c)>CHAPTERS.indexOf(item.chapter)&&record)throw Error('checkpoint-later');return {key:progressKey(item.draftId,c),expectedRevision:record?.revision??null};}));
      await this.commit(item.draftId,expected,document,[{key,expectedRevision:progress.revision,value:direction==='undo'?item.beforeProgress:item.afterProgress},{key:cp.key,expectedRevision:cp.revision,value:cp.value}],guards);
      const next:TopologyHistory=direction==='undo'?{past:history.past.slice(0,-1),future:[...history.future,op]}:{past:[...history.past,op],future:history.future.slice(0,-1)};
      useStore.getState().installChapterHistory(next);this.publish({generation:this.state.generation+1});
    }catch{this.publish({busy:false,error:true});}
  }
  private async commit(draftId:string,expected:ProjectDocument,document:ProjectDocument,control:MetaMutation[],guards:{key:string;expectedRevision:number|null}[]){
    const result=await this.sessions.commitDocument({draftId,expected,document,control,guards});if(!result.ok)throw Error(result.error.code);
  }
  private async checkPlan(chapter:ChapterId,document:ProjectDocument,progress:MetaValue){
    if(chapter==='first-connection')return;
    const prepared=prepareTopologyDocument(document.topology),p=progress as unknown as {pcC:string;baseFingerprint:string};
    try{
      if(chapter==='subnet-mask'&&await tutorialFingerprint(chapterOneSignature(prepared.network))!==p.baseFingerprint)throw Error('checkpoint-conflict');
      if(chapter==='two-networks'&&(!subnetPeers(prepared.network,p.pcC)||!correctedSubnet(prepared.network,p.pcC)||!routerConditions(prepared.network,p.pcC).exists))throw Error('checkpoint-conflict');
    }finally{disposeNetwork(prepared.network);}
  }
}
