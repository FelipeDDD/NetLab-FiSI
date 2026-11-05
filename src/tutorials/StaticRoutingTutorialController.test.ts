import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { sim } from '../sim';
import { disposeNetwork } from '../engine/networkLifecycle';
import { createDevice } from '../engine/factory';
import { IpDevice } from '../engine/ipdevice';
import { serializeNetwork } from '../engine/serialize';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import type { MetaRecord, ProjectDocument, MetaValue } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import type { SessionControllerState } from '../persistence/sessionTypes';
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import { StaticRoutingTutorialController } from './StaticRoutingTutorialController';
import { StaticRoutingProgressStore, STATIC_PROGRESS_PREFIX, readStaticRoutingProgress } from './staticRoutingProgress';
import { STATIC_IDS as I, STATIC_PAIRS, STATIC_BASE_IDS, staticRoutingDocument, staticRoutingConditions, staticTarget } from './staticRoutingChapter';
import { staticRoutingCompletion } from './completion';
import { chapterRestartDocument, readChapterCheckpoint } from './chapterCheckpoints';
import { loadTutorialMenuProgress } from './menuProgress';
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });
function fixture() {
  const meta = new Map<string, MetaRecord>(), docs = new Map<string, ProjectDocument>(), events = new Set<(e: TerminalCommandEvent) => void>(), listeners = new Set<() => void>();
  let id = 'personal', commandId = 0, forms = false, pending = false, failWrite = false, failExpansionReceipt = false;
  useStore.getState().importJson(JSON.stringify(staticRoutingDocument().topology)); docs.set(id, useStore.getState().captureWorkspaceDocument());
  const notify = () => listeners.forEach(fn => fn());
  const sessions = {
    getState: (): SessionControllerState => ({ phase: 'ready', session: null, activeDraftId: id, error: null, pendingShare: false, drafts: [...docs.keys()].map(key => ({ id: key, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null })) }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, hasPendingOperations: () => pending,
    flush: async () => { docs.set(id, useStore.getState().captureWorkspaceDocument()); return { ok: true as const, value: undefined }; },
    openDocument: async (document: ProjectDocument) => { await sessions.flush(); pending = true; id = 'routing-' + docs.size; useStore.getState().importJson(JSON.stringify(document.topology)); docs.set(id, document); pending = false; notify(); return { ok: true as const, value: id }; },
  };
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async m => { if (failWrite || failExpansionReceipt && (m.value as { stage?: string }).stage === 'lan-c') return { ok: false, error: { code: 'quota-exceeded', message: 'Quota' } };
      const current = meta.get(m.key); if ((current?.revision ?? null) !== m.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: m.key, expectedRevision: m.expectedRevision, current: current ?? null, message: 'Conflict' } };
      const r = { key: m.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, r); return { ok: true, value: r };
    },
  };
  const make = () => new StaticRoutingTutorialController(sessions, { network: () => sim.net, activeDraftId: () => id, pendingForms: () => forms, subscribe: fn => useStore.subscribe(fn), observeCommands: fn => { events.add(fn); return () => { events.delete(fn); }; }, expand: () => useStore.getState().addStaticRoutingLan() }, new StaticRoutingProgressStore(repository, sessions));
  let controller = make(), release = controller.connect();
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 0)); await controller.flushProgress(); } };
  const submit = (deviceId: string, line: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => {
    const command = { id: ++commandId, network: sim.net, deviceId, line, source }; let output = '';
    events.forEach(fn => fn({ type: 'started', command }));
    const running = new Shell(sim.net.devices.get(deviceId) as IpDevice).exec(line, { write: text => { output += text; events.forEach(fn => fn({ type: 'output', command, text })); } }, () => events.forEach(fn => fn({ type: 'finished', command, reason: 'completed' })));
    useStore.getState().refresh(); return { running, output: () => output };
  };
  const ping = async (pair: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => { const p = submit(I[pair[0] as 'a'], `ping ${staticTarget(sim.net, pair[1] as 'a')} -c 1`, source); sim.net.scheduler.advanceTo(sim.net.now + 6000); await settle(); return p.output(); };
  const config = async (key: string, address: string, gateway: string | null = null, iface = 'eth0') => { expect(useStore.getState().setInterfaceIpv4(key, iface, { mode: 'static', ip: parseCidr(address), gateway: gateway ? parseIp(gateway) : null, dns: null })).toBeNull(); await settle(); };
  const route = async (key: string, dest: string, via: string) => { expect(submit(key, `ip route replace ${dest} via ${via}`).output()).toBe(''); await settle(); };
  const line = async () => {
    await controller.begin(); await settle(); await ping('ab'); await controller.next(); await settle(); controller.chooseMissing('r1'); await settle(); await controller.next(); await settle();
    await route(I.r1, '192.168.20.0/24', '10.0.12.2'); await route(I.r2, '192.168.20.0/24', '10.0.23.2'); await controller.next(); await settle();
    await route(I.r3, '192.168.10.0/24', '10.0.23.1'); await route(I.r2, '192.168.10.0/24', '10.0.12.1'); await controller.next(); await settle(); await ping('ab'); await ping('ba');
  };
  const switchTo = async (next: string) => { await settle(); await sessions.flush(); id = next; useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); notify(); await settle(); };
  return { get controller() { return controller; }, get id() { return id; }, docs, meta, repository, settle, submit, ping, route, config, line, switchTo,
    forms(value: boolean) { forms = value; useStore.getState().refresh(); }, fail(value: boolean) { failWrite = value; }, failReceipt(value: boolean) { failExpansionReceipt = value; },
    async reload() { await settle(); await sessions.flush(); release(); useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); controller = make(); release = controller.connect(); await settle(); }, dispose() { release(); },
  };
}
it('completes eight real tasks, preserves the evolving topology and restores evidence after F5 and plan switches', async () => {
  const f = fixture(); try {
    const personal = structuredClone(f.docs.get('personal')); await f.line();
    expect(f.controller.getState().record?.step).toBe(5); expect(f.controller.getState().passed).toBe(true);
    const original = serializeNetwork(sim.net, Object.fromEntries(useStore.getState().nodes.map(n => [n.id, n.position])));
    await f.controller.next(); await f.settle(); expect(f.controller.getState().record?.step).toBe(6); expect(sim.net.devices.size).toBe(9);
    for (const d of original.devices) { const now = serializeNetwork(sim.net, Object.fromEntries(useStore.getState().nodes.map(n => [n.id, n.position]))).devices.find(n => n.id === d.id)!; expect(now).toEqual(d); }
    useStore.getState().undoTopology(); await f.settle(); expect(f.controller.getState().warning).toBe('missing'); expect(sim.net.devices.size).toBe(7);
    useStore.getState().redoTopology(); await f.settle(); expect(sim.net.devices.size).toBe(9);
    await f.reload(); expect(f.controller.getState().record?.step).toBe(6); expect(sim.net.devices.size).toBe(9);
    await f.config(I.r2, '192.168.30.254/24', null, 'eth2'); await f.config(I.c, '192.168.30.50/24', '192.168.30.254'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.route(I.r1, '192.168.30.0/24', '10.0.12.2'); await f.route(I.r3, '192.168.30.0/24', '10.0.23.1'); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.ping('ab', 'api'); expect(f.controller.getState().replies.ab).toBe(false);
    for (const pair of STATIC_PAIRS) expect(await f.ping(pair, pair === 'ca' ? 'quick-ping' : 'keyboard')).toContain('64 bytes from');
    expect(f.controller.getState().passed).toBe(true); expect(staticRoutingCompletion(f.controller.getState().record!)).toEqual({ completed: 8, total: 8, complete: true });
    const saved = structuredClone(f.controller.getState().record); const attempt = f.id;
    await f.reload(); expect(f.controller.getState().record).toEqual(saved); expect(f.controller.getState().passed).toBe(true);
    await f.switchTo('personal'); expect(f.controller.getState().active).toBe(false); expect(f.docs.get('personal')).toEqual(personal);
    await f.switchTo(attempt); expect(f.controller.getState().passed).toBe(true);
    const menu = await loadTutorialMenuProgress(f.repository, [attempt, 'personal'], null, id => f.docs.get(id)!); expect(menu.routing?.progress.complete).toBe(true); expect(menu.router).toBeNull();
    await f.controller.begin(); await f.settle(); expect(f.id).not.toBe(attempt); expect(f.controller.getState().record?.completed).toEqual([]); expect(f.docs.get(attempt)!.topology.devices).toHaveLength(9);
  } finally { f.dispose(); }
});
it('requires attributable network failures, identifies actual missing routes and accepts equivalent static routes', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); await f.ping('ab', 'api'); expect(f.controller.getState().passed).toBe(false);
    f.submit(I.a, 'ping -c 1 192.168.10.99'); sim.net.scheduler.advanceTo(sim.net.now + 6000); await f.settle(); expect(f.controller.getState().passed).toBe(false);
    await f.ping('ab'); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle(); f.controller.chooseMissing('r3'); expect(f.controller.getState().answerError).toBe(true); expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); expect(staticRoutingConditions(sim.net).firstMissing).toBe(I.r2); f.controller.chooseMissing('r2'); await f.settle(); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle();
    await f.route(I.r2, '192.168.20.20/32', '10.0.23.2'); expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r2, '192.168.16.0/20', '10.0.23.2'); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle();
    await f.route(I.r3, '0.0.0.0/0', '10.0.23.1'); await f.route(I.r2, '0.0.0.0/0', '10.0.12.1'); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle();
    await f.ping('ab'); expect(f.controller.getState().passed).toBe(false); await f.ping('ba'); expect(f.controller.getState().passed).toBe(true);
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.2'); expect(f.controller.getState().passed).toBe(false); expect(f.controller.getState().replies.ab).toBe(false);
  } finally { f.dispose(); }
});
it('recovers an interrupted expansion receipt once, while preserving configured routes and moved devices', async () => {
  const f = fixture(); try {
    await f.line(); useStore.setState({ nodes: useStore.getState().nodes.map(n => n.id === I.r2 ? { ...n, position: { x: 1400, y: 200 } } : n) });
    const before = serializeNetwork(sim.net, {}); f.failReceipt(true); await f.controller.next(); await f.settle(); expect(f.controller.getState().storageError).toBe(true);
    expect((f.meta.get(STATIC_PROGRESS_PREFIX + f.id)!.value as { stage: string }).stage).toBe('expanding'); f.failReceipt(false); await f.reload();
    expect(f.controller.getState().record?.stage).toBe('lan-c'); expect(f.controller.getState().record?.step).toBe(6); expect(sim.net.devices.size).toBe(9); expect(useStore.getState().nodes.find(n => n.id === I.r2)!.position).toEqual({ x: 1400, y: 200 });
    expect(serializeNetwork(sim.net, {}).devices.filter(d => STATIC_BASE_IDS.includes(d.id))).toEqual(before.devices); await f.reload(); expect(sim.net.devices.size).toBe(9);
  } finally { f.dispose(); }
});
it('accepts early valid configuration and independent simultaneous real pings without manufacturing an initial failure', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.route(I.r2, '192.168.20.0/24', '10.0.23.2');
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await f.ping('ab')).toContain('64 bytes from'); await f.controller.next(); await f.settle();
    f.controller.chooseMissing('none'); await f.settle(); expect(f.controller.getState().record?.missingAnswer).toBe('none');
    for (let step = 3; step <= 5; step++) { await f.controller.next(); await f.settle(); expect(f.controller.getState().record?.step).toBe(step); }
    const a = f.submit(I.a, 'ping -c 1 192.168.20.20'), b = f.submit(I.b, 'ping -c 1 192.168.10.10', 'quick-ping');
    sim.net.scheduler.advanceTo(sim.net.now + 6000); await f.settle();
    expect(a.output()).toContain('64 bytes from 192.168.20.20'); expect(b.output()).toContain('64 bytes from 192.168.10.10'); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('protects occupied ports, pending forms, failed writes and incompatible progress', async () => {
  const f = fixture(); try {
    f.forms(true); await f.controller.begin(); expect(f.id).toBe('personal'); f.forms(false); await f.line();
    const extra = createDevice(sim.net, 'host'); sim.net.connect(I.r2, extra.id, { aIface: 'eth2' }); useStore.getState().refresh(); await f.settle();
    // Configuration changes invalidate real reply receipts, so prove them again.
    await f.ping('ab'); await f.ping('ba'); const before = serializeNetwork(sim.net, {}); await f.controller.next(); await f.settle();
    expect(f.controller.getState().warning).toBe('port'); expect(serializeNetwork(sim.net, {})).toEqual(before); expect(sim.net.devices.has(I.c)).toBe(false);
    expect(() => readStaticRoutingProgress({ ...f.controller.getState().record, step: 8 }, f.id)).toThrow('Incompatible');
  } finally { f.dispose(); }
  const failed = fixture(); try { failed.fail(true); await failed.controller.begin(); await failed.settle(); expect(failed.controller.getState().storageError).toBe(true); expect(sim.net.devices.size).toBe(7); expect(failed.meta.size).toBe(0); } finally { failed.dispose(); }
});
it('restarts only the owned chapter and protects unrelated devices, identities and checkpoint conflicts', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); const initial = useStore.getState().captureWorkspaceDocument(), baseline = structuredClone(f.controller.getState().record!);
    const cp = readChapterCheckpoint({ schemaVersion: 1, kind: 'chapter-checkpoint', draftId: f.id, chapter: 'static-routing', attemptId: crypto.randomUUID(), before: initial, initial, progress: baseline }, f.id, 'static-routing');
    await f.ping('ab'); await f.controller.next(); await f.settle(); f.controller.chooseMissing('r1'); await f.settle(); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.controller.next(); await f.settle(); await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.12.1'); await f.controller.next(); await f.settle(); await f.ping('ab'); await f.ping('ba'); await f.controller.next(); await f.settle();
    const extra = createDevice(sim.net, 'host', { id: 'independent' }); useStore.getState().refresh(); const current = useStore.getState().captureWorkspaceDocument(), progress = f.controller.getState().record! as unknown as MetaValue;
    const reset = chapterRestartDocument(cp, current, progress); expect(reset.topology.devices.filter(d => STATIC_BASE_IDS.includes(d.id))).toEqual(initial.topology.devices); expect(reset.topology.devices.some(d => d.id === I.c)).toBe(false); expect(reset.topology.devices.some(d => d.id === extra.id)).toBe(true);
    const tampered = structuredClone(current); tampered.topology.devices.find(d => d.id === I.c)!.ifaces[0].mac = '02:ff:ff:ff:ff:ff'; expect(() => chapterRestartDocument(cp, tampered, progress)).toThrow('checkpoint-conflict'); expect(current.topology.devices).toHaveLength(10);
  } finally { f.dispose(); }
});
