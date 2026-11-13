import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { sim } from '../sim';
import { disposeNetwork } from '../engine/networkLifecycle';
import { IpDevice } from '../engine/ipdevice';
import { Shell } from '../commands/shell';
import { observeNetworkActivity } from '../networkObservations';
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import type { MetaRecord, MetaValue, ProjectDocument } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import type { OpenDocumentOptions } from '../persistence/sessionController';
import { normalizeProjectDocument } from '../projects/projectDocument';
import type { SessionControllerState } from '../persistence/sessionTypes';
import { LpmController } from './LpmController';
import { LpmProgressStore, LPM_PROGRESS_PREFIX, readLpmProgress } from './lpmProgress';
import { LPM_IDS as I, LPM_TARGET, LPM_LONG, LPM_SHORT, lpmConditions } from './lpmChapter';
import { createLpmAttempt } from './lpmAttempt';
import { chapterRestartDocument, readChapterCheckpoint } from './chapterCheckpoints';

vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
vi.setConfig({ testTimeout: 15000 });
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });
function fixture() {
  const meta = new Map<string, MetaRecord>(), docs = new Map<string, ProjectDocument>(), listeners = new Set<() => void>(), commands = new Set<(e: TerminalCommandEvent) => void>();
  let id = 'personal', sequence = 0, forms = false, fail = false, interrupted: 'before' | 'after' | null = null;
  useStore.getState().importJson(JSON.stringify({ app: 'netsim', version: 1, devices: [], links: [] })); docs.set(id, useStore.getState().captureWorkspaceDocument());
  const notify = () => listeners.forEach(fn => fn());
  const sessions = {
    getState: (): SessionControllerState => ({ phase: 'ready', session: null, activeDraftId: id, error: null, pendingShare: false, drafts: [...docs.keys()].map(id => ({ id, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null })) }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, hasPendingOperations: () => false,
    flush: async () => { if (fail) return { ok: false as const, error: { code: 'quota-exceeded' as const, message: 'Quota' } }; docs.set(id, useStore.getState().captureWorkspaceDocument()); return { ok: true as const, value: undefined }; },
    openDocument: async (doc: ProjectDocument, options?: OpenDocumentOptions) => {
      await sessions.flush(); const init = options!.initialization!;
      if (interrupted === 'before') return { ok: false as const, error: { code: 'quota-exceeded' as const, message: 'Quota' } };
      for (const m of init.control) { expect(meta.has(m.key)).toBe(false); meta.set(m.key, { key: m.key, revision: 1, value: structuredClone(m.value) }); }
      docs.set(init.id, structuredClone(doc));
      if (interrupted === 'after') return { ok: false as const, error: { code: 'runtime-changed' as const, message: 'Reopen committed attempt' } };
      id = init.id; useStore.getState().importJson(JSON.stringify(doc.topology)); notify(); return { ok: true as const, value: id };
    },
  };
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async m => {
      if (fail) return { ok: false, error: { code: 'quota-exceeded', message: 'Quota' } };
      const current = meta.get(m.key); if ((current?.revision ?? null) !== m.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: m.key, expectedRevision: m.expectedRevision, current: current ?? null, message: 'Conflict' } };
      const record = { key: m.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, record); return { ok: true, value: record };
    },
  };
  const make = () => new LpmController(sessions, { network: () => sim.net, activeDraftId: () => id, pendingForms: () => forms, restarting: () => false, subscribe: fn => useStore.subscribe(fn), observeCommands: fn => { commands.add(fn); return () => { commands.delete(fn); }; }, observeActivity: observeNetworkActivity, openAttempt: sessions.openDocument }, new LpmProgressStore(repository, sessions));
  let controller = make(), release = controller.connect();
  const settle = async () => { for (let n = 0; n < 4; n++) { await new Promise(r => setTimeout(r, 0)); await controller.flushProgress(); } };
  const exec = (deviceId: string, line: string, source: 'keyboard' | 'api' | 'quick-ping' = 'keyboard') => {
    const command = { id: ++sequence, network: sim.net, deviceId, line, source }; let out = '';
    commands.forEach(fn => fn({ type: 'started', command }));
    new Shell(sim.net.devices.get(deviceId) as IpDevice).exec(line, { write: text => { out += text; commands.forEach(fn => fn({ type: 'output', command, text })); } }, () => commands.forEach(fn => fn({ type: 'finished', command, reason: 'completed' })));
    useStore.getState().refresh(); return () => out;
  };
  const ping = async (from: string = I.a, source: 'keyboard' | 'api' | 'quick-ping' = 'keyboard') => { const out = exec(from, `ping -c 1 ${LPM_TARGET}`, source); sim.net.scheduler.advanceTo(sim.net.now + 6000); await settle(); return out(); };
  const toFour = async () => {
    await controller.begin(); await settle(); expect(await ping()).toContain('64 bytes from'); await controller.next(); await settle();
    controller.inspectRoutes(); await settle(); controller.answer('both'); await settle(); await controller.next(); await settle(); controller.answer('25'); await settle(); await controller.next(); await settle();
    expect(controller.getState().record!.step).toBe(4);
  };
  const toFive = async () => { await toFour(); expect(exec(I.r1, 'ip route del 192.168.80.128/25')()).toBe(''); await settle(); await ping(); await controller.next(); await settle(); expect(controller.getState().record!.step).toBe(5); };
  return { get controller() { return controller; }, get id() { return id; }, docs, meta, settle, exec, ping, toFour, toFive,
    fail(value: boolean) { fail = value; }, interrupted(value: typeof interrupted) { interrupted = value; }, forms(value: boolean) { forms = value; useStore.getState().refresh(); },
    async switchTo(key: string) { await sessions.flush(); id = key; useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); notify(); await settle(); },
    async reload() { await settle(); await sessions.flush(); release(); useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); controller = make(); release = controller.connect(); await settle(); },
    forged() { const command = { id: ++sequence, network: sim.net, deviceId: I.a, line: `ping ${LPM_TARGET}`, source: 'keyboard' as const }; commands.forEach(fn => fn({ type: 'started', command })); commands.forEach(fn => fn({ type: 'output', command, text: `64 bytes from ${LPM_TARGET}: icmp_seq=1 ttl=64 time=1.0 ms\n` })); },
    dispose() { release(); },
  };
}
it('chooses the real long request, short return and changes path only after actual /25 removal', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); const initial = f.controller.getState().record!;
    expect(initial.completed).toEqual([]); expect(lpmConditions(sim.net)).toMatchObject({ initial: true, original: true });
    expect([...sim.net.links.values()].every(link => link.operational)).toBe(true);
    expect(lpmConditions(sim.net).matches.map(r => r.prefix)).toEqual([24, 25]);
    await f.ping(I.a, 'api'); f.forged(); await f.settle(); expect(f.controller.getState().historical).toBe(false);
    await f.ping(I.b); expect(f.controller.getState().historical).toBe(false);
    expect(await f.ping()).toContain('64 bytes from'); expect(f.controller.getState().record!.initial).toMatchObject({ request: LPM_LONG, reply: [...LPM_SHORT].reverse() });
    await f.controller.next(); await f.settle(); f.controller.answer('both'); await f.settle(); expect(f.controller.getState().historical).toBe(false);
    f.controller.inspectRoutes(); await f.settle(); f.controller.answer('only24'); expect(f.controller.getState().answerError).toBe(true);
    f.controller.answer('both'); await f.settle(); await f.controller.next(); await f.settle(); f.controller.answer('24'); expect(f.controller.getState().historical).toBe(false);
    f.controller.answer('25'); await f.settle(); await f.controller.next(); await f.settle();
    await f.ping(); expect(f.controller.getState().historical).toBe(false);
    f.exec(I.r1, 'ip route del 192.168.80.128/25'); await f.settle(); expect(f.controller.getState().historical).toBe(false);
    expect(await f.ping(I.a, 'quick-ping')).toContain('64 bytes from'); expect(f.controller.getState().record!.short?.request).toEqual(LPM_SHORT);
  } finally { f.dispose(); }
});
it.each(['ip route', 'ip -4 route show', 'ip route list'])('recognizes %s on R1 as consulting the real table, without crediting the answer', async line => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); await f.ping(); await f.controller.next(); await f.settle();
    f.exec(I.r2, line); await f.settle(); expect(f.controller.getState().record!.inspected).toBe(false);
    f.exec(I.r1, line, 'api'); await f.settle(); expect(f.controller.getState().record!.inspected).toBe(false);
    f.exec(I.r1, line); await f.settle(); expect(f.controller.getState().record!.inspected).toBe(true); expect(f.controller.getState().record!.completed).toEqual([1]);
    f.controller.answer('only24'); expect(f.controller.getState().answerError).toBe(true);
    f.controller.answer('both'); await f.settle(); expect(f.controller.getState().record!.completed).toEqual([1, 2]);
    await f.reload(); expect(f.controller.getState().record!.compared).toBe(true);
  } finally { f.dispose(); }
});
it.each(['192.168.80.128/25', '192.168.80.128/26', '192.168.80.128/27', '192.168.80.128/30', '192.168.80.130/32'])('accepts a real matching %s route and a fresh request through the long path', async dest => {
  const f = fixture(); try {
    await f.toFive(); expect(f.exec(I.r1, `ip route add ${dest} via 10.6.12.2 dev eth2`)()).toBe(''); await f.settle(); expect(f.controller.getState().historical).toBe(false);
    expect(await f.ping()).toContain('64 bytes from'); expect(f.controller.getState().record!.completed).toEqual([1, 2, 3, 4, 5]); expect(f.controller.getState().record!.restored?.request).toEqual(LPM_LONG);
  } finally { f.dispose(); }
});
it.each([
  'ip route add 192.168.80.0/25 via 10.6.12.2', // destination outside prefix
  'ip route add 192.168.80.128/25 via 10.6.15.2', // valid ping, wrong path
  'ip route add 192.168.80.0/23 via 10.6.12.2', // less specific
])('rejects %s despite an old or successful ping', async command => {
  const f = fixture(); try { await f.toFive(); f.exec(I.r1, command); await f.settle(); expect(await f.ping()).toContain('64 bytes from'); expect(f.controller.getState().historical).toBe(false); } finally { f.dispose(); }
});
it('rejects loss of the original /24, even if the detour works', async () => {
  const f = fixture(); try {
    await f.toFive(); f.exec(I.r1, 'ip route del 192.168.80.0/24'); f.exec(I.r1, 'ip route add 192.168.80.128/25 via 10.6.12.2'); await f.settle(); await f.ping(); expect(f.controller.getState().historical).toBe(false);
  } finally { f.dispose(); }
});
it('preserves historical review, F5, draft isolation and never credits unperformed tasks', async () => {
  const f = fixture(); try {
    await f.toFive(); const draft = f.id, before = structuredClone(f.controller.getState().record!);
    await f.reload(); expect(f.controller.getState().record).toEqual(before); expect(f.controller.getState().historical).toBe(false);
    for (let n = 4; n > 0; n--) { f.controller.previous(); await f.settle(); expect(f.controller.getState().canAdvance).toBe(true); }
    await f.reload(); expect(f.controller.getState().record!.step).toBe(1); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().canAdvance).toBe(true);
    for (let n = 1; n < 5; n++) { await f.controller.next(); await f.settle(); }
    expect(f.controller.getState().record!.completed).toEqual([1, 2, 3, 4]); await f.switchTo('personal'); expect(f.controller.getState().active).toBe(false); await f.switchTo(draft); expect(f.controller.getState().record!.completed).toEqual([1, 2, 3, 4]);
  } finally { f.dispose(); }
});
it('does not turn a running ping started before the new route into task 5 evidence', async () => {
  const f = fixture(); try {
    await f.toFive(); f.exec(I.a, `ping -c 1 ${LPM_TARGET}`);
    f.exec(I.r1, 'ip route add 192.168.80.130/32 via 10.6.12.2');
    sim.net.scheduler.advanceTo(sim.net.now + 6000); await f.settle(); expect(f.controller.getState().historical).toBe(false);
    await f.ping(); expect(f.controller.getState().historical).toBe(true);
  } finally { f.dispose(); }
});
it('reports both current checks independently without erasing historical credit, including F5', async()=>{
 const f=fixture();try{
  await f.toFive();expect(f.controller.getState()).toMatchObject({shortRoute:true,longRouteProved:false});
  f.exec(I.r1,'ip route add 192.168.80.130/32 via 10.6.12.2');await f.settle();expect(f.controller.getState().longRouteProved).toBe(false);
  await f.ping();await f.reload();expect(f.controller.getState()).toMatchObject({shortRoute:true,longRouteProved:true,historical:true,passed:true});
  f.exec(I.r1,'ip route replace 192.168.80.130/32 via 10.6.15.2');await f.settle();expect(f.controller.getState()).toMatchObject({shortRoute:true,longRouteProved:false,historical:true,passed:false});
  f.exec(I.r1,'ip route replace 192.168.80.0/24 via 10.6.12.2');await f.settle();expect(f.controller.getState()).toMatchObject({shortRoute:false,longRouteProved:false,historical:true});
  await f.reload();expect(f.controller.getState()).toMatchObject({shortRoute:false,longRouteProved:false,historical:true});
 }finally{f.dispose();}
});
it('recovers task 4 after F5 without replaying the old ping or inventing the new short-path proof', async () => {
  const f = fixture(); try {
    await f.toFour(); f.exec(I.r1, 'ip route del 192.168.80.128/25'); await f.settle(); await f.reload();
    expect(f.controller.getState().record).toMatchObject({ step: 4, completed: [1, 2, 3], short: null });
    expect(f.controller.getState().canAdvance).toBe(false); await f.ping(); expect(f.controller.getState().canAdvance).toBe(true);
  } finally { f.dispose(); }
});
it('keeps pending progress in memory on quota failure and retries it without changing another plan', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); f.fail(true); await f.ping(); expect(f.controller.getState().storageError).toBe(true); expect(f.controller.getState().canAdvance).toBe(false);
    expect(f.controller.getState().record!.completed).toEqual([1]); f.fail(false); await f.controller.retryProgress(); await f.settle(); expect(f.controller.getState().storageError).toBe(false);
    expect((f.meta.get(LPM_PROGRESS_PREFIX + f.id)!.value as unknown as { completed: number[] }).completed).toEqual([1]);
  } finally { f.dispose(); }
});
it('refuses a concurrent progress writer and preserves its committed record', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); const key = LPM_PROGRESS_PREFIX + f.id;
    const other = structuredClone(f.meta.get(key)!); other.revision++; f.meta.set(key, other);
    await f.ping(); expect(f.controller.getState().storageError).toBe(true); expect(f.controller.getState().canAdvance).toBe(false);
    expect(f.meta.get(key)).toEqual(other); expect(f.controller.getState().record!.completed).toEqual([1]);
    await f.controller.retryProgress(); expect(f.meta.get(key)).toEqual(other); expect(f.controller.getState().storageError).toBe(true);
  } finally { f.dispose(); }
});
it.each(['before', 'after'] as const)('opens atomically when interrupted %s the commit', async fault => {
  const f = fixture(); try {
    f.interrupted(fault); await f.controller.begin(); await f.settle(); expect(f.id).toBe('personal');
    if (fault === 'before') { expect(f.docs.size).toBe(1); expect(f.meta.size).toBe(0); }
    else { expect(f.docs.size).toBe(2); expect(f.meta.size).toBe(2); const id = [...f.docs.keys()].find(id => id !== 'personal')!; await f.switchTo(id); expect(f.controller.getState().record!.completed).toEqual([]); }
  } finally { f.dispose(); }
});
it('blocks real ping evidence with pending forms or reused device identities', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); f.forms(true); await f.ping(); expect(f.controller.getState().historical).toBe(false); f.forms(false);
    sim.net.devices.get(I.a)!.interfaces[0].mac = '02:ff:ff:ff:ff:ff'; useStore.getState().refresh(); await f.ping(); expect(f.controller.getState().warning).toBe('identity'); expect(f.controller.getState().historical).toBe(false);
  } finally { f.dispose(); }
});
it('rejects contradictory or future progress and keeps the initial restart contract empty', () => {
  const a = createLpmAttempt(), p = a.progress;
  expect(() => readLpmProgress({ ...p, completed: [5] }, p.draftId)).toThrow();
  expect(() => readLpmProgress({ ...p, chapterVersion: 2 }, p.draftId)).toThrow();
  expect(readChapterCheckpoint(a.checkpoint, p.draftId, 'longest-prefix-match').progress).toEqual(p);
  const doc = structuredClone(a.document); doc.topology.devices.find(d => d.id === I.r1)!.routes.pop();
  expect(chapterRestartDocument(a.checkpoint, doc, p as unknown as MetaValue)).toEqual(normalizeProjectDocument(a.document));
  doc.topology.devices.find(d => d.id === I.a)!.ifaces[0].mac = '02:ff:ff:ff:ff:ff';
  expect(() => chapterRestartDocument(a.checkpoint, doc, p as unknown as MetaValue)).toThrow('checkpoint-conflict');
});
it('preserves independent equipment during restart and blocks ambiguous external wiring', () => {
  const a = createLpmAttempt(), current = structuredClone(a.document);
  const external = structuredClone(current.topology.devices.find(d => d.id === I.a)!);
  external.id = 'independent'; external.name = 'My PC'; external.ifaces[0].mac = '02:ff:ff:ff:ff:ff'; external.x += 500;
  current.topology.devices.push(external); current.topology.devices.find(d => d.id === I.r1)!.routes.pop();
  const before = structuredClone(current);
  const restored = chapterRestartDocument(a.checkpoint, current, a.progress as unknown as MetaValue);
  expect(restored.topology.devices.find(d => d.id === external.id)).toEqual(external); expect(current).toEqual(before);
  current.topology.links.push({ id: 'external-link', a: [external.id, 'eth0'], b: [I.r1, 'eth3'] });
  expect(() => chapterRestartDocument(a.checkpoint, current, a.progress as unknown as MetaValue)).toThrow('checkpoint-conflict');
});
