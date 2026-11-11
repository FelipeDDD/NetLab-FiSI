import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { sim } from '../sim';
import { disposeNetwork } from '../engine/networkLifecycle';
import { Host, IpDevice } from '../engine/ipdevice';
import { serializeNetwork } from '../engine/serialize';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { observeNetworkActivity } from '../networkObservations';
import type { MetaRecord, MetaValue, ProjectDocument } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import type { SessionControllerState } from '../persistence/sessionTypes';
import type { SessionController, OpenDocumentOptions } from '../persistence/sessionController';
import { recordOperation } from '../topologyHistory';
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import { AlternativePathsController } from './AlternativePathsController';
import { AlternativePathsProgressStore } from './alternativePathsProgress';
import { ALTERNATIVE_IDS as I, NEIGHBOR_TESTS, TRANSIT_PLAN, alternativePathsDocument } from './alternativePathsChapter';
import { alternativePathsCompletion } from './completion';
import { loadTutorialMenuProgress } from './menuProgress';
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
vi.setConfig({ testTimeout: 15000 });
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });
function fixture() {
  const meta = new Map<string, MetaRecord>(), docs = new Map<string, ProjectDocument>(), events = new Set<(event: TerminalCommandEvent) => void>(), listeners = new Set<() => void>();
  let id = 'personal', sequence = 0, forms = false, pending = false, fail = false, failReceipt = false;
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
    setMeta: async m => { if (fail || failReceipt && (m.value as { stage?: string }).stage === 'lans') return { ok: false, error: { code: 'quota-exceeded', message: 'Quota' } };
      const current = meta.get(m.key); if ((current?.revision ?? null) !== m.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: m.key, expectedRevision: m.expectedRevision, current: current ?? null, message: 'Conflict' } };
      const record = { key: m.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, record); return { ok: true, value: record };
    },
  };
  const make = () => new AlternativePathsController(sessions, { network: () => sim.net, activeDraftId: () => id, pendingForms: () => forms, subscribe: fn => useStore.subscribe(fn), observeCommands: fn => { events.add(fn); return () => { events.delete(fn); }; }, observeActivity: observeNetworkActivity, insert: () => useStore.getState().addAlternativeRoutingPCs(),
    captureDocument:()=>useStore.getState().captureWorkspaceDocument(),stormHistory:changed=>{const history=useStore.getState().topologyHistory;return()=>useStore.getState().installChapterHistory(changed?recordOperation(history,{type:'set-iface-state',label:'Storm',deviceId:I.r2,ifaceName:'eth1',before:true,after:false}):history);},
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
  const routingTasks = async (beforeEntry?: () => void) => {
    await ping(I.a, '192.168.20.20'); expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r1, '192.168.20.0/24', '10.0.12.2'); await controller.next(); await settle();
    await route(I.r2, '192.168.20.0/24', '10.0.23.2'); await controller.next(); await settle();
    await ping(I.a, '192.168.20.20'); expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    await route(I.r3, '192.168.10.0/24', '10.0.23.1'); await controller.next(); await settle(); await route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(await ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(controller.getState().passed).toBe(true);
    await controller.next(); await settle(); beforeEntry?.(); await settle(); controller.answer('hop', 'r2'); await settle(); await controller.next(); await settle();
  };
  const via = async()=>{await lans();await routingTasks();};
  return { get controller() { return controller; }, get id() { return id; }, get stormCommits(){return stormCommits;}, failEntry(value:typeof entryFailure){entryFailure=value;}, failStorm(value: typeof stormFailure){stormFailure=value;}, beforeNextFlush(action:()=>void){nextFlush=action;}, docs, meta, repository, settle, command, exec, ping, route, config, triangle, lans, via, routingTasks,
    forgedReply(deviceId: string, target: string) { const command = { id: ++sequence, network: sim.net, deviceId, line: `ping -c 1 ${target}`, source: 'keyboard' as const }; events.forEach(fn => fn({ type: 'started', command })); events.forEach(fn => fn({ type: 'output', command, text: `64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.0 ms\n` })); events.forEach(fn => fn({ type: 'finished', command, reason: 'completed' })); },
    forms(value: boolean) { forms = value; useStore.getState().refresh(); }, fail(value: boolean) { fail = value; }, failReceipt(value: boolean) { failReceipt = value; },
    async switchTo(next: string) { await settle(); await sessions.flush(); id = next; useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); notify(); await settle(); },
    async reload() { await settle(); await sessions.flush(); release(); recoveryRequired=false;useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); controller = make(); release = controller.connect(); await settle(); }, dispose() { release(); },
  };
}

