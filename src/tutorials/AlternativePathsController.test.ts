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
import type { TerminalCommandEvent } from '../terminalCommandEvents';
import { AlternativePathsController } from './AlternativePathsController';
import { AlternativePathsProgressStore, ALTERNATIVE_PROGRESS_PREFIX, readAlternativeProgress } from './alternativePathsProgress';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_LINKS as L, NEIGHBOR_TESTS, TRANSIT_PLAN, alternativePathsDocument, failureBaselineSignature } from './alternativePathsChapter';
import { tutorialFingerprint } from './tutorialProgress';
import { alternativePathsCompletion } from './completion';
import { chapterRestartDocument, readChapterCheckpoint } from './chapterCheckpoints';
import { loadTutorialMenuProgress } from './menuProgress';
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => { useStore.getState().flushAutosave(); disposeNetwork(sim.net); vi.unstubAllGlobals(); });
function fixture() {
  const meta = new Map<string, MetaRecord>(), docs = new Map<string, ProjectDocument>(), events = new Set<(event: TerminalCommandEvent) => void>(), listeners = new Set<() => void>();
  let id = 'personal', sequence = 0, forms = false, pending = false, fail = false, failReceipt = false;
  useStore.getState().importJson(JSON.stringify(alternativePathsDocument().topology)); docs.set(id, useStore.getState().captureWorkspaceDocument());
  const notify = () => listeners.forEach(fn => fn());
  const sessions = {
    getState: (): SessionControllerState => ({ phase: 'ready', session: null, activeDraftId: id, error: null, pendingShare: false, drafts: [...docs.keys()].map(key => ({ id: key, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null })) }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, hasPendingOperations: () => pending,
    flush: async () => { docs.set(id, useStore.getState().captureWorkspaceDocument()); return { ok: true as const, value: undefined }; },
    openDocument: async (document: ProjectDocument) => { await sessions.flush(); pending = true; id = 'alternative-' + docs.size; useStore.getState().importJson(JSON.stringify(document.topology)); docs.set(id, document); pending = false; notify(); return { ok: true as const, value: id }; },
  };
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async m => { if (fail || failReceipt && (m.value as { stage?: string }).stage === 'lans') return { ok: false, error: { code: 'quota-exceeded', message: 'Quota' } };
      const current = meta.get(m.key); if ((current?.revision ?? null) !== m.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: m.key, expectedRevision: m.expectedRevision, current: current ?? null, message: 'Conflict' } };
      const record = { key: m.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(m.value) }; meta.set(m.key, record); return { ok: true, value: record };
    },
  };
  const make = () => new AlternativePathsController(sessions, { network: () => sim.net, activeDraftId: () => id, pendingForms: () => forms, subscribe: fn => useStore.subscribe(fn), observeCommands: fn => { events.add(fn); return () => { events.delete(fn); }; }, observeActivity: observeNetworkActivity, insert: () => useStore.getState().addAlternativeRoutingPCs() }, new AlternativePathsProgressStore(repository, sessions));
  let controller = make(), release = controller.connect();
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 0)); await controller.flushProgress(); } };
  const command = (deviceId: string, line: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => {
    const context = { id: ++sequence, network: sim.net, deviceId, line, source }; let out = '';
    events.forEach(fn => fn({ type: 'started', command: context }));
    const running = new Shell(sim.net.devices.get(deviceId) as IpDevice).exec(line, { write: text => { out += text; events.forEach(fn => fn({ type: 'output', command: context, text })); } }, () => events.forEach(fn => fn({ type: 'finished', command: context, reason: 'completed' })));
    useStore.getState().refresh(); return { running, output: () => out };
  };
  const ping = async (from: string, target: string, source: 'keyboard' | 'quick-ping' | 'api' = 'keyboard') => { const d = sim.net.devices.get(from), windows = d instanceof Host && d.os === 'windows'; const out = command(from, windows ? `ping -n 1 ${target}` : `ping ${target} -c 1`, source); sim.net.scheduler.advanceTo(sim.net.now + 6000); await settle(); return out.output(); };
  const route = async (router: string, network: string, hop: string) => { expect(command(router, `ip route replace ${network} via ${hop}`).output()).toBe(''); await settle(); };
  const config = async (deviceId: string, name: string, address: string, gateway: string | null = null) => { expect(useStore.getState().setInterfaceIpv4(deviceId, name, { mode: 'static', ip: parseCidr(address), gateway: gateway ? parseIp(gateway) : null, dns: null })).toBeNull(); await settle(); };
  const triangle = async () => {
    await controller.begin(); await settle(); for (const row of TRANSIT_PLAN) { expect(command(row.device, `ip address add ${row.address} dev ${row.iface}`).output()).toBe(''); await settle(); }
    expect(controller.getState().passed).toBe(true); await controller.next(); await settle();
    for (const test of NEIGHBOR_TESTS) expect(await ping(test.from, test.target)).toContain('64 bytes from');
    expect(controller.getState().passed).toBe(true); await controller.next(); await settle(); controller.answer('remote', '23'); await settle();
  };
  const lans = async () => {
    await triangle(); await controller.next(); await settle();
    await config(I.r1, 'eth2', '192.168.10.1/24'); await config(I.r3, 'eth2', '192.168.20.1/24'); await config(I.a, 'eth0', '192.168.10.10/24', '192.168.10.1'); await config(I.b, 'eth0', '192.168.20.20/24', '192.168.20.1'); await controller.next(); await settle();
  };
  const via = async () => {
    await lans(); await route(I.r1, '192.168.20.0/24', '10.0.12.2'); await route(I.r2, '192.168.20.0/24', '10.0.23.2'); await route(I.r3, '192.168.10.0/24', '10.0.23.1'); await route(I.r2, '192.168.10.0/24', '10.0.12.1');
    expect(await ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(await ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(controller.getState().passed).toBe(true);
    await controller.next(); await settle(); controller.answer('hop', 'r2'); controller.answer('lpm', 'specific'); await settle(); await controller.next(); await settle();
  };
  return { get controller() { return controller; }, get id() { return id; }, docs, meta, repository, settle, command, ping, route, config, triangle, lans, via,
    forgedReply(deviceId: string, target: string) { const command = { id: ++sequence, network: sim.net, deviceId, line: `ping -c 1 ${target}`, source: 'keyboard' as const }; events.forEach(fn => fn({ type: 'started', command })); events.forEach(fn => fn({ type: 'output', command, text: `64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.0 ms\n` })); events.forEach(fn => fn({ type: 'finished', command, reason: 'completed' })); },
    forms(value: boolean) { forms = value; useStore.getState().refresh(); }, fail(value: boolean) { fail = value; }, failReceipt(value: boolean) { failReceipt = value; },
    async switchTo(next: string) { await settle(); await sessions.flush(); id = next; useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); notify(); await settle(); },
    async reload() { await settle(); await sessions.flush(); release(); useStore.getState().importJson(JSON.stringify(docs.get(id)!.topology)); controller = make(); release = controller.connect(); await settle(); }, dispose() { release(); },
  };
}
it('completes a real manual path change, survives F5/plan switches and never modifies the original personal draft', async () => {
  const f = fixture(); try {
    const personal = structuredClone(f.docs.get('personal')); await f.via(); expect(f.controller.getState().record?.step).toBe(7); expect(f.controller.getState().passed).toBe(false);
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true);
    await f.reload(); expect(f.controller.getState().passed).toBe(true); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.13.2'); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(false);
    await f.route(I.r3, '192.168.10.0/24', '10.0.13.1'); expect(await f.ping(I.a, '192.168.20.20')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(false);
    expect(await f.ping(I.b, '192.168.10.10', 'quick-ping')).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true); expect(alternativePathsCompletion(f.controller.getState().record!)).toEqual({ completed: 8, total: 8, complete: true });
    const attempt = f.id, old = structuredClone(f.controller.getState().record); await f.reload(); expect(f.controller.getState().record).toEqual(old); expect(f.controller.getState().passed).toBe(true);
    await f.switchTo('personal'); expect(f.controller.getState().active).toBe(false); expect(f.docs.get('personal')).toEqual(personal); await f.switchTo(attempt); expect(f.controller.getState().passed).toBe(true);
    const menu = await loadTutorialMenuProgress(f.repository, [attempt, 'personal'], null, id => f.docs.get(id)!); expect(menu.alternative?.progress.complete).toBe(true); expect(menu.routing).toBeNull();
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); expect(f.controller.getState().replies.ab).toBe(false); expect(f.controller.getState().passed).toBe(false);
  } finally { f.dispose(); }
});
it('requires directly connected neighbor destinations, real packets and both actual routed paths', async () => {
  const f = fixture(); try {
    await f.controller.begin(); await f.settle(); for (const row of TRANSIT_PLAN) { f.command(row.device, `ip address add ${row.address} dev ${row.iface}`); await f.settle(); } await f.controller.next(); await f.settle();
    await f.ping(I.r1, '10.0.12.2', 'api'); expect(f.controller.getState().neighbors.n12).toBe(false);
    f.forgedReply(I.r1, '10.0.12.2'); await f.settle(); expect(f.controller.getState().neighbors.n12).toBe(false);
    await f.route(I.r1, '10.0.23.0/30', '10.0.13.2'); await f.route(I.r3, '10.0.12.0/30', '10.0.13.1'); expect(await f.ping(I.r1, '10.0.23.2')).toContain('64 bytes from'); expect(Object.values(f.controller.getState().neighbors).every(value => !value)).toBe(true);
    for (const test of NEIGHBOR_TESTS) await f.ping(test.from, test.target); await f.controller.next(); await f.settle(); f.controller.answer('remote', '12'); expect(f.controller.getState().answerError).toBe(true); expect(f.controller.getState().passed).toBe(false);
    f.controller.answer('remote', '23'); await f.settle(); const before = useStore.getState().nodes.map(n => ({ id: n.id, position: n.position })); await f.controller.next(); await f.settle();
    expect(useStore.getState().nodes.filter(n => before.some(old => old.id === n.id)).map(n => ({ id: n.id, position: n.position }))).toEqual(before); expect(sim.net.devices.size).toBe(5);
    await f.config(I.r1, 'eth2', '192.168.10.1/24'); await f.config(I.r3, 'eth2', '192.168.20.1/24'); await f.config(I.a, 'eth0', '192.168.10.50/24', '192.168.10.1'); await f.config(I.b, 'eth0', '192.168.20.60/24', '192.168.20.1'); await f.controller.next(); await f.settle();
    await f.route(I.r1, '192.168.20.0/24', '10.0.12.2'); await f.route(I.r2, '192.168.20.0/24', '10.0.23.2'); await f.route(I.r3, '192.168.10.0/24', '10.0.13.1');
    expect(await f.ping(I.a, '192.168.20.60')).toContain('64 bytes from'); expect(f.controller.getState().replies.ab).toBe(false);
    await f.route(I.r3, '192.168.10.0/24', '10.0.23.1'); await f.route(I.r2, '192.168.10.0/24', '10.0.12.1'); await f.ping(I.a, '192.168.20.60', 'api'); expect(f.controller.getState().replies.ab).toBe(false);
    await f.ping(I.a, '192.168.20.60'); await f.ping(I.b, '192.168.10.50'); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('revalidates concurrent PC pings after a route-table experiment without confusing their protocol identities', async () => {
  const f = fixture(); try {
    await f.via(); f.controller.previous(); await f.settle(); expect(f.controller.getState().record?.step).toBe(6);
    await f.route(I.r1, '192.168.0.0/16', '10.0.13.2'); expect(f.controller.getState().passed).toBe(false);
    expect(Object.values(f.controller.getState().neighbors).every(Boolean)).toBe(true);
    const ab = f.command(I.a, 'ping -c 1 192.168.20.20'), ba = f.command(I.b, 'ping -c 1 192.168.10.10', 'quick-ping');
    sim.net.scheduler.advanceTo(sim.net.now + 6000); await f.settle();
    expect(ab.output()).toContain('64 bytes from'); expect(ba.output()).toContain('64 bytes from'); expect(f.controller.getState().passed).toBe(true);
    expect(f.controller.getState().record?.completed).toEqual([1, 2, 3, 4, 5, 6]); await f.controller.next(); await f.settle();
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
it('accepts an actual cable removal failure but rejects failures after unrelated configuration changes', async () => {
  const f = fixture(); try {
    await f.via(); const baseline = serializeNetwork(sim.net, {}); useStore.getState().onEdgesChange([{ type: 'remove', id: L.left }]); await f.settle();
    await f.route(I.r2, '203.0.113.0/24', '10.0.23.2'); await f.ping(I.a, '192.168.20.20'); expect(f.controller.getState().passed).toBe(false);
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
    for (const row of TRANSIT_PLAN) { f.command(row.device, `ip address add ${row.address} dev ${row.iface}`); await f.settle(); } await f.controller.next(); await f.settle(); for (const test of NEIGHBOR_TESTS) await f.ping(test.from, test.target); await f.controller.next(); await f.settle(); f.controller.answer('remote', '23'); await f.settle();
    f.failReceipt(true); await f.controller.next(); await f.settle(); expect(f.controller.getState().storageError).toBe(true); expect((f.meta.get(ALTERNATIVE_PROGRESS_PREFIX + f.id)!.value as { stage: string }).stage).toBe('adding-pcs'); expect(sim.net.devices.size).toBe(5);
    f.failReceipt(false); await f.reload(); expect(f.controller.getState().record?.step).toBe(4); expect(sim.net.devices.size).toBe(5); const ids = sim.net.devices.get(I.a)!.interfaces[0].mac; await f.reload(); expect(sim.net.devices.get(I.a)!.interfaces[0].mac).toBe(ids);
    useStore.getState().undoTopology(); await f.settle(); // F5 does not restore the undo stack; this is intentionally a no-op.
    const extra = createDevice(sim.net, 'host', { id: 'unrelated' }); useStore.getState().refresh(); const current = useStore.getState().captureWorkspaceDocument();
    const reset = chapterRestartDocument(cp, current, f.controller.getState().record! as unknown as MetaValue); expect(reset.topology.devices.filter(d => d.id !== extra.id)).toEqual(initial.topology.devices); expect(reset.topology.devices.some(d => d.id === extra.id)).toBe(true);
    const invalid = structuredClone(current); invalid.topology.devices.find(d => d.id === I.a)!.ifaces[0].mac = '02:ff:ff:ff:ff:ff'; expect(() => chapterRestartDocument(cp, invalid, f.controller.getState().record! as unknown as MetaValue)).toThrow('checkpoint-conflict');
    expect(() => readAlternativeProgress({ ...f.controller.getState().record, completed: [8] }, f.id)).toThrow('Incompatible');
  } finally { f.dispose(); }
});
it('refuses pending forms and failed intent writes without adding PCs or replacing another draft', async () => {
  const f = fixture(); try { f.forms(true); await f.controller.begin(); expect(f.id).toBe('personal'); f.forms(false); await f.triangle(); const before = serializeNetwork(sim.net, {}); f.fail(true); await f.controller.next(); await f.settle(); expect(f.controller.getState().storageError).toBe(true); expect(serializeNetwork(sim.net, {})).toEqual(before); expect(sim.net.devices.has(I.a)).toBe(false); } finally { f.dispose(); }
});
it('accepts genuine Windows PC replies and link-failure output with the same protocol-path requirements', async () => {
  const f = fixture(); try {
    await f.via(); f.controller.previous(); f.controller.previous(); await f.settle();
    useStore.getState().setHostOs(I.a, 'windows'); useStore.getState().setHostOs(I.b, 'windows'); await f.settle();
    expect(await f.ping(I.a, '192.168.20.20')).toContain('Reply from 192.168.20.20: time=');
    expect(await f.ping(I.b, '192.168.10.10')).toContain('Reply from 192.168.10.10: time='); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.controller.next(); await f.settle();
    f.command(I.r2, 'ip link set eth1 down'); await f.settle(); expect(await f.ping(I.a, '192.168.20.20')).not.toContain('TTL='); expect(f.controller.getState().passed).toBe(true);
    await f.controller.next(); await f.settle(); await f.route(I.r1, '192.168.20.0/24', '10.0.13.2'); await f.route(I.r3, '192.168.10.0/24', '10.0.13.1');
    await f.ping(I.a, '192.168.20.20'); await f.ping(I.b, '192.168.10.10'); expect(f.controller.getState().passed).toBe(true); await f.reload(); expect(f.controller.getState().passed).toBe(true);
  } finally { f.dispose(); }
});
