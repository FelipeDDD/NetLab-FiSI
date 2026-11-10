import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { sim } from '../sim';
import { disposeNetwork } from '../engine/networkLifecycle';
import { createDevice } from '../engine/factory';
import { Host, IpDevice } from '../engine/ipdevice';
import { serializeNetwork } from '../engine/serialize';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { observeNetworkActivity } from '../networkObservations';
import type { MetaRecord, MetaValue, ProjectDocument } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import type { SessionControllerState } from '../persistence/sessionTypes';
import type { SessionController, OpenDocumentOptions } from '../persistence/sessionController';
import { lpmPcValid } from './alternativeLpm';
import { recordOperation } from '../topologyHistory';
import { canNameLanC } from './lanCPresentation';
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import { AlternativePathsController } from './AlternativePathsController';
import { AlternativePathsProgressStore, ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress, emptyNeighborProofs } from './alternativePathsProgress';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, NEIGHBOR_TESTS, TRANSIT_PLAN, alternativePathsDocument, failureBaselineSignature, neighborSignature, alternativeConditions } from './alternativePathsChapter';
import { tutorialFingerprint } from './tutorialProgress';
import { alternativePathsCompletion, alternativePart4Complete } from './completion';
import { chapterRestartDocument, readChapterCheckpoint } from './chapterCheckpoints';
import { emptyLpm } from './alternativeLpm';
import type { HostCreationMode } from '../hostOs';
import { loadTutorialMenuProgress } from './menuProgress';
import { ALTERNATIVE_CURRENT_KEY } from './alternativeLearning';
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
vi.setConfig({ testTimeout: 15000 });
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });
function fixture(automaticStorm = false) {
  const meta = new Map<string, MetaRecord>(), docs = new Map<string, ProjectDocument>(), events = new Set<(event: TerminalCommandEvent) => void>(), listeners = new Set<() => void>();
  let id = 'personal', sequence = 0, forms = false, pending = false, fail = false, failReceipt = false, failLpm: 'preparing' | 'ready' | null = null;
  let stormFailure: 'before' | 'after' | null = null, recoveryRequired = false, stormCommits = 0;
  let nextFlush: (() => void) | undefined;
  let entryFailure: 'before'|'after'|null=null;
  useStore.getState().importJson(JSON.stringify(alternativePathsDocument().topology)); docs.set(id, useStore.getState().captureWorkspaceDocument());
  const notify = () => listeners.forEach(fn => fn());
  const sessions = {
    getState: (): SessionControllerState => ({ phase: 'ready', session: null, activeDraftId: id, error: null, pendingShare: false, drafts: [...docs.keys()].map(key => ({ id: key, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null })) }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, hasPendingOperations: () => pending,
    flush: async () => { if(recoveryRequired)return {ok:false as const,error:{code:'runtime-changed' as const,message:'Reload committed state.'}};const action=nextFlush;nextFlush=undefined;action?.();docs.set(id, useStore.getState().captureWorkspaceDocument()); return { ok: true as const, value: undefined }; },
    commitDocument: async (input: Parameters<SessionController['commitDocument']>[0]) => {
      stormCommits++;
      if(stormFailure==='before')return {ok:false as const,error:{code:'quota-exceeded' as const,message:'Quota'}};
      if(id!==input.draftId||JSON.stringify(input.expected)!==JSON.stringify(useStore.getState().captureWorkspaceDocument()))return {ok:false as const,error:{code:'runtime-changed' as const,message:'Changed'}};
      for(const m of input.control)if((meta.get(m.key)?.revision??null)!==m.expectedRevision)throw Error('CAS mismatch');
      for(const m of input.control)meta.set(m.key,{key:m.key,revision:(m.expectedRevision??0)+1,value:structuredClone(m.value)});
      docs.set(id,structuredClone(input.document));
      if(stormFailure==='after'){recoveryRequired=true;return {ok:false as const,error:{code:'runtime-changed' as const,message:'Committed; reload'}};}
      useStore.getState().importJson(JSON.stringify(input.document.topology));notify();
      return {ok:true as const,value:undefined};
    },
    openDocument: async (document: ProjectDocument, options?: OpenDocumentOptions) => {
      await sessions.flush(); const init=options?.initialization;
      if(init&&entryFailure==='before')return {ok:false as const,error:{code:'quota-exceeded' as const,message:'Quota'}};
      const nextId=init?.id??'alternative-'+docs.size;
      if(init){for(const control of init.control)expect(meta.get(control.key)?.revision??null).toBe(control.expectedRevision);for(const control of init.control)meta.set(control.key,{key:control.key,revision:(control.expectedRevision??0)+1,value:structuredClone(control.value)});}
      docs.set(nextId,structuredClone(document));
      if(init&&entryFailure==='after')return {ok:false as const,error:{code:'runtime-changed' as const,message:'Committed; reopen the complete attempt'}};
      pending=true;id=nextId;useStore.getState().importJson(JSON.stringify(document.topology));pending=false;notify();return {ok:true as const,value:id};
    },
  };
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async m => { if (fail || failLpm && (m.value as { lpm?: { stage: string } }).lpm?.stage === failLpm || failReceipt && (m.value as { stage?: string }).stage === 'lans') return { ok: false, error: { code: 'quota-exceeded', message: 'Quota' } };
      const current = meta.get(m.key); if ((current?.revision ?? null) !== m.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: m.key, expectedRevision: m.expectedRevision, current: current ?? null, message: 'Conflict' } };
      const record = { key: m.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, record); return { ok: true, value: record };
    },
  };
  const make = () => new AlternativePathsController(sessions, { network: () => sim.net, activeDraftId: () => id, pendingForms: () => forms, subscribe: fn => useStore.subscribe(fn), observeCommands: fn => { events.add(fn); return () => { events.delete(fn); }; }, observeActivity: observeNetworkActivity, insert: () => useStore.getState().addAlternativeRoutingPCs(), prepareLpm: () => useStore.getState().setInterfaceIpv4(I.r3, 'eth3', { mode: 'static', ip: parseCidr('192.168.30.129/25'), gateway: null, dns: null }) ? 'lpmPort' : null,
    captureDocument:()=>useStore.getState().captureWorkspaceDocument(),stormHistory:changed=>{const history=useStore.getState().topologyHistory;return()=>useStore.getState().installChapterHistory(changed?recordOperation(history,{type:'set-iface-state',label:'Storm',deviceId:I.r2,ifaceName:'eth1',before:true,after:false}):history);},
    nameLanC:pc=>{if(canNameLanC(sim.net,useStore.getState().topologyHistory,pc))useStore.getState().renameDevice(pc.id,'PC C');}
  }, new AlternativePathsProgressStore(repository, sessions));
  let controller = make(), release = controller.connect();
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 0)); await controller.flushProgress(); } };
  const command = (deviceId: string, line: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => {
    const context = { id: ++sequence, network: sim.net, deviceId, line, source }; let out = '';
    events.forEach(fn => fn({ type: 'started', command: context }));
    const running = new Shell(sim.net.devices.get(deviceId) as IpDevice).exec(line, { write: text => { out += text; events.forEach(fn => fn({ type: 'output', command: context, text })); } }, () => events.forEach(fn => fn({ type: 'finished', command: context, reason: 'completed' })));
    useStore.getState().refresh(); return { running, output: () => out };
  };
  const ping = async (from: string, target: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => { const d = sim.net.devices.get(from), windows = d instanceof Host && d.os === 'windows'; const out = command(from, windows ? `ping -n 1 ${target}` : `ping ${target} -c 1`, source); sim.net.scheduler.advanceTo(sim.net.now + 6000); await settle(); return out.output(); };
  const exec = async (deviceId: string, line: string) => { expect(command(deviceId, line).output(), line).toBe(''); await settle(); };
  const route = (router: string, network: string, hop: string) => exec(router, `ip route replace ${network} via ${hop}`);
  const config = async (deviceId: string, name: string, address: string, gateway: string | null = null) => { expect(useStore.getState().setInterfaceIpv4(deviceId, name, { mode: 'static', ip: parseCidr(address), gateway: gateway ? parseIp(gateway) : null, dns: null })).toBeNull(); await settle(); };
  const triangle = async (start = true) => {
    if (start) await controller.begin(); await settle();
    if(start&&!automaticStorm){const key=ALTERNATIVE_PROGRESS_PREFIX+id,entry=meta.get(key)!;meta.set(key,{...entry,value:{...(entry.value as object),storm:'legacy'}});release();controller=make();release=controller.connect();await settle();}
    for (let index = 0; index < 3; index++) {
      for (const row of TRANSIT_PLAN.slice(index * 2, index * 2 + 2)) { expect(command(row.device, `ip address add ${row.address} dev ${row.iface}`).output()).toBe(''); await settle(); }
      expect(controller.getState().passed).toBe(false);
      for (const test of NEIGHBOR_TESTS.slice(index * 2, index * 2 + 2)) expect(await ping(test.from, test.target)).toContain('64 bytes from');
      expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    }
    controller.answer('remote', '23'); await settle();
  };
  const lans = async () => {
    await triangle(); await controller.next(); await settle();
    await config(I.r1, 'eth2', '192.168.10.1/24'); await config(I.a, 'eth0', '192.168.10.10/24', '192.168.10.1'); await controller.next(); await settle();
    await config(I.r3, 'eth2', '192.168.20.1/24'); await config(I.b, 'eth0', '192.168.20.20/24', '192.168.20.1'); await controller.next(); await settle();
  };
  const finishLpm = async (beforeStorm?: () => void, mode: HostCreationMode = 'linux') => {
    expect(controller.getState().record?.step).toBe(14);
    await settle();
    useStore.getState().setHostCreationMode(mode);
    const random = mode === 'mixed' ? vi.spyOn(Math, 'random').mockReturnValue(0.9) : null;
    try { useStore.getState().addDeviceAt('host', { x: 1780, y: 900 }); } finally { random?.mockRestore(); }
    const pc = useStore.getState().nodes.at(-1)!.id;
    useStore.getState().onConnect({ source: pc, target: I.r3, sourceHandle: 'eth0', targetHandle: 'eth3' }); await settle();
    await config(pc, 'eth0', '192.168.30.130/25', '192.168.30.129');
    expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    const windows = (sim.net.devices.get(pc) as Host).os === 'windows';
    expect(await ping(pc, '192.168.30.129')).toContain(windows ? 'Reply from' : '64 bytes from'); await controller.next(); await settle();
    await route(I.r2, '192.168.30.128/25', '10.0.23.2');
    expect(controller.getState().passed).toBe(false); expect(await ping(I.r2, '192.168.30.130')).toContain('64 bytes from');
    expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r1, '192.168.30.0/24', '10.0.12.2');
    expect(await ping(I.a, '192.168.30.130')).toContain('64 bytes from'); await controller.next(); await settle();
    await route(I.r1, '192.168.30.128/25', '10.0.13.2');
    expect(controller.getState().passed).toBe(false); expect(await ping(I.a, '192.168.30.130')).toContain('64 bytes from');
    await controller.next(); await settle(); expect(controller.getState().lpmObserved).toBe(true);
    controller.answer('lpm', 'specific'); await settle(); expect(controller.getState().passed).toBe(true); beforeStorm?.(); await controller.next(); await settle();
    return pc;
  };
  const routingTasks = async (beforeEntry?: () => void) => {
    await ping(I.a, '192.168.20.20'); expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r1, '192.168.20.0/24', '10.0.12.2'); await controller.next(); await settle();
    await route(I.r2, '192.168.20.0/24', '10.0.23.2'); await controller.next(); await settle();
    await ping(I.a, '192.168.20.20'); expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r3, '192.168.10.0/24', '10.0.23.1'); await controller.next(); await settle(); await route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(await ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(controller.getState().passed).toBe(true);
    await controller.next(); await settle(); beforeEntry?.(); await settle(); controller.answer('hop', 'r2'); await settle(); await controller.next(); await settle();
  };
  const toLpm = async (beforeEntry?: () => void) => { await lans(); await routingTasks(beforeEntry); };
  const via = async () => { await toLpm(); await finishLpm(); };
  const recovery = async () => {
    await via(); expect(controller.getState().record?.step).toBe(20);
    expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(false);
    expect(await ping(I.a, '192.168.20.20')).not.toContain('64 bytes from'); expect(controller.getState().passed).toBe(true);
    await controller.next(); await settle(); expect(controller.getState().record?.step).toBe(21);
  };
  const replayLpm = async () => {
    while (controller.getState().record!.step < 17) { expect(controller.getState().passed).toBe(true); await controller.next(); await settle(); }
    command(I.r1, 'ip route del 192.168.30.128/25'); await settle();
    await ping(I.a, '192.168.30.130'); expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r1, '192.168.30.128/25', '10.0.13.2'); await ping(I.a, '192.168.30.130'); await controller.next(); await settle();
    controller.answer('lpm','specific'); await settle(); await controller.next(); await settle();
    expect(controller.getState().record?.step).toBe(20);
  };
  return { get controller() { return controller; }, get id() { return id; }, get stormCommits(){return stormCommits;}, failEntry(value:typeof entryFailure){entryFailure=value;}, failStorm(value: typeof stormFailure){stormFailure=value;}, beforeNextFlush(action:()=>void){nextFlush=action;}, docs, meta, repository, settle, command, exec, ping, route, config, triangle, lans, via, toLpm, routingTasks, finishLpm, replayLpm, recovery,
    forgedReply(deviceId: string, target: string) { const command = { id: ++sequence, network: sim.net, deviceId, line: `ping -c 1 ${target}`, source: 'keyboard' as const }; events.forEach(fn => fn({ type: 'started', command })); events.forEach(fn => fn({ type: 'output', command, text: `64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.0 ms\n` })); events.forEach(fn => fn({ type: 'finished', command, reason: 'completed' })); },
    forms(value: boolean) { forms = value; useStore.getState().refresh(); }, fail(value: boolean) { fail = value; }, failReceipt(value: boolean) { failReceipt = value; }, failLpm(value: typeof failLpm) { failLpm = value; },
    async switchTo(next: string) { await settle(); await sessions.flush(); id = next; useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); notify(); await settle(); },
    async reload() { await settle(); await sessions.flush(); release(); recoveryRequired=false;useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); controller = make(); release = controller.connect(); await settle(); }, dispose() { release(); },
  };
}
it.each(['replace','del-add'] as const)('completes only Part 4 with real failure and bidirectional direct replies using %s',async method=>{
  const f=fixture(true);try{
    const personal=structuredClone(f.docs.get('personal'));
    await f.controller.begin('part-4');await f.settle();const id=f.id;
    expect(f.controller.getState().record).toMatchObject({step:20,completed:[],storm:'applied',failure:null,viaBaseline:null,entry:{point:'part-4'}});
    expect(f.stormCommits).toBe(1);expect(sim.net.links.get(L.right)!.operational).toBe(false);
    await f.reload();expect(f.stormCommits).toBe(1);f.controller.previous();await f.settle();expect(f.controller.getState().record!.step).toBe(20);
    expect(f.controller.getState().canAdvance).toBe(false);
    await f.ping(I.a,'192.168.20.20','api');expect(f.controller.getState().passed).toBe(false);
    expect(await f.ping(I.a,'192.168.20.20','quick-ping')).not.toContain('64 bytes from');expect(f.controller.getState().passed).toBe(true);
    await f.controller.next();await f.settle();expect(f.controller.getState().record!.step).toBe(21);
    // Reachability of just PC B cannot replace coverage of the complete LAN.
    await f.route(I.r1,'192.168.20.20/32','10.0.13.2');await f.route(I.r3,'192.168.10.0/24','10.0.13.1');
    expect(await f.ping(I.a,'192.168.20.20')).toContain('64 bytes from');expect(f.controller.getState().passed).toBe(false);
    await f.exec(I.r1,'ip route del 192.168.20.20/32');
    if(method==='replace')await f.route(I.r1,'192.168.20.0/24','10.0.13.2');else{
      await f.exec(I.r1,'ip route del 192.168.20.0/24');await f.exec(I.r1,'ip route add 192.168.20.0/24 via 10.0.13.2');
      await f.exec(I.r3,'ip route del 192.168.10.0/24');await f.exec(I.r3,'ip route add 192.168.10.0/24 via 10.0.13.1');
    }
    expect(f.controller.getState().passed).toBe(true);await f.controller.next();await f.settle();expect(f.controller.getState().record!.step).toBe(22);
    f.forgedReply(I.a,'192.168.20.20');await f.settle();await f.ping(I.a,'192.168.20.20','api');expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.b,'192.168.10.10','quick-ping');await f.settle();
    const p=f.controller.getState().record!;expect(p).toMatchObject({completed:[20,21,22],viaReplies:{ab:null,ba:null},hopUnderstood:false,lpmUnderstood:false,lpm:{localReply:null,experiment:{r2:null,broad:null,specific:null}}});
    expect(alternativePart4Complete(p)).toBe(true);expect(alternativePart4Complete({...p,completed:[20,22]})).toBe(false);expect(alternativePart4Complete({...p,directReplies:{ab:p.directReplies.ab,ba:null}})).toBe(false);
    expect(alternativePathsCompletion(p)).toEqual({completed:3,total:22,complete:false});
    await f.reload();expect(alternativePart4Complete(f.controller.getState().record!)).toBe(true);expect(f.stormCommits).toBe(1);
    await f.switchTo('personal');expect(f.docs.get('personal')).toEqual(personal);await f.switchTo(id);expect(f.controller.getState().record!.completed).toEqual([20,21,22]);
  }finally{f.dispose();}
});
it.each(['before','after'] as const)('recovers a Part 4 incident interrupted %s its atomic commit without inventing proof',async when=>{
  const f=fixture(true);try{
    f.failStorm(when);await f.controller.begin('part-4');await f.settle();const key=ALTERNATIVE_PROGRESS_PREFIX+f.id;
    expect(f.controller.getState().storageError).toBe(true);expect(f.controller.getState().record!.failure).toBeNull();
    const committed=readAlternativeProgress(f.meta.get(key)!.value,f.id);
    expect(committed.storm).toBe(when==='before'?'pending':'applied');expect(committed.completed).toEqual([]);
    expect(f.docs.get(f.id)!.topology.devices.find(d=>d.id===I.r2)!.ifaces[1].up).toBe(when==='before');
    f.failStorm(null);await f.reload();expect(f.controller.getState().storageError).toBe(false);expect(f.controller.getState().record!.storm).toBe('applied');
    expect(sim.net.links.get(L.right)!.operational).toBe(false);expect(f.controller.getState().passed).toBe(false);
    const count=f.stormCommits;await f.reload();expect(f.stormCommits).toBe(count);expect(f.controller.getState().record!.completed).toEqual([]);
  }finally{f.dispose();}
});
it('does not reapply a consumed Part 4 incident after Undo, Redo or reload, or replace a damaged supplied PC C',async()=>{
  const f=fixture(true);try{
    await f.controller.begin('part-4');await f.settle();const pc=structuredClone(f.controller.getState().record!.lpm.pc!);
    useStore.getState().undoTopology();await f.settle();expect(sim.net.links.get(L.right)!.operational).toBe(true);expect(f.stormCommits).toBe(1);
    useStore.getState().redoTopology();await f.settle();expect(sim.net.links.get(L.right)!.operational).toBe(false);expect(f.stormCommits).toBe(1);
    useStore.getState().undoTopology();await f.reload();expect(sim.net.links.get(L.right)!.operational).toBe(true);expect(f.stormCommits).toBe(1);
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().passed).toBe(false);
    useStore.getState().onNodesChange([{type:'remove',id:pc.id}]);await f.settle();useStore.getState().addDeviceAt('host',{x:1780,y:900});await f.reload();
    expect(f.controller.getState().record!.lpm.pc).toEqual(pc);expect(lpmPcValid(sim.net,f.controller.getState().record!.lpm)).toBe(false);
    expect(f.controller.getState().record!.completed).toEqual([]);
  }finally{f.dispose();}
});
it.each([['part-2','linux'],['part-3','linux'],['part-3','windows']] as const)('opens %s, restores after F5 and proves subsequent tasks with a %s PC C without skipped credit',async(point,mode)=>{
  const f=fixture(true);try{
    const personal=structuredClone(f.docs.get('personal'));
    await f.controller.begin(point);await f.settle();const id=f.id;await f.reload();const r=f.controller.getState().record!;
    expect(r).toMatchObject({step:point==='part-2'?7:14,completed:[],entry:{point},hopUnderstood:false,viaReplies:{ab:null,ba:null}});
    f.controller.previous();await f.settle();expect(f.controller.getState().record!.step).toBe(r.entry!.firstTask);
    if(point==='part-2')await f.routingTasks();else{
      expect(await f.ping(I.a,'192.168.20.20')).toContain('64 bytes from');expect(f.controller.getState().record!.viaReplies).toEqual({ab:null,ba:null});
      expect(f.controller.getState().passed).toBe(false);await f.controller.next();await f.settle();expect(f.controller.getState().record!.step).toBe(14);
    }
    const c=await f.finishLpm(undefined,mode);expect((sim.net.devices.get(c) as Host).os).toBe(mode);await f.reload();expect(f.stormCommits).toBe(1);
    const record=f.controller.getState().record!;expect(record.completed.every(n=>n>=r.entry!.firstTask)).toBe(true);
    if(point==='part-3')expect(record).toMatchObject({hopUnderstood:false,investigated:null,returnInvestigated:null,viaReplies:{ab:null,ba:null}});
    await f.ping(I.a,'192.168.20.20');await f.controller.next();await f.settle();await f.route(I.r1,'192.168.20.0/24','10.0.13.2');await f.route(I.r3,'192.168.10.0/24','10.0.13.1');await f.controller.next();await f.settle();
    await f.ping(I.a,'192.168.20.20');await f.ping(I.b,'192.168.10.10');expect(f.controller.getState().passed).toBe(true);
    expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({completed:23-r.entry!.firstTask,total:22,complete:false});
    const saved=structuredClone(f.controller.getState().record!);await f.switchTo('personal');expect(f.docs.get('personal')).toEqual(personal);await f.switchTo(id);await f.reload();expect(f.controller.getState().record).toEqual(saved);
  }finally{f.dispose();}
});
it.each([['beginning','before'],['beginning','after'],['part-2','before'],['part-2','after'],['part-4','before'],['part-4','after']] as const)('keeps %s opening atomic when interrupted %s commit',async(point,phase)=>{
  const f=fixture();try{
    await f.via();const previous=f.id,document=useStore.getState().captureWorkspaceDocument(),record=structuredClone(f.controller.getState().record!),count=f.docs.size;
    const current=structuredClone(f.meta.get(ALTERNATIVE_CURRENT_KEY));
    f.failEntry(phase);await f.controller.begin(point==='beginning'?undefined:point);await f.settle();expect(f.id).toBe(previous);expect(useStore.getState().captureWorkspaceDocument()).toEqual(document);
    expect(f.meta.get(ALTERNATIVE_PROGRESS_PREFIX+previous)!.value).toEqual(record);expect(f.docs.size).toBe(count+(phase==='after'?1:0));
    if(phase==='after'){const id=[...f.docs.keys()].at(-1)!;expect(f.meta.get(ALTERNATIVE_CURRENT_KEY)!.value).toMatchObject({draftId:id});await f.switchTo(id);await f.reload();expect(f.controller.getState().record).toMatchObject({step:point==='beginning'?1:point==='part-2'?7:20,completed:[]});if(point==='beginning')expect(f.controller.getState().record!.entry).toBeUndefined();else expect(f.controller.getState().record!.entry?.point).toBe(point);}
    else expect(f.meta.get(ALTERNATIVE_CURRENT_KEY)).toEqual(current);
  }finally{f.dispose();}
});
it('revalidates supplied prerequisites and recovers interrupted LAN C preparation without synthesizing old proof',async()=>{
  const f=fixture();try{
    f.failLpm('preparing');await f.controller.begin('part-3');await f.settle();expect(f.controller.getState().storageError).toBe(true);
    f.command(I.r2,'ip route del 192.168.20.0/24');await f.settle();f.failLpm(null);await f.reload();
    expect(f.controller.getState().record!.lpm.stage).toBe('unprepared');expect(sim.net.devices.get(I.r3)!.getInterface('eth3')!.ip).toBeNull();
    await f.route(I.r2,'192.168.20.0/24','10.0.23.2');await f.settle();expect(f.controller.getState().record).toMatchObject({completed:[],viaReplies:{ab:null,ba:null},lpm:{stage:'ready'}});
    useStore.getState().setHostCreationMode('windows');useStore.getState().addDeviceAt('host',{x:1800,y:900});const c=useStore.getState().nodes.at(-1)!.id;
    useStore.getState().onConnect({source:c,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();await f.config(c,'eth0','192.168.30.130/25','192.168.30.129');
    const binding=structuredClone(f.controller.getState().record!.lpm.pc);expect(lpmPcValid(sim.net,f.controller.getState().record!.lpm)).toBe(true);
    useStore.getState().onNodesChange([{type:'remove',id:c}]);await f.settle();expect(lpmPcValid(sim.net,f.controller.getState().record!.lpm)).toBe(false);
    useStore.getState().undoTopology();await f.settle();expect(lpmPcValid(sim.net,f.controller.getState().record!.lpm)).toBe(true);
    useStore.getState().redoTopology();await f.settle();useStore.getState().addDeviceAt('host',{x:1800,y:900});await f.reload();
    expect(f.controller.getState().record!.lpm.pc).toEqual(binding);expect(lpmPcValid(sim.net,f.controller.getState().record!.lpm)).toBe(false);
  }finally{f.dispose();}
});
it('reviews saved tasks 13–19 after the storm and F5 without repairing the old path or approving task 20', async () => {
  const f=fixture(true);try {
    await f.via();await f.reload();const before=useStore.getState().captureWorkspaceDocument(),record=structuredClone(f.controller.getState().record!);
    for(let n=19;n>=13;n--)f.controller.previous();await f.settle();
    expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true,warning:'wiring'});
    f.controller.answer('hop','r2');await f.settle();expect(f.controller.getState().answerError).toBe(false);
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().canAdvance).toBe(true);
    f.forms(true);await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(13);f.forms(false);
    await f.reload();expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true});
    for(let n=14;n<=20;n++){await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(n);}
    expect(f.controller.getState()).toMatchObject({historical:false,passed:false,canAdvance:false});await f.controller.next();await f.settle();
    expect(f.controller.getState().record?.step).toBe(20);expect(f.stormCommits).toBe(1);
    expect(useStore.getState().captureWorkspaceDocument()).toEqual(before);expect(f.controller.getState().record?.completed).toEqual(record.completed);expect(f.controller.getState().record?.lpm).toEqual(record.lpm);
  }finally{f.dispose();}
});
it('reviews completed /24 and /25 tasks without demanding an obsolete request path or replacing its witness',async()=>{
  const f=fixture();try {
    await f.via();const before=useStore.getState().captureWorkspaceDocument(),e=structuredClone(f.controller.getState().record!.lpm.experiment);
    for(let n=19;n>=16;n--)f.controller.previous();await f.settle();expect(f.controller.getState().historical).toBe(true);
    await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(17);
    expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true}); // /25 now wins; /24 remains historically proved.
    expect(await f.ping(I.a,'192.168.30.130')).toContain('64 bytes from');expect(f.controller.getState().record!.lpm.experiment.broad).toEqual(e.broad);
    await f.reload();expect(f.controller.getState().canAdvance).toBe(true);
    await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(18);expect(f.controller.getState().passed).toBe(true);
    expect(f.controller.getState().record!.lpm.experiment).toEqual(e);expect(useStore.getState().captureWorkspaceDocument()).toEqual(before);
  }finally{f.dispose();}
});
it.each([false,true])('reviews a recovered attempt in both directions after F5 (legacy attempt: %s)',async legacy=>{
  const f=fixture(true);try {
    await f.recovery();await f.route(I.r1,'192.168.20.0/24','10.0.13.2');await f.route(I.r3,'192.168.10.0/24','10.0.13.1');await f.controller.next();await f.settle();
    expect(f.controller.getState()).toMatchObject({historical:false,passed:false,canAdvance:false});
    await f.ping(I.a,'192.168.20.20');await f.ping(I.b,'192.168.10.10');expect(f.controller.getState().passed).toBe(true);
    const before=useStore.getState().captureWorkspaceDocument(),current=structuredClone(f.controller.getState().record!);
    if(legacy){const key=ALTERNATIVE_PROGRESS_PREFIX+f.id,entry=f.meta.get(key)!;f.meta.set(key,{...entry,value:{...current,chapterVersion:2,step:17,completed:Array.from({length:17},(_,i)=>i+1)} as unknown as MetaValue});}
    await f.reload();expect(f.controller.getState().record?.chapterVersion).toBe(4);
    for(let n=21;n>=1;n--)f.controller.previous();await f.settle();expect(f.controller.getState().canAdvance).toBe(true);
    for(let n=2;n<=22;n++){
      await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(n);expect(f.controller.getState().historical).toBe(true);
      if(n===13||n===17||n===21){await f.reload();expect(f.controller.getState().canAdvance).toBe(true);}
    }
    expect(useStore.getState().captureWorkspaceDocument()).toEqual(before);expect(f.stormCommits).toBe(1);
    expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({completed:22,total:22,complete:true});
    expect(f.controller.getState().record!.directReplies).toEqual(current.directReplies);
  }finally{f.dispose();}
});
it.each(['removed','recreated'] as const)('preserves review credit and the original C binding when PC C was %s',async mode=>{
  const f=fixture(true);try {
    await f.via();const record=structuredClone(f.controller.getState().record!),pc=record.lpm.pc!;
    useStore.getState().onNodesChange([{type:'remove',id:pc.id}]);await f.settle();
    if(mode==='recreated'){useStore.getState().setHostCreationMode('linux');useStore.getState().addDeviceAt('host',{x:1700,y:800});await f.settle();}
    const damaged=useStore.getState().captureWorkspaceDocument();await f.reload();
    for(let n=19;n>=13;n--)f.controller.previous();await f.settle();expect(f.controller.getState().canAdvance).toBe(true);
    await f.controller.next();await f.settle();expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true,warning:'lpmIdentity'});
    await f.controller.prepareLanC();await f.settle();
    for(let n=15;n<=20;n++){await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(n);}
    expect(f.controller.getState()).toMatchObject({historical:false,passed:false,canAdvance:false});
    expect(f.controller.getState().record!.lpm.pc).toEqual(pc);expect(f.controller.getState().record!.completed).toEqual(record.completed);expect(f.stormCommits).toBe(1);
    expect(useStore.getState().captureWorkspaceDocument()).toEqual(damaged);
  }finally{f.dispose();}
});
it('keeps a historically proved A/B pair intact across one new reply and F5',async()=>{
  const f=fixture();try {
    await f.via();for(let n=19;n>=12;n--)f.controller.previous();await f.settle();const old=structuredClone(f.controller.getState().record!);
    await f.route(I.r1,'192.168.0.0/16','10.0.13.2');expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true});
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().record!.viaReplies).toEqual(old.viaReplies);expect(f.controller.getState().record!.completed).toEqual(old.completed);
    await f.reload();expect(f.controller.getState().canAdvance).toBe(true);
    await f.ping(I.a,'192.168.20.20');await f.ping(I.b,'192.168.10.10');expect(f.controller.getState().passed).toBe(true);
    await f.reload();expect(f.controller.getState().record!.viaReplies.ab).toBe(f.controller.getState().record!.viaReplies.ba);expect(f.controller.getState().record!.completed).toEqual(old.completed);
  }finally{f.dispose();}
});
it.each(['linux','windows'] as const)('names only the recognized generated %s PC and respects Undo/Redo and F5 without changing its identity or configuration',async mode=>{
  const f=fixture();try{
    await f.toLpm();useStore.getState().setHostCreationMode(mode);useStore.getState().addDeviceAt('host',{x:1800,y:750});const id=useStore.getState().nodes.at(-1)!.id;
    const before=serializeNetwork(sim.net,{}).devices.find(d=>d.id===id)!;
    useStore.getState().onConnect({source:id,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();
    expect(sim.net.devices.get(id)!.name).toBe('PC C');
    expect(serializeNetwork(sim.net,{}).devices.find(d=>d.id===id)).toEqual({...before,name:'PC C'});
    expect(f.controller.getState().record?.lpm.pc).toMatchObject({id,nameChecked:true});
    useStore.getState().undoTopology();await f.settle();expect(sim.net.devices.get(id)!.name).toBe(before.name);
    useStore.getState().redoTopology();await f.settle();expect(sim.net.devices.get(id)!.name).toBe('PC C');
    useStore.getState().undoTopology();await f.settle();await f.reload();expect(sim.net.devices.get(id)!.name).toBe(before.name);
    expect(f.controller.getState().record?.lpm.pc).toMatchObject({id,nameChecked:true});
  }finally{f.dispose();}
});
it.each(['Cliente personalizado','pc42','collision'])('preserves %s on Windows when PC C is recognized and resumed',async name=>{
  const f=fixture();try{
    await f.toLpm();useStore.getState().setHostCreationMode('windows');
    let other='';if(name==='collision'){useStore.getState().addDeviceAt('host',{x:1900,y:50});other=useStore.getState().nodes.at(-1)!.id;useStore.getState().renameDevice(other,'PC C');}
    useStore.getState().addDeviceAt('host',{x:1800,y:750});const id=useStore.getState().nodes.at(-1)!.id;
    if(name!=='collision')useStore.getState().renameDevice(id,name);
    const before=sim.net.devices.get(id)!.name;
    useStore.getState().onConnect({source:id,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();await f.reload();
    expect(sim.net.devices.get(id)!.name).toBe(before);expect(f.controller.getState().record?.lpm.pc?.id).toBe(id);
    if(other)expect(sim.net.devices.get(other)!.name).toBe('PC C');
  }finally{f.dispose();}
});
it('applies one atomic storm, retains LPM and corrections across Undo/Redo, navigation and F5, then proves the recovered path', async () => {
  const f=fixture(true);try {
    await f.via();
    const p=structuredClone(f.controller.getState().record!), lpm=structuredClone(p.lpm), r2=()=>sim.net.devices.get(I.r2)!.getInterface('eth1')!;
    expect(p.storm).toBe('applied');expect(r2().up).toBe(false);expect(sim.net.links.has(L.right)).toBe(true);expect(f.stormCommits).toBe(1);
    expect((sim.net.devices.get(I.r1) as IpDevice).staticRoutes).toEqual(expect.arrayContaining([expect.objectContaining({dest:parseIp('192.168.20.0'),via:parseIp('10.0.12.2')})]));
    expect((sim.net.devices.get(I.r3) as IpDevice).staticRoutes).toEqual(expect.arrayContaining([expect.objectContaining({dest:parseIp('192.168.10.0'),via:parseIp('10.0.23.1')})]));
    useStore.getState().undoTopology();await f.settle();expect(r2().up).toBe(true);expect(f.stormCommits).toBe(1);
    useStore.getState().redoTopology();await f.settle();expect(r2().up).toBe(false);
    f.controller.previous();await f.settle();expect(f.controller.getState().record?.step).toBe(19);expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true});
    expect(f.controller.getState().record?.lpm).toEqual(lpm);await f.controller.next();await f.settle();await f.reload();
    expect(f.stormCommits).toBe(1);expect(r2().up).toBe(false);expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a,'192.168.20.20','api');expect(f.controller.getState().passed).toBe(false);
    expect(await f.ping(I.a,'192.168.20.20')).not.toContain('64 bytes from');expect(f.controller.getState().passed).toBe(true);
    const failure=f.controller.getState().record!.failure;
    f.command(I.r2,'ip link set eth1 up');await f.settle();await f.reload();expect(r2().up).toBe(true);expect(f.stormCommits).toBe(1);expect(f.controller.getState()).toMatchObject({historical:true,passed:false,canAdvance:true});
    await f.controller.next();await f.settle();
    expect(f.command(I.r1,'ip route add 192.168.20.0/24 via 10.0.13.2').output()).toContain('File exists');
    await f.route(I.r1,'192.168.20.0/24','10.0.13.2');expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r3,'192.168.10.0/24','10.0.13.1');expect(f.controller.getState().passed).toBe(true);
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().record!.directReplies.ab).toBeNull();
    await f.controller.next();await f.settle();f.forgedReply(I.a,'192.168.20.20');await f.settle();await f.ping(I.b,'192.168.10.10','api');expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().passed).toBe(false);await f.ping(I.b,'192.168.10.10','quick-ping');expect(f.controller.getState().passed).toBe(true);
    expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({completed:22,total:22,complete:true});
    await f.reload();expect(f.controller.getState().record?.failure).toBe(failure);expect(f.controller.getState().record?.lpm).toEqual(lpm);expect(f.stormCommits).toBe(1);
    for(let i=0;i<3;i++)f.controller.previous();await f.settle();expect(f.controller.getState().canAdvance).toBe(true);await f.controller.next();await f.settle();expect(r2().up).toBe(true);expect(f.stormCommits).toBe(1);
  }finally{f.dispose();}
});
it.each(['before','after'] as const)('recovers an interrupted storm transaction (%s commit) without a half-written incident or repeated damage', async phase=>{
  const f=fixture(true);try{
    await f.toLpm();await f.finishLpm(()=>f.failStorm(phase));
    expect(f.controller.getState().storageError).toBe(true);
    expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);
    const saved=f.meta.get(ALTERNATIVE_PROGRESS_PREFIX+f.id)!.value as unknown as {storm:string};
    expect(saved.storm).toBe(phase==='before'?'pending':'applied');
    f.failStorm(null);
    if(phase==='before'){await f.controller.retryProgress();await f.settle();}else await f.reload();
    expect(f.controller.getState().record?.storm).toBe('applied');expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(false);
    const commits=f.stormCommits;await f.reload();expect(f.stormCommits).toBe(commits);
  }finally{f.dispose();}
});
it('adopts an already unavailable R2–R3 connection without changing either port or the saved routes',async()=>{
  const f=fixture(true);try{
    await f.toLpm();await f.finishLpm(()=>f.failStorm('before'));
    f.command(I.r3,'ip link set eth0 down');await f.settle();const before=serializeNetwork(sim.net,{});
    f.failStorm(null);await f.controller.retryProgress();await f.settle();
    expect(f.controller.getState().record?.storm).toBe('adopted');expect(serializeNetwork(sim.net,{})).toEqual(before);
    expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);await f.reload();expect(f.controller.getState().record?.storm).toBe('adopted');expect(serializeNetwork(sim.net,{})).toEqual(before);
  }finally{f.dispose();}
});
it('does not damage the link when the learner edits routes while the entry to Part 4 is being persisted',async()=>{
  const f=fixture(true);try{
    await f.toLpm();await f.finishLpm(()=>f.beforeNextFlush(()=>{
      expect((sim.net.devices.get(I.r3) as IpDevice).replaceRoute(parseIp('192.168.10.0')!,24,parseIp('10.0.13.1')!,'eth1')).toBeNull();
      useStore.getState().refresh();
    }));
    expect(f.stormCommits).toBe(0);expect(f.controller.getState().record?.storm).toBe('pending');
    expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);
    expect((sim.net.devices.get(I.r3) as IpDevice).lookupRoute(parseIp('192.168.10.10')!)?.via).toBe(parseIp('10.0.13.1'));
    expect(f.controller.getState().warning).toBe('conflict');
  }finally{f.dispose();}
});
it('completes a real manual path change, survives F5/plan switches and never modifies the original personal draft', async () => {
  const f = fixture(); try {
    const personal = structuredClone(f.docs.get('personal')); await f.via(); expect(f.controller.getState().record?.step).toBe(20); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().failureMismatch).toBe(false);
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true);
    await f.reload(); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.13.2'); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r3, '192.168.10.0/24', '10.0.13.1'); expect(f.controller.getState().passed).toBe(true); expect(f.controller.getState().pathStatus).toBe('expected'); await f.controller.next(); await f.settle();
    expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().pathStatus).toBe('expected');
    expect(await f.ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true); expect(f.controller.getState().pathStatus).toBe('verified'); expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({ completed: 22, total: 22, complete: true });
    const attempt = f.id, old = structuredClone(f.controller.getState().record); await f.reload(); expect(f.controller.getState().record).toEqual(old); expect(f.controller.getState().passed).toBe(true);
    await f.switchTo('personal'); expect(f.controller.getState().active).toBe(false); expect(f.docs.get('personal')).toEqual(personal); await f.switchTo(attempt); expect(f.controller.getState().passed).toBe(true);
    const menu = await loadTutorialMenuProgress(f.repository, [attempt, 'personal'], null, id => f.docs.get(id)!); expect(menu.alternative?.progress.complete).toBe(true); expect(menu.routing).toBeNull();
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); expect(f.controller.getState().replies.ab).toBe(false); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().pathStatus).toBe('invalidated');
  } finally { f.dispose(); }
});
it.each(['replace', 'delete-add'] as const)('recovers whole LANs with %s and proves direct request/reply paths in both directions', async method => {
  const f = fixture(true); let release = () => {};
  try {
    await f.recovery(); const lpm = structuredClone(f.controller.getState().record!.lpm);
    for (const [id, destination, hop] of [[I.r1, '192.168.20.0/24', '10.0.13.2'], [I.r3, '192.168.10.0/24', '10.0.13.1']]) {
      if (method === 'delete-add') await f.exec(id, `ip route del ${destination}`);
      await f.exec(id, `ip route ${method === 'replace' ? 'replace' : 'add'} ${destination} via ${hop} dev eth1`);
    }
    expect(alternativeConditions(sim.net)).toMatchObject({ directForward: true, directBackward: true, direct: true });
    expect(f.controller.getState().passed).toBe(true); expect(f.controller.getState().record!.lpm).toEqual(lpm);
    expect(sim.net.devices.get(lpm.pc!.id)!.getInterface('eth0')!.ip).toEqual(parseCidr('192.168.30.130/25'));
    expect(sim.net.devices.get(I.r3)!.getInterface('eth3')!.ip).toEqual(parseCidr('192.168.30.129/25'));
    await f.controller.next(); await f.settle(); expect(f.controller.getState().record?.step).toBe(22);
    const observed: { request: string[][]; reply: string[][] } = { request: [], reply: [] };
    release = observeNetworkActivity(event => { if (event.kind === 'icmp') observed[event.direction].push([event.from, event.to]); });
    await f.ping(I.a, '192.168.20.20', 'api'); expect(f.controller.getState().passed).toBe(false);
    observed.request = []; observed.reply = [];
    expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(false);
    expect(observed.request).toEqual([[I.a, I.r1], [I.r1, I.r3], [I.r3, I.b]]);
    expect(observed.reply).toEqual([[I.b, I.r3], [I.r3, I.r1], [I.r1, I.a]]);
    observed.request = []; observed.reply = [];
    expect(await f.ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true);
    expect(observed.request).toEqual([[I.b, I.r3], [I.r3, I.r1], [I.r1, I.a]]);
    expect(observed.reply).toEqual([[I.a, I.r1], [I.r1, I.r3], [I.r3, I.b]]);
    expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({ completed: 22, total: 22, complete: true });
  } finally { release(); f.dispose(); }
});
it.each(['forward', 'return'] as const)('rejects endpoint-only /32 %s recovery even when both PC pings work', async direction => {
  const f = fixture(true);
  try {
    await f.recovery();
    if (direction === 'forward') {
      await f.exec(I.r1, 'ip route del 192.168.20.0/24');
      await f.exec(I.r1, 'ip route add 192.168.20.20/32 via 10.0.13.2 dev eth1');
      await f.route(I.r3, '192.168.10.0/24', '10.0.13.1');
    } else {
      await f.route(I.r1, '192.168.20.0/24', '10.0.13.2');
      expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from');
      await f.exec(I.r3, 'ip route add 192.168.10.10/32 via 10.0.13.1 dev eth1');
    }
    expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from');
    expect(await f.ping(I.b, '192.168.10.10')).toContain('64 bytes from');
    expect(alternativeConditions(sim.net)).toMatchObject({ directForward: direction === 'return', directBackward: direction === 'forward', direct: false });
    expect(f.controller.getState().passed).toBe(false); await f.controller.next(); await f.settle();
    expect(f.controller.getState().record?.step).toBe(21);
  } finally { f.dispose(); }
});
it('accepts two /25s covering each LAN and rejects a single off-path /32 hole in either LAN', async () => {
  const f = fixture(true);
  try {
    await f.recovery();
    for (const [id, lan, hop] of [[I.r1, '192.168.20', '10.0.13.2'], [I.r3, '192.168.10', '10.0.13.1']]) {
      await f.exec(id, `ip route del ${lan}.0/24`);
      for (const host of [0, 128]) await f.exec(id, `ip route add ${lan}.${host}/25 via ${hop} dev eth1`);
    }
    expect(alternativeConditions(sim.net).direct).toBe(true); expect(f.controller.getState().passed).toBe(true);
    for (const [id, lan, hop, iface] of [[I.r1, '192.168.20', '10.0.12.2', 'eth0'], [I.r3, '192.168.10', '10.0.23.1', 'eth0']]) {
      await f.exec(id, `ip route add ${lan}.99/32 via ${hop} dev ${iface}`);
      expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(await f.ping(I.b, '192.168.10.10')).toContain('64 bytes from');
      expect(alternativeConditions(sim.net).direct).toBe(false); expect(f.controller.getState().passed).toBe(false);
      // Independent exhaustive oracle for the boundary-based whole-LAN verifier.
      const device = sim.net.devices.get(id) as IpDevice, expectedHop = parseIp(id === I.r1 ? '10.0.13.2' : '10.0.13.1');
      const wrong = Array.from({ length: 254 }, (_, n) => parseIp(`${lan}.1`)! + n).filter(ip => {
        const route = device.lookupRoute(ip); return route?.via !== expectedHop || route.ifaceName !== 'eth1';
      });
      expect(wrong).toEqual([parseIp(`${lan}.99`)]);
      await f.exec(id, `ip route del ${lan}.99/32`); expect(f.controller.getState().passed).toBe(true);
    }
  } finally { f.dispose(); }
});
it.each([['next hop', '10.0.13.1', 'eth1'], ['interface', '10.0.13.2', 'eth0']])('rejects LAN B recovery with the wrong %s', async (_label, hop, iface) => {
  const f = fixture(true);
  try {
    await f.recovery(); await f.route(I.r3, '192.168.10.0/24', '10.0.13.1');
    await f.exec(I.r1, `ip route replace 192.168.20.0/24 via ${hop} dev ${iface}`);
    expect(alternativeConditions(sim.net)).toMatchObject({ directForward: false, directBackward: true, direct: false });
    expect(f.controller.getState().passed).toBe(false);
  } finally { f.dispose(); }
});
it('requires directly connected neighbor destinations, real packets and both actual routed paths', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); for (const row of TRANSIT_PLAN) { f.command(row.device, `ip address add ${row.address} dev ${row.iface}`); await f.settle(); }
    await f.ping(I.r1, '10.0.12.2', 'api'); expect(f.controller.getState().neighbors.n12).toBe(false);
    f.forgedReply(I.r1, '10.0.12.2'); await f.settle(); expect(f.controller.getState().neighbors.n12).toBe(false);
    await f.route(I.r1, '10.0.23.0/30', '10.0.13.2'); await f.route(I.r3, '10.0.12.0/30', '10.0.13.1'); expect(await f.ping(I.r1, '10.0.23.2')).toContain('64 bytes from'); expect(Object.values(f.controller.getState().neighbors).every(value => !value)).toBe(true);
    for (let index = 0; index < 3; index++) { for (const test of NEIGHBOR_TESTS.slice(index * 2, index * 2 + 2)) await f.ping(test.from, test.target); await f.controller.next(); await f.settle(); }
    f.controller.answer('remote', '12'); expect(f.controller.getState().answerError).toBe(true); expect(f.controller.getState().passed).toBe(false);
    f.controller.answer('remote', '23'); await f.settle(); const before = useStore.getState().nodes.map(n => ({ id: n.id, position: n.position })); await f.controller.next(); await f.settle();
    expect(useStore.getState().nodes.filter(n => before.some(old => old.id === n.id)).map(n => ({ id: n.id, position: n.position }))).toEqual(before); expect(sim.net.devices.size).toBe(5);
    await f.config(I.r1, 'eth2', '192.168.10.1/24'); await f.config(I.r3, 'eth2', '192.168.20.1/24'); await f.config(I.a, 'eth0', '192.168.10.50/24', '192.168.10.1'); await f.config(I.b, 'eth0', '192.168.20.60/24', '192.168.20.1');
    await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.route(I.r3, '192.168.10.0/24', '10.0.13.1');
    expect(await f.ping(I.a, '192.168.20.60')).toContain('64 bytes from'); expect(f.controller.getState().replies.ab).toBe(false);
    expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.12.1'); await f.ping(I.a, '192.168.20.60', 'api'); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.60'); await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle();
    expect(f.controller.getState().record?.step).toBe(10); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.60'); await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle();
    expect(f.controller.getState().record?.step).toBe(12);
    await f.ping(I.a, '192.168.20.60'); await f.ping(I.b, '192.168.10.50'); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('revalidates concurrent PC pings after a route-table experiment without confusing their protocol identities', async () => {
  const f = fixture(); try {
    await f.via(); for(let i=0;i<8;i++) f.controller.previous(); await f.settle(); expect(f.controller.getState().record?.step).toBe(12);
    await f.route(I.r1, '192.168.0.0/16', '10.0.13.2'); expect(f.controller.getState().passed).toBe(false);
    expect(Object.values(f.controller.getState().neighbors).every(Boolean)).toBe(true);
    const ab = f.command(I.a, 'ping -c 1 192.168.20.20'), ba = f.command(I.b, 'ping -c 1 192.168.10.10', 'quick-ping');
    sim.net.scheduler.advanceTo(sim.net.now + 6000); await f.settle();
    expect(ab.output()).toContain('64 bytes from'); expect(ba.output()).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle();
    await f.replayLpm();
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('accepts an actual cable removal failure but rejects failures after unrelated configuration changes', async () => {
  const f = fixture(); try {
    await f.via(); const baseline = serializeNetwork(sim.net, {}); useStore.getState().onEdgesChange([{ type: 'remove', id: L.left }]); await f.settle();
    await f.route(I.r2, '203.0.113.0/24', '10.0.23.2'); await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().failureMismatch).toBe(true);
    expect(f.command(I.r2, 'ip route del 203.0.113.0/24').output()).toBe(''); await f.settle();
    expect(await tutorialFingerprint(failureBaselineSignature(sim.net))).toBe(f.controller.getState().record?.viaBaseline);
    const output = await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed, output).toBe(true); expect(sim.net.links.has(L.direct)).toBe(true);
    expect((sim.net.devices.get(I.r1) as IpDevice).staticRoutes.map(r => r.via)).toEqual(baseline.devices.find(d => d.id === I.r1)!.routes.map(r => parseIp(r.via!)));
  } finally { f.dispose(); }
});
it('recovers an interrupted PC insertion once and preserves identities, positions and unrelated checkpoint data', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); const initial = useStore.getState().captureWorkspaceDocument(), progress = structuredClone(f.controller.getState().record!);
    const cp = readChapterCheckpoint({ schemaVersion: 1, kind: 'chapter-checkpoint', draftId: f.id, chapter: 'alternative-paths', attemptId: crypto.randomUUID(), before: initial, initial, progress }, f.id, 'alternative-paths');
    await f.triangle(false);
    f.failReceipt(true); await f.controller.next(); await f.settle(); expect(f.controller.getState().storageError).toBe(true); expect((f.meta.get(ALTERNATIVE_PROGRESS_PREFIX + f.id)!.value as { stage: string }).stage).toBe('adding-pcs'); expect(sim.net.devices.size).toBe(5);
    f.failReceipt(false); await f.reload(); expect(f.controller.getState().record?.step).toBe(5); expect(sim.net.devices.size).toBe(5); const ids = sim.net.devices.get(I.a)!.interfaces[0].mac; await f.reload(); expect(sim.net.devices.get(I.a)!.interfaces[0].mac).toBe(ids);
    useStore.getState().undoTopology(); await f.settle(); // F5 does not restore the undo stack; this is intentionally a no-op.
    const extra = createDevice(sim.net, 'host', { id: 'unrelated' }); useStore.getState().refresh(); const current = useStore.getState().captureWorkspaceDocument();
    const reset = chapterRestartDocument(cp, current, f.controller.getState().record! as unknown as MetaValue); expect(reset.topology.devices.filter(d => d.id !== extra.id)).toEqual(initial.topology.devices); expect(reset.topology.devices.some(d => d.id === extra.id)).toBe(true);
    const invalid = structuredClone(current); invalid.topology.devices.find(d => d.id === I.a)!.ifaces[0].mac = '02:ff:ff:ff:ff:ff'; expect(() => chapterRestartDocument(cp, invalid, f.controller.getState().record! as unknown as MetaValue)).toThrow('checkpoint-conflict');
    expect(() => readAlternativeProgress({ ...f.controller.getState().record, completed: [17] }, f.id)).toThrow('Incompatible');
  } finally { f.dispose(); }
});
it('refuses pending forms and failed intent writes without adding PCs or replacing another draft', async () => {
  const f = fixture(); try { f.forms(true); await f.controller.begin(); expect(f.id).toBe('personal'); f.forms(false); await f.triangle(); const before = serializeNetwork(sim.net, {}); f.fail(true); await f.controller.next(); await f.settle(); expect(f.controller.getState().storageError).toBe(true); expect(serializeNetwork(sim.net, {})).toEqual(before); expect(sim.net.devices.has(I.a)).toBe(false); } finally { f.dispose(); }
});
it('accepts genuine Windows PC replies and link-failure output with the same protocol-path requirements', async () => {
  const f = fixture(); try {
    await f.via(); for (let i=0;i<8;i++) f.controller.previous(); await f.settle();
    useStore.getState().setHostOs(I.a, 'windows'); useStore.getState().setHostOs(I.b, 'windows'); await f.settle();
    expect(await f.ping(I.a, '192.168.20.20')).toContain('Reply from 192.168.20.20: time=');
    expect(await f.ping(I.b, '192.168.10.10')).toContain('Reply from 192.168.10.10: time='); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle(); await f.replayLpm();
    expect(await f.ping(I.a,'192.168.30.130')).toContain('Reply from');
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('TTL='); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.route(I.r1, '192.168.20.0/24', '10.0.13.2'); await f.route(I.r3, '192.168.10.0/24', '10.0.13.1'); await f.controller.next(); await f.settle();
    await f.ping(I.a, '192.168.20.20'); await f.ping(I.b, '192.168.10.10'); expect(f.controller.getState().passed).toBe(true); await f.reload(); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('distinguishes another missing hop and successful early configuration from a missing route on R1', async () => {
  const f = fixture(); try {
    await f.lans();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2');
    await f.ping(I.a, '192.168.20.20');
    expect(f.controller.getState().investigationResult).toBe('other');
    await f.route(I.r2, '192.168.20.0/24', '10.0.23.2');
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1');
    await f.route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from');
    expect(f.controller.getState()).toMatchObject({ passed: true, investigationResult: 'reply' });
    await f.reload(); expect(f.controller.getState()).toMatchObject({ passed: true, investigationResult: null });
  } finally { f.dispose(); }
});
it('requires fresh observed diagnostic pings, keeps partial verification expected and invalidates an old failure after edits', async () => {
  const f = fixture(); try {
    await f.lans(); expect(f.controller.getState().record?.step).toBe(7);
    expect(f.controller.getState().investigationResult).toBeNull();
    f.forgedReply(I.a, '192.168.20.20'); await f.settle(); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.20', 'api'); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
    expect(f.controller.getState().investigationResult).toBe('missing-route');
    await f.reload(); expect(f.controller.getState().passed).toBe(true);
    expect(f.controller.getState().investigationResult).toBeNull(); // Old progress records no cause.
    await f.route(I.r1, '203.0.113.0/24', '10.0.12.2'); expect(f.controller.getState().passed).toBe(true);
    await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.controller.next(); await f.settle();
    await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.controller.next(); await f.settle();
    expect(f.controller.getState().record?.step).toBe(10); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.controller.next(); await f.settle();
    await f.route(I.r2, '192.168.10.0/24', '10.0.12.1'); await f.ping(I.a, '192.168.20.20');
    expect(f.controller.getState().pathStatus).toBe('expected'); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.b, '192.168.10.10'); await f.controller.next(); await f.settle(); f.controller.answer('hop', 'r2'); await f.settle();
    await f.controller.next(); await f.settle(); await f.finishLpm();
    f.command(I.r1, 'ip link set eth0 down'); await f.settle(); expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
    await f.route(I.r3, '192.168.10.10/32', '10.0.13.1'); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().failureMismatch).toBe(true);
    await f.reload(); expect(f.controller.getState().passed).toBe(false);
  } finally { f.dispose(); }
});
it.each(['r3', 'r2'] as const)('explains the observed missing return route at %s only after real packets, without changing persisted proof', async missing => {
  const f = fixture(); try {
    await f.lans(); await f.ping(I.a, '192.168.20.20');
    expect(f.controller.getState().investigationResult).toBe('missing-route');
    await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.controller.next(); await f.settle();
    await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.controller.next(); await f.settle();
    if (missing === 'r2') await f.route(I.r3, '192.168.10.0/24', '10.0.23.1');
    expect(f.controller.getState()).toMatchObject({ investigationResult: null, passed: false });
    f.forgedReply(I.a, '192.168.20.20'); await f.settle();
    await f.ping(I.a, '192.168.20.20', 'api');
    expect(f.controller.getState()).toMatchObject({ investigationResult: null, passed: false });
    expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from');
    expect(f.controller.getState()).toMatchObject({ investigationResult: 'missing-return', passed: true });
    const proof = f.controller.getState().record?.returnInvestigated;
    await f.reload();
    expect(f.controller.getState()).toMatchObject({ investigationResult: null, passed: true });
    expect(f.controller.getState().record?.returnInvestigated).toBe(proof);
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from');
    expect(f.controller.getState().investigationResult).toBe('reply');
    await f.controller.next(); await f.settle();
    expect(f.controller.getState().investigationResult).toBeNull();
  } finally { f.dispose(); }
});
it('does not attribute a real return loop to a missing return route', async () => {
  const f = fixture(); try {
    await f.lans(); await f.ping(I.a, '192.168.20.20'); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.controller.next(); await f.settle();
    await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.controller.next(); await f.settle();
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.23.2');
    expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from');
    expect(f.controller.getState()).toMatchObject({ investigationResult: 'other', passed: true });
  } finally { f.dispose(); }
});
it('resumes a partial v1 attempt with its real global neighbour receipt and preserves moved devices', async () => {
  const f = fixture(); try {
    await f.triangle();
    useStore.getState().onNodesChange([{ type: 'position', id: I.r2, position: { x: 970, y: 150 }, dragging: false }]); await f.settle();
    const document = useStore.getState().captureWorkspaceDocument(), key = ALTERNATIVE_PROGRESS_PREFIX + f.id, entry = f.meta.get(key)!;
    const p = { ...structuredClone(f.controller.getState().record!), chapterVersion: 1, step: 2, completed: [1], remoteUnderstood: false,
      neighbors: { ...emptyNeighborProofs(), n12: await tutorialFingerprint(neighborSignature(sim.net)) } };
    f.meta.set(key, { ...entry, value: p as unknown as MetaValue });
    await f.reload(); expect(f.controller.getState().record).toMatchObject({ chapterVersion: 4, step: 1, completed: [] });
    expect(useStore.getState().captureWorkspaceDocument()).toEqual(document);
    expect(f.controller.getState().neighbors).toMatchObject({ n12: true, n21: false });
    await f.ping(I.r2, '10.0.12.1'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); expect(f.controller.getState().record?.step).toBe(2);
    expect(f.meta.get(key)?.value).toMatchObject({ chapterVersion: 4, completed: [1] });
    expect(useStore.getState().captureWorkspaceDocument()).toEqual(document);
  } finally { f.dispose(); }
});

it.each(['linux','windows','mixed'] as const)('binds only a newly created %s PC physically connected to R3 eth3, retaining the baseline across F5 and Undo/Redo', async mode => {
  const f=fixture(); try {
    let independent='';
    await f.toLpm(()=>{useStore.getState().setHostCreationMode(mode==='linux'?'linux':'windows');useStore.getState().addDeviceAt('host',{x:1800,y:50});independent=useStore.getState().nodes.at(-1)!.id;});
    expect(f.controller.getState().record?.lpm).toMatchObject({stage:'ready',pc:null});
    const originalProofs=structuredClone(f.controller.getState().record!.viaReplies);
    useStore.getState().onConnect({source:independent,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();
    expect(f.controller.getState().record?.lpm.pc).toBeNull();
    const disconnect=()=>{const link=sim.net.devices.get(I.r3)!.getInterface('eth3')!.link!;useStore.getState().onEdgesChange([{type:'remove',id:link.id}]);};
    disconnect();await f.settle();
    useStore.getState().setHostCreationMode(mode);const random=mode==='mixed'?vi.spyOn(Math,'random').mockReturnValue(0.9):null;
    try{useStore.getState().addDeviceAt('host',{x:1800,y:750});}finally{random?.mockRestore();}const c=useStore.getState().nodes.at(-1)!.id;
    expect((sim.net.devices.get(c) as Host).os).toBe(mode==='linux'?'linux':'windows');
    await f.settle();await f.reload();expect(f.controller.getState().record?.lpm.pc).toBeNull();
    useStore.getState().onConnect({source:c,target:I.r1,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();expect(f.controller.getState().record?.lpm.pc).toBeNull();
    useStore.getState().onEdgesChange([{type:'remove',id:sim.net.devices.get(c)!.getInterface('eth0')!.link!.id}]);await f.settle();
    useStore.getState().onConnect({source:c,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();
    expect(f.controller.getState().record?.lpm.pc?.id).toBe(c);
    await f.config(c,'eth0','192.168.30.131/25','192.168.30.129');expect(f.controller.getState().passed).toBe(false);
    await f.config(c,'eth0','192.168.30.130/24','192.168.30.129');expect(f.controller.getState().passed).toBe(false);
    await f.config(c,'eth0','192.168.30.130/25','192.168.30.1');expect(f.controller.getState().passed).toBe(false);
    await f.config(c,'eth0','192.168.30.130/25','192.168.30.129');expect(f.controller.getState()).toMatchObject({passed:true,reviewing:false});
    const draft=f.id;await f.switchTo('personal');await f.switchTo(draft);expect(f.controller.getState()).toMatchObject({passed:true,reviewing:true});
    await f.config(c,'eth0','192.168.30.130/25');expect(f.controller.getState().passed).toBe(false);
    if(mode==='linux')await f.route(c,'0.0.0.0/0','192.168.30.129');else await f.config(c,'eth0','192.168.30.130/25','192.168.30.129');expect(f.controller.getState().passed).toBe(true);
    expect(f.controller.getState().record?.viaReplies).toEqual(originalProofs);
    const binding=structuredClone(f.controller.getState().record!.lpm.pc);await f.reload();expect(f.controller.getState().record?.lpm.pc).toEqual(binding);expect(f.controller.getState()).toMatchObject({passed:true,reviewing:true});
    disconnect();await f.settle();expect(f.controller.getState().passed).toBe(false);useStore.getState().undoTopology();await f.settle();expect(f.controller.getState().passed).toBe(true);
    useStore.getState().redoTopology();await f.settle();expect(f.controller.getState().passed).toBe(false);
  } finally {f.dispose();}
});

it.each(['windows','mixed'] as const)('completes all LAN C tasks and the chapter with a %s Windows PC configured through the Inspector',async mode=>{
  const f=fixture(true);try{
    await f.toLpm();const c=await f.finishLpm(undefined,mode),binding=structuredClone(f.controller.getState().record!.lpm.pc);
    expect((sim.net.devices.get(c) as Host).os).toBe('windows');expect(sim.net.devices.get(c)!.name).toBe('PC C');
    expect(f.controller.getState().record!.completed).toEqual(Array.from({length:19},(_,i)=>i+1));
    await f.reload();expect(f.controller.getState().record!.lpm.pc).toEqual(binding);expect(f.stormCommits).toBe(1);
    expect(await f.ping(I.a,'192.168.20.20')).not.toContain('64 bytes from');await f.controller.next();await f.settle();
    await f.route(I.r1,'192.168.20.0/24','10.0.13.2');await f.route(I.r3,'192.168.10.0/24','10.0.13.1');await f.controller.next();await f.settle();
    await f.ping(I.a,'192.168.20.20');await f.ping(I.b,'192.168.10.10');await f.reload();
    expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({completed:22,total:22,complete:true});
    expect(f.controller.getState().record!.lpm.pc).toEqual(binding);expect((sim.net.devices.get(c) as Host).os).toBe('windows');
  }finally{f.dispose();}
});

it('requires real local and routed C replies, proves both /24 and /25 alternatives and observes the asymmetric return', async()=>{
  const f=fixture();try {
    await f.toLpm();useStore.getState().setHostCreationMode('linux');useStore.getState().addDeviceAt('host',{x:1800,y:750});const c=useStore.getState().nodes.at(-1)!.id;
    useStore.getState().onConnect({source:c,target:I.r3,sourceHandle:'eth0',targetHandle:'eth3'});await f.settle();await f.config(c,'eth0','192.168.30.130/25','192.168.30.129');await f.controller.next();await f.settle();
    await f.ping(I.b,'192.168.30.129');expect(f.controller.getState().passed).toBe(false);
    f.forgedReply(c,'192.168.30.129');await f.settle();expect(f.controller.getState().passed).toBe(false);
    await f.ping(c,'192.168.30.129','api');expect(f.controller.getState().passed).toBe(false);
    await f.ping(c,'192.168.30.129','quick-ping');expect(f.controller.getState().passed).toBe(true);const local=f.controller.getState().record!.lpm.localReply;await f.reload();expect(f.controller.getState().passed).toBe(true);
    await f.route(I.r3,'192.168.30.130/32','10.0.23.1');expect(f.controller.getState().passed).toBe(false);
    f.command(I.r3,'ip route del 192.168.30.130/32');await f.settle();expect(f.controller.getState().passed).toBe(true);
    await f.controller.next();await f.settle();await f.route(I.r1,'192.168.30.0/24','10.0.12.2');await f.route(I.r1,'192.168.30.128/25','10.0.13.2');expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r2,'192.168.30.128/25','10.0.23.2');expect(f.controller.getState().passed).toBe(false);expect(f.controller.getState().record!.lpm.localReply).toBe(local);
    f.forgedReply(I.r2,'192.168.30.130');await f.settle();await f.ping(I.r2,'192.168.30.130','api');expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.r2,'192.168.30.130','quick-ping');expect(f.controller.getState().passed).toBe(true);
    await f.route(c,'10.0.23.1/32','192.168.30.131');expect(f.controller.getState().passed).toBe(false);
    f.command(c,'ip route del 10.0.23.1/32');await f.settle();expect(f.controller.getState().passed).toBe(true);
    await f.controller.next();await f.settle();
    const early=serializeNetwork(sim.net,{});
    expect(f.controller.getState().experiment.broadBlocked).toBe(true);
    await f.ping(I.a,'192.168.30.130');expect(f.controller.getState().passed).toBe(false);
    expect(serializeNetwork(sim.net,{})).toEqual(early); // The guide never deletes the early /25.
    const paths:{request:string[][];reply:string[][]}={request:[],reply:[]};const stop=observeNetworkActivity(event=>{if(event.kind==='icmp'&&[parseIp('192.168.30.130'),parseIp('192.168.10.10')].includes(event.destination))paths[event.direction].push([event.from,event.to]);});
    f.command(I.r1,'ip route del 192.168.30.128/25');await f.settle();expect(await f.ping(I.a,'192.168.30.130','api')).toContain('64 bytes from');expect(paths.request).toEqual([[I.a,I.r1],[I.r1,I.r2],[I.r2,I.r3],[I.r3,c]]);expect(f.controller.getState().passed).toBe(false);
    paths.request=[];paths.reply=[];
    await f.ping(I.a,'192.168.30.130','quick-ping');expect(f.controller.getState().passed).toBe(true);
    expect(paths.request).toEqual([[I.a,I.r1],[I.r1,I.r2],[I.r2,I.r3],[I.r3,c]]);
    const broad=structuredClone(f.controller.getState().record!.lpm.experiment.broad);
    await f.reload();expect(f.controller.getState().experiment.broadPing).toBe(true);await f.controller.next();await f.settle();
    await f.route(I.r1,'192.168.30.128/25','10.0.13.2');
    expect(f.controller.getState().experiment).toMatchObject({r2Ping:true,broadPing:true,specificPing:false});
    expect(f.controller.getState().record!.lpm.experiment.broad).toEqual(broad);
    f.controller.answer('lpm','specific');await f.settle();expect(f.controller.getState().passed).toBe(false);
    await f.ping(I.b,'192.168.30.130');expect(f.controller.getState().lpmObserved).toBe(false);
    f.forgedReply(I.a,'192.168.30.130');await f.settle();expect(f.controller.getState().lpmObserved).toBe(false);
    await f.ping(I.a,'192.168.30.130','api');expect(f.controller.getState().lpmObserved).toBe(false);
    paths.request=[];paths.reply=[];await f.ping(I.a,'192.168.30.130','quick-ping');stop();
    expect(paths.request).toEqual([[I.a,I.r1],[I.r1,I.r3],[I.r3,c]]);expect(paths.reply).toEqual([[c,I.r3],[I.r3,I.r2],[I.r2,I.r1],[I.r1,I.a]]);
    expect(f.controller.getState().lpmObserved).toBe(true);expect(f.controller.getState().passed).toBe(true);
    await f.controller.next();await f.settle();expect(f.controller.getState().record?.step).toBe(19);expect(f.controller.getState().passed).toBe(false);
    f.controller.answer('lpm','cables');expect(f.controller.getState().passed).toBe(false);f.controller.answer('lpm','specific');await f.settle();expect(f.controller.getState().passed).toBe(true);
    await f.reload();expect(f.controller.getState().lpmObserved).toBe(true);expect(f.controller.getState().passed).toBe(true);
    await f.route(I.r2,'203.0.113.0/24','10.0.23.2');expect(f.controller.getState().lpmObserved).toBe(true);
  } finally {f.dispose();}
});

it('accepts a different real return path in both experiments and stores its observed hops',async()=>{
  const f=fixture();try {
    await f.via(); const pc=f.controller.getState().record!.lpm.pc!.id;
    for(let i=0;i<6;i++)f.controller.previous(); await f.settle();
    await f.route(I.r3,'192.168.10.0/24','10.0.13.1');
    await f.replayLpm();
    const e=f.controller.getState().record!.lpm.experiment;
    expect(e.broad?.reply).toEqual([pc,I.r3,I.r1,I.a]);
    expect(e.specific?.reply).toEqual([pc,I.r3,I.r1,I.a]);
    expect(f.controller.getState().lpmObserved).toBe(true);
    await f.reload();expect(f.controller.getState().record!.lpm.experiment).toEqual(e);
  }finally{f.dispose();}
});
it.each(['preparing','ready'] as const)('recovers an interrupted LAN C %s write without adding PCs or overwriting existing data',async stage=>{
  const f=fixture();try {
    await f.toLpm(()=>f.failLpm(stage));
    expect(f.controller.getState().storageError).toBe(true);
    const before=f.controller.getState().record!.lpm.baseline;
    const r3=sim.net.devices.get(I.r3)!;
    expect(r3.getInterface('eth3')!.ip?.addr??null).toBe(stage==='ready'?parseIp('192.168.30.129'):null);
    expect(sim.net.devices.size).toBe(5);
    f.failLpm(null);await f.reload();expect(f.controller.getState().storageError).toBe(false);expect(f.controller.getState().record!.lpm.stage).toBe('ready');expect(sim.net.devices.size).toBe(5);
    if(stage==='ready')expect(f.controller.getState().record!.lpm.baseline).toEqual(before);
    const document=useStore.getState().captureWorkspaceDocument();await f.reload();expect(useStore.getState().captureWorkspaceDocument()).toEqual(document);
  }finally{f.dispose();}
});

it('normalizes a valid legacy A/B receipt pair atomically when only one ping is repeated',async()=>{
  const f=fixture();try {
    await f.toLpm();f.controller.previous();f.controller.previous();await f.settle();
    const key=ALTERNATIVE_PROGRESS_PREFIX+f.id,entry=f.meta.get(key)!,p=structuredClone(f.controller.getState().record!);
    const full=await tutorialFingerprint((await import('./alternativePathsChapter')).alternativeSignature(sim.net));
    p.viaReplies={ab:full,ba:full};f.meta.set(key,{...entry,value:p as unknown as MetaValue});await f.reload();expect(f.controller.getState().passed).toBe(true);
    await f.ping(I.a,'192.168.20.20');const read=readAlternativeProgress(f.meta.get(key)!.value,f.id);expect(read.viaReplies.ab).toBe(read.viaReplies.ba);expect(read.viaReplies.ab).not.toBe(full);
    await f.reload();expect(f.controller.getState().passed).toBe(true);
  }finally{f.dispose();}
});

it('restarts only the owned chapter group, including C by ID/MAC, and refuses a reused C identity',async()=>{
  const f=fixture();try {
    await f.via();const p=structuredClone(f.controller.getState().record!),c=p.lpm.pc!;
    useStore.getState().setHostCreationMode('linux');useStore.getState().addDeviceAt('host',{x:100,y:100});const independent=useStore.getState().nodes.at(-1)!.id;await f.settle();
    const current=useStore.getState().captureWorkspaceDocument(),initial=structuredClone(current);
    initial.topology.devices=initial.topology.devices.filter(d=>[I.r1,I.r2,I.r3].includes(d.id as typeof I.r1)).map(d=>({...d,routes:[],ifaces:d.ifaces.map(i=>({...i,ip:null,ipv4Mode:'unconfigured',gateway:null,dns:null}))}));
    initial.topology.links=initial.topology.links.filter(l=>[L.left,L.right,L.direct].includes(l.id as typeof L.left));
    const start={...p,stage:'triangle',step:1,completed:[],extension:null,neighbors:emptyNeighborProofs(),remoteUnderstood:false,hopUnderstood:false,lpmUnderstood:false,viaReplies:{ab:null,ba:null},directReplies:{ab:null,ba:null},viaBaseline:null,failure:null,investigated:null,returnInvestigated:null,lpm:emptyLpm()};
    const cp=readChapterCheckpoint({schemaVersion:1,kind:'chapter-checkpoint',draftId:f.id,chapter:'alternative-paths',attemptId:crypto.randomUUID(),before:initial,initial,progress:start},f.id,'alternative-paths');
    const reset=chapterRestartDocument(cp,current,p as unknown as MetaValue);
    expect(reset.topology.devices.map(d=>d.id).sort()).toEqual([I.r1,I.r2,I.r3,independent].sort());
    expect(reset.topology.devices.find(d=>d.id===independent)).toEqual(current.topology.devices.find(d=>d.id===independent));
    const corrupt=structuredClone(current);corrupt.topology.devices.find(d=>d.id===c.id)!.ifaces[0].mac='02:ff:ff:ff:ff:ff';expect(()=>chapterRestartDocument(cp,corrupt,p as unknown as MetaValue)).toThrow('checkpoint-conflict');
    const connected=structuredClone(current);connected.topology.links.push({id:'independent-cable',a:[c.id,'eth0'],b:[independent,'eth0']});expect(()=>chapterRestartDocument(cp,connected,p as unknown as MetaValue)).toThrow('checkpoint-conflict');
  }finally{f.dispose();}
});