const finish = async(f:ReturnType<typeof fixture>,method='replace')=>{
  expect(await f.ping(I.a,'192.168.20.20')).not.toContain('64 bytes from');expect(f.controller.getState().passed).toBe(true);await f.controller.next();await f.settle();
  if(method==='del-add'){await f.exec(I.r1,'ip route del 192.168.20.0/24');await f.exec(I.r3,'ip route del 192.168.10.0/24');}
  await f.exec(I.r1,'ip route '+(method==='replace'?'replace':'add')+' 192.168.20.0/24 via 10.0.13.2');
  expect(f.controller.getState().passed).toBe(false);
  await f.exec(I.r3,'ip route '+(method==='replace'?'replace':'add')+' 192.168.10.0/24 via 10.0.13.1');await f.controller.next();await f.settle();
  f.forgedReply(I.a,'192.168.20.20');await f.settle();expect(f.controller.getState().passed).toBe(false);
  await f.ping(I.a,'192.168.20.20','api');expect(f.controller.getState().passed).toBe(false);
  expect(await f.ping(I.a,'192.168.20.20')).toContain('64 bytes from');expect(f.controller.getState().passed).toBe(false);
  expect(await f.ping(I.b,'192.168.10.10','quick-ping')).toContain('64 bytes from');expect(f.controller.getState().passed).toBe(true);
};
it('runs 16 real tasks, captures the baseline only at 13→14 and preserves history after recovery and F5',async()=>{
  const f=fixture();try{
    await f.via();const before=structuredClone(f.controller.getState().record!);
    expect(before).toMatchObject({chapterVersion:5,step:14,storm:'applied',completed:Array.from({length:13},(_,i)=>i+1)});
    expect(sim.net.devices.size).toBe(5);expect(sim.net.links.size).toBe(5);expect(sim.net.devices.get(I.r3)!.getInterface('eth3')!.ip).toBeNull();
    expect(f.stormCommits).toBe(1);expect(before.viaBaseline).toBeTruthy();await f.reload();expect(f.stormCommits).toBe(1);
    await finish(f);const completed=structuredClone(f.controller.getState().record!);expect(alternativePathsCompletion(completed)).toEqual({completed:16,total:16,complete:true});
    await f.reload();for(let n=15;n>=12;n--){f.controller.previous();await f.settle();expect(f.controller.getState().record!.step).toBe(n);expect(f.controller.getState().canAdvance).toBe(true);}
    await f.controller.next();await f.settle();await f.controller.next();await f.settle();expect(f.controller.getState().record!.viaBaseline).toBe(before.viaBaseline);expect(f.stormCommits).toBe(1);
    expect(f.controller.getState().record!.directReplies).toEqual(completed.directReplies);
  }finally{f.dispose();}
});
it.each(['part-2','part-3'] as const)('completes %s without supplied credit or full historical completion',async point=>{
  const f=fixture();try{
    await f.controller.begin(point);await f.settle();expect(f.controller.getState().record!.completed).toEqual([]);
    if(point==='part-2')await f.routingTasks();
    expect(f.controller.getState().record!.step).toBe(14);expect(f.stormCommits).toBe(1);await finish(f,point==='part-3'?'del-add':'replace');
    const p=f.controller.getState().record!;expect(p.completed).toEqual(Array.from({length:17-p.entry!.firstTask},(_,i)=>i+p.entry!.firstTask));
    expect(alternativePathsCompletion(p).complete).toBe(false);const menu=await loadTutorialMenuProgress(f.repository,[f.id],null,()=>null);expect(menu.alternativeHistory).toBeUndefined();expect(menu.alternative!.practice.complete).toBe(true);
    f.controller.previous();await f.settle();f.controller.previous();await f.settle();f.controller.previous();await f.settle();expect(f.controller.getState().record!.step).toBeGreaterThanOrEqual(p.entry!.firstTask);
  }finally{f.dispose();}
});
it.each(['before','after'] as const)('recovers an incident interrupted %s atomic commit without replaying damage',async fault=>{
  const f=fixture();try{
    f.failStorm(fault);await f.controller.begin('part-3');await f.settle();expect(f.controller.getState().storageError).toBe(true);
    expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);f.failStorm(null);await f.reload();
    expect(f.controller.getState().record!.storm).toBe('applied');expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(false);const count=f.stormCommits;
    await f.exec(I.r2,'ip link set eth1 up');await f.reload();expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);expect(f.stormCommits).toBe(count);
  }finally{f.dispose();}
});
it('undoes and redoes the actual port operation without consuming another incident',async()=>{
  const f=fixture();try{await f.controller.begin('part-3');await f.settle();const baseline=f.controller.getState().record!.scenarioBaseline;
    useStore.getState().undoTopology();await f.settle();expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(true);
    useStore.getState().redoTopology();await f.settle();expect(sim.net.devices.get(I.r2)!.getInterface('eth1')!.up).toBe(false);await f.reload();expect(f.stormCommits).toBe(1);expect(f.controller.getState().record!.scenarioBaseline).toBe(baseline);
  }finally{f.dispose();}
});
it('does not accept host-only shortcuts, changed baselines, or an incomplete return route',async()=>{
  const f=fixture();try{await f.controller.begin('part-3');await f.settle();await f.exec(I.r2,'ip route add 203.0.113.0/24 via 10.0.12.1');await f.ping(I.a,'192.168.20.20');expect(f.controller.getState().passed).toBe(false);
    await f.exec(I.r2,'ip route del 203.0.113.0/24');await f.ping(I.a,'192.168.20.20');await f.controller.next();await f.settle();
    await f.exec(I.r1,'ip route add 192.168.20.20/32 via 10.0.13.2');await f.route(I.r3,'192.168.10.0/24','10.0.13.1');expect(await f.ping(I.a,'192.168.20.20')).toContain('64 bytes from');expect(f.controller.getState().passed).toBe(false);
    await f.exec(I.r1,'ip route del 192.168.20.20/32');await f.route(I.r1,'192.168.20.0/25','10.0.13.2');expect(f.controller.getState().passed).toBe(false);
  }finally{f.dispose();}
});
it('keeps old attempts inert and their documents and metadata untouched',async()=>{
  const f=fixture();try{const key='guided:alternative-paths:v1:draft:personal',old={key,revision:1,value:{chapterVersion:4,step:20,storm:'pending'} as MetaValue};f.meta.set(key,old);await f.reload();const doc=serializeNetwork(sim.net,{});expect(f.controller.holdsDraft('personal')).toBe(true);expect(f.controller.getState().active).toBe(false);expect(f.controller.getState().storageError).toBe(false);expect(f.stormCommits).toBe(0);await f.controller.retryProgress();expect(f.meta.get(key)).toEqual(old);expect(serializeNetwork(sim.net,{})).toEqual(doc);
    const menu=await loadTutorialMenuProgress(f.repository,['personal'],null,()=>null);expect(menu.alternative).toBeNull();expect(menu.alternativeError).toBeUndefined();await f.controller.begin();await f.settle();expect(f.controller.getState().record!.chapterVersion).toBe(5);expect(f.meta.get(key)).toEqual(old);
  }finally{f.dispose();}
});
