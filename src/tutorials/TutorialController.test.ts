import { describe, expect, it, vi } from 'vitest';
import { TutorialController } from './TutorialController';
import { FIRST_DEVICES, firstConnectionConditions, firstConnectionDocument } from './firstConnection';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { Host, IpDevice, NotebookDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { runChecks } from '../labs/checker';
import type { TerminalCommandContext, TerminalCommandEvent } from '../terminalCommandEvents';
import type { ProjectDocument } from '../projects/types';
import type { MetaRecord } from '../projects/types';
import type { ProjectRepository } from '../projects/repository';
import { TutorialProgressStore, TUTORIAL_PROGRESS_PREFIX } from './tutorialProgress';
import type { DraftControllerState, SessionControllerState, SessionResult } from '../persistence/sessionTypes';

function fixture(persistent = false) {
  const meta = new Map<string, MetaRecord>();
  let failProgress = false, failProgressReads = false;
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => failProgressReads ? { ok: false, error: { code: 'unavailable', message: 'Unavailable' } } : { ok: true, value: structuredClone(meta.get(key) ?? null) },
    setMeta: async mutation => {
      if (failProgress) return { ok: false, error: { code: 'quota-exceeded', message: 'Full' } };
      const current = meta.get(mutation.key) ?? null;
      if ((current?.revision ?? null) !== mutation.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: mutation.key, expectedRevision: mutation.expectedRevision, current, message: 'Conflict' } };
      const record = { key: mutation.key, revision: (current?.revision ?? 0) + 1, value: structuredClone(mutation.value) };
      meta.set(record.key, record); return { ok: true, value: record };
    },
  };
  const documents = new Map<string, ProjectDocument>([['personal', { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [], links: [] } }]]);
  let net = restoreNetwork(documents.get('personal')!.topology), forms = false, fail = false, pending = false, ids = 0, commandId = 0, runtimeDraftId = 'personal';
  const draft = (id: string): DraftControllerState => ({ id, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null });
  let state: SessionControllerState = { phase: 'ready', activeDraftId: 'personal', session: null, drafts: [draft('personal')], pendingShare: false, error: null };
  const listeners = new Set<() => void>(), commands = new Set<(event: TerminalCommandEvent) => void>();
  const refresh = () => listeners.forEach(listener => listener());
  const switchTo = async (id: string): Promise<SessionResult<void>> => {
    if (!documents.has(id)) return { ok: false, error: { code: 'draft-closed', id, message: 'Closed' } };
    pending = true;
    documents.set(state.activeDraftId!, { schemaVersion: 1, topology: serializeNetwork(net, {}) });
    disposeNetwork(net); net = restoreNetwork(documents.get(id)!.topology); refresh();
    runtimeDraftId = id; refresh(); // Activation arrives before session focus.
    state = { ...state, activeDraftId: id }; pending = false; refresh(); return { ok: true, value: undefined };
  };
  const sessions = {
    getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hasPendingOperations: () => pending, switchDraft: switchTo,
    flush: async (id?: string): Promise<SessionResult<void>> => {
      if (!id || id === state.activeDraftId) documents.set(state.activeDraftId!, { schemaVersion: 1, topology: serializeNetwork(net, {}) });
      return { ok: true, value: undefined };
    },
    openDocument: async (document: ProjectDocument): Promise<SessionResult<string>> => {
      if (fail) return { ok: false, error: { code: 'quota-exceeded', message: 'Full' } };
      const id = 'tutorial-' + ++ids; documents.set(id, document); state = { ...state, drafts: [...state.drafts, draft(id)] };
      const switched = await switchTo(id);
      return switched.ok ? { ok: true, value: id } : switched;
    },
  };
  const runtime = {
    network: () => net, activeDraftId: () => runtimeDraftId, signature: () => JSON.stringify(serializeNetwork(net, {})), pendingForms: () => forms,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observeCommands: (listener: (event: TerminalCommandEvent) => void) => { commands.add(listener); return () => { commands.delete(listener); }; },
    renameDevice: (id: string, name: string) => { net.devices.get(id)!.name = name; refresh(); },
    hostCreationDraft: vi.fn(),
  };
  const create = () => new TutorialController(sessions, runtime, persistent ? new TutorialProgressStore(repository, sessions) : undefined);
  let controller = create(), release = controller.connect();
  const emit = (event: TerminalCommandEvent) => commands.forEach(listener => listener(event));
  const submit = (line: string, source: TerminalCommandContext['source'] = 'keyboard', deviceId: string = FIRST_DEVICES.a) => {
    const command = { id: ++commandId, network: net, deviceId, line, source };
    let interrupted = false;
    emit({ type: 'started', command });
    const running = new Shell(net.devices.get(deviceId) as IpDevice).exec(line, { write: text => emit({ type: 'output', command, text }) },
      () => emit({ type: 'finished', command, reason: interrupted ? 'interrupt' : 'completed' }));
    refresh(); return { command, running, interrupt() { interrupted = true; running?.cancel(); } };
  };
  const connectA = () => { net.connect(FIRST_DEVICES.a, FIRST_DEVICES.sw); refresh(); };
  const ready = async () => {
    await controller.start(); connectA(); controller.next();
    submit('ip address add 192.168.10.10/24 dev eth0'); controller.next();
  };
  return { get controller() { return controller; }, runtime, documents, meta, refresh, submit, emit, ready, connectA, switchTo, get net() { return net; },
    progressFailure(value: boolean) { failProgress = value; },
    progressReadFailure(value: boolean) { failProgressReads = value; },
    async reload() {
      await controller.flushProgress(); release(); disposeNetwork(net);
      net = restoreNetwork(documents.get(state.activeDraftId!)!.topology);
      forms = false; controller = create(); release = controller.connect(); await controller.initialize();
    },
    forms(value: boolean) { forms = value; refresh(); }, fail(value: boolean) { fail = value; },
    close() { state = { ...state, activeDraftId: 'personal', drafts: state.drafts.filter(d => d.id !== controller.getState().draftId) }; refresh(); },
    dispose() { release(); disposeNetwork(net); },
  };
}

describe('first guided chapter', () => {
  it('scopes the catalogue override to step 5, restores it after reload, and releases it on exit', async () => {
    const f = fixture(true);
    try {
      await f.ready();
      const ping = f.submit('ping 192.168.10.20');
      f.net.scheduler.advanceTo(f.net.now + 1500); ping.interrupt(); f.controller.next();
      const id = f.controller.getState().draftId!;
      expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(id);
      await f.reload();
      expect(f.controller.getState()).toMatchObject({ step: 4, active: true });
      expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(id);
      await f.switchTo('personal'); expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(null);
      await f.switchTo(id); await f.controller.initialize();
      expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(id);
      f.controller.previous(); expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(null);
      f.controller.next(); expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(id);
      const c = new Host(f.net, 'pc-c', 'new'); f.net.devices.set(c.id, c); f.refresh();
      f.controller.next(); expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(null);
    } finally { f.dispose(); }
    expect(f.runtime.hostCreationDraft).toHaveBeenLastCalledWith(null);
  });
  it('can retry a temporary progress-read failure without creating or replacing a draft', async () => {
    const f=fixture(true); try {
      await f.controller.start(); f.connectA(); f.controller.next();
      const id=f.controller.getState().draftId; f.progressReadFailure(true); await f.reload();
      expect(f.controller.getState()).toMatchObject({ active:false, storageError:true });
      f.progressReadFailure(false); await f.controller.retryProgress();
      expect(f.controller.getState()).toMatchObject({ active:true, storageError:false, step:1, draftId:id });
      expect(f.documents.size).toBe(2);
    } finally { f.dispose(); }
  });
  it('recovers steps 2 and 4 without duplicating drafts or reviving an interrupted-by-reload ping', async () => {
    const f = fixture(true); try {
      await f.controller.start(); const id = f.controller.getState().draftId!;
      f.connectA(); f.controller.next(); await f.reload();
      expect(f.controller.getState()).toMatchObject({ active: true, draftId: id, step: 1, passed: false });
      f.submit('ip address add 192.168.10.10/24 dev eth0'); f.controller.next();
      f.submit('ping 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now + 1500); await f.reload();
      expect(f.controller.getState()).toMatchObject({ active: true, draftId: id, step: 3, passed: false, repeatPing: true });
      expect(f.net.scheduler.pending).toBe(0);
      const repeated = f.submit('ping 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now + 1500); repeated.interrupt();
      expect(f.controller.getState().passed).toBe(true);
      const tabs = f.documents.size; await f.controller.start(); expect(f.documents.size).toBe(tabs);
      await f.switchTo('personal'); await f.reload(); await f.controller.start();
      expect(f.controller.getState()).toMatchObject({ active: true, draftId: id, step: 3, passed: true });
      await f.controller.start(true); expect(f.controller.getState().draftId).not.toBe(id); expect(f.documents.size).toBe(tabs+1);
      await f.switchTo(id); await f.controller.initialize();
      expect(f.controller.getState()).toMatchObject({ active: true, draftId: id, step: 3, passed: true });
    } finally { f.dispose(); }
  });
  it('recovers PC C and terminal IPv4 history, validates changed topology and restores the final completion', async () => {
    const f = fixture(true); try {
      await f.ready(); const ping=f.submit('ping 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now+1500); ping.interrupt(); f.controller.next();
      const c = new Host(f.net,'pc-c','new'); f.net.devices.set(c.id,c); f.refresh(); await Promise.resolve();
      f.controller.next(); f.net.connect(c.id,FIRST_DEVICES.sw); f.refresh(); f.controller.next();
      f.submit('ip address add 192.168.10.30/24 dev eth0','keyboard',c.id);
      const id=f.controller.getState().draftId!; await f.reload();
      expect(f.controller.getState()).toMatchObject({ active:true, step:6, pcC:c.id, passed:true, draftId:id });
      const restored=f.net.devices.get(c.id) as Host; expect(restored.name).toBe('PC C');
      restored.interfaces[0].ip=parseCidr('192.168.10.31/24'); f.refresh(); await f.reload();
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address del 192.168.10.31/24 dev eth0','keyboard',c.id); f.submit('ip address add 192.168.10.30/24 dev eth0','keyboard',c.id); f.controller.next();
      f.submit('ping -c 1 192.168.10.20','keyboard',c.id); f.net.scheduler.advanceTo(f.net.now+5000); await f.reload();
      expect(f.controller.getState()).toMatchObject({ active:true, step:7, pcC:c.id, passed:true, finished:true });
      const link=[...f.net.links.values()].find(l=>l.a.device.id===c.id||l.b.device.id===c.id)!;
      f.net.disconnect(link.id); f.refresh(); await f.reload(); expect(f.controller.getState()).toMatchObject({ passed:false, finished:false });
    } finally { f.dispose(); }
  });
  it('preserves the topology on quota errors, malformed progress and concurrent progress changes', async () => {
    const f=fixture(true); try {
      await f.controller.start(); const id=f.controller.getState().draftId!,key=TUTORIAL_PROGRESS_PREFIX+id;
      const previous=structuredClone(f.meta.get(key)!);
      f.progressFailure(true); f.connectA(); f.controller.next(); await f.controller.flushProgress();
      expect(f.controller.getState().storageError).toBe(true); expect(f.meta.get(key)).toEqual(previous);
      f.progressFailure(false); await f.controller.retryProgress(); expect(f.controller.getState().storageError).toBe(false);
      const winner=structuredClone(f.meta.get(key)!); winner.revision++; f.meta.set(key,winner);
      f.controller.previous(); await f.controller.flushProgress(); expect(f.controller.getState().storageError).toBe(true); expect(f.meta.get(key)).toEqual(winner);
      const saved=JSON.stringify(serializeNetwork(f.net,{})); f.meta.set(key,{...winner,value:{schemaVersion:999}}); await f.reload();
      expect(f.controller.getState()).toMatchObject({ active:false, storageError:true }); expect(JSON.stringify(serializeNetwork(f.net,{}))).toBe(saved);
      expect(f.documents.size).toBe(2);
    } finally { f.dispose(); }
  });
  it('extends the same lab with a new Linux host and requires terminal configuration and a learner ping on C', async () => {
    const f = fixture(); try {
      await f.ready(); const a = f.net.devices.get(FIRST_DEVICES.a), sw = f.net.devices.get(FIRST_DEVICES.sw);
      const draft = f.controller.getState().draftId;
      const ping = f.submit('ping 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now + 1500); ping.interrupt();
      f.controller.next(); expect(f.controller.getState()).toMatchObject({ step: 4, passed: false, pcC: null });
      const notebook = new NotebookDevice(f.net, 'notebook', 'Notebook'); f.net.devices.set(notebook.id, notebook); f.refresh();
      expect(f.controller.getState().passed).toBe(false);
      const c = new Host(f.net, 'c', 'pc1'); c.os = 'windows'; f.net.devices.set(c.id, c); f.refresh();
      expect(f.controller.getState().passed).toBe(false);
      c.os = 'linux'; f.refresh(); expect(f.controller.getState()).toMatchObject({ passed: true, pcC: c.id });
      await Promise.resolve(); expect(c.name).toBe('PC C'); expect(f.net.devices.get(c.id)).toBe(c);
      f.controller.next(); f.net.connect(c.id, notebook.id); f.refresh(); expect(f.controller.getState().passed).toBe(false);
      f.net.disconnect([...f.net.links.keys()].at(-1)!); f.net.connect(c.id, FIRST_DEVICES.sw); f.refresh();
      expect(f.controller.getState().passed).toBe(true); f.controller.next();
      expect(f.controller.getState().hint).toBe('ipv4C');
      c.getInterface('eth0')!.ip = parseCidr('192.168.10.30/24'); f.refresh(); // Inspector configuration alone.
      expect(f.controller.getState().hint).toBe('ipv4CExisting');
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address add 192.168.10.30/24 dev eth0', 'keyboard', c.id); // Existing address: rejected, no false receipt.
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address del 192.168.10.30/24 dev eth0', 'keyboard', c.id);
      f.submit('ip address add 192.168.10.30/24 dev eth0', 'api', c.id);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address del 192.168.10.30/24 dev eth0', 'keyboard', c.id);
      f.submit('ip address add 192.168.10.30/24 dev eth0', 'keyboard', FIRST_DEVICES.b);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address add 192.168.10.30/24 dev eth0', 'keyboard', c.id);
      expect(f.controller.getState().passed).toBe(true); f.controller.next();
      f.submit('ping -c 1 192.168.10.20', 'quick-ping', c.id); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ping -c 1 192.168.10.99', 'keyboard', c.id); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ping -c 1 192.168.10.20', 'keyboard', FIRST_DEVICES.a); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ping -c 1 192.168.10.20', 'keyboard', c.id); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState()).toMatchObject({ passed: true, finished: true });
      expect(c.arpTable.has(parseIp('192.168.10.20')!)).toBe(true);
      let arpFromC = 0;
      f.net.onWireTransfer = transfer => { if (transfer.fromDeviceId === c.id && transfer.kind === 'arp') arpFromC++; };
      const live = f.submit('ping 192.168.10.20', 'keyboard', c.id); f.net.scheduler.advanceTo(f.net.now + 1500);
      expect(f.controller.getState()).toMatchObject({ passed: true, finished: false });
      expect(arpFromC).toBe(0); // A valid cached MAC needs no new ARP request.
      f.submit('Ctrl+C', 'keyboard', FIRST_DEVICES.a); expect(f.controller.getState().finished).toBe(false);
      live.interrupt(); expect(f.controller.getState().finished).toBe(true);
      const saved = JSON.stringify(serializeNetwork(f.net, {}));
      for(let i=0;i<7;i++)f.controller.previous();
      for(let i=0;i<7;i++){ expect(f.controller.getState().passed).toBe(true); f.controller.next(); }
      expect(f.controller.getState()).toMatchObject({ step: 7, passed: true, draftId: draft });
      expect(f.net.devices.get(FIRST_DEVICES.a)).toBe(a); expect(f.net.devices.get(FIRST_DEVICES.sw)).toBe(sw);
      expect(JSON.stringify(serializeNetwork(f.net, {}))).toBe(saved);
    } finally { f.dispose(); }
  });
  it('keeps a conflicting PC C name and all other devices unchanged', async () => {
    const f = fixture(); try {
      await f.ready(); const ping=f.submit('ping 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now+1500); ping.interrupt();
      const existing=new Host(f.net,'existing','PC C'); f.net.devices.set(existing.id,existing); f.refresh();
      f.controller.next(); const added=new Host(f.net,'new','pc2'); f.net.devices.set(added.id,added); f.refresh();
      await Promise.resolve(); expect(f.controller.getState().pcC).toBe(added.id);
      expect(added.name).toBe('pc2'); expect(existing.name).toBe('PC C');
      expect(f.net.devices.get(FIRST_DEVICES.a)?.name).toBe('PC A'); expect(f.net.devices.get(FIRST_DEVICES.b)?.name).toBe('PC B');
    } finally { f.dispose(); }
  });
  it('starts with two PCs, one existing B-switch cable and an empty IPv4 on PC A', () => {
    const doc = firstConnectionDocument(), net = restoreNetwork(doc.topology);
    expect(doc.topology.devices).toHaveLength(3); expect(net.links.size).toBe(1);
    expect(firstConnectionConditions(net)).toEqual({ exists: true, cable: false, ipv4: false, ready: false });
    expect(net.devices.get(FIRST_DEVICES.sw)!.interfaces.filter(iface => !iface.link)).toHaveLength(7);
    expect(doc.topology.devices[0].x).toBeLessThan(doc.topology.devices[1].x);
    expect(doc.topology.devices[1].x).toBeLessThan(doc.topology.devices[2].x);
    disposeNetwork(net);
  });
  it('requires the actual A-switch cable and the exact IPv4, with no automatic probes or future-step skip', async () => {
    const f = fixture(); try {
      await f.controller.start(); expect(f.documents.has('personal')).toBe(true);
      f.controller.next(); expect(f.controller.getState().step).toBe(0);
      f.net.disconnect('tutorial-01-b-link'); f.net.connect(FIRST_DEVICES.a, FIRST_DEVICES.b); f.refresh();
      expect(f.controller.getState().passed).toBe(false);
      f.net.disconnect([...f.net.links.keys()][0]); f.net.connect(FIRST_DEVICES.sw, FIRST_DEVICES.b);
      f.connectA(); expect(f.controller.getState().passed).toBe(true); f.controller.next();
      f.submit('ip address add 192.168.10.10/25 dev eth0');
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ip address del 192.168.10.10/25 dev eth0'); f.submit('ip address add 192.168.10.10/24 dev eth0');
      expect(f.controller.getState().passed).toBe(true);
      f.forms(true); expect(f.controller.getState().passed).toBe(false); f.forms(false);
      f.controller.next(); expect(f.controller.getState().step).toBe(2); expect(f.controller.getState().passed).toBe(false);
    } finally { f.dispose(); }
  });
  it('accepts only a successful learner terminal ping, excluding probes, API, Quick Ping, wrong source and target', async () => {
    const f = fixture(); try {
      await f.ready();
      const results: boolean[] = [];
      runChecks(f.net, [{ id: 'probe', label: 'Probe', check: { type: 'ping', from: FIRST_DEVICES.a, toDevice: FIRST_DEVICES.b, resolveBy: 'id', expect: 'success' } }], result => results.push(result.pass), () => {});
      f.net.scheduler.advanceTo(f.net.now + 5000); expect(results).toEqual([true]); expect(f.controller.getState().passed).toBe(false);
      for (const source of ['api', 'quick-ping'] as const) {
        f.submit('ping -c 1 192.168.10.20', source); f.net.scheduler.advanceTo(f.net.now + 5000);
        expect(f.controller.getState().passed).toBe(false);
      }
      f.submit('ping -c 1 192.168.10.10', 'keyboard', FIRST_DEVICES.b); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState().passed).toBe(false);
      f.submit('ping -c 1 192.168.10.99'); expect(f.controller.getState().hint).toBe('wrongTarget');
      f.net.scheduler.advanceTo(f.net.now + 5000); expect(f.controller.getState().passed).toBe(false);
      f.submit('ping -c 1 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState().step).toBe(3); expect(f.controller.getState().passed).toBe(false);
      const saved = JSON.stringify(serializeNetwork(f.net, {})); f.controller.previous(); f.controller.next();
      expect(JSON.stringify(serializeNetwork(f.net, {}))).toBe(saved); expect(f.controller.getState().passed).toBe(false);
      await f.switchTo('personal'); expect(f.controller.getState().active).toBe(false);
      await f.controller.start(); expect(f.controller.getState().step).toBe(3); expect(f.controller.getState().passed).toBe(false);
    } finally { f.dispose(); }
  });
  it('requires an actual interruption of the successful PC A ping, not completion or another terminal', async () => {
    const f = fixture(); try {
      await f.ready();
      f.submit('ping -c 1 192.168.10.20'); f.net.scheduler.advanceTo(f.net.now + 5000);
      expect(f.controller.getState()).toMatchObject({ step: 3, passed: false });
      f.submit('Ctrl+C'); expect(f.controller.getState().passed).toBe(false);
      const other = f.submit('ping 192.168.10.10', 'keyboard', FIRST_DEVICES.b);
      f.net.scheduler.advanceTo(f.net.now + 1000); other.interrupt();
      expect(f.controller.getState().passed).toBe(false);
      const unsuccessful = f.submit('ping 192.168.10.99'); unsuccessful.interrupt();
      expect(f.controller.getState().passed).toBe(false);
      const ping = f.submit('ping 192.168.10.20');
      f.net.scheduler.advanceTo(f.net.now + 1500);
      expect(f.controller.getState().passed).toBe(false);
      // Even a finish notification for a different command cannot satisfy this step.
      f.emit({ type: 'finished', command: other.command, reason: 'interrupt' });
      expect(f.controller.getState().passed).toBe(false);
      ping.interrupt(); expect(f.controller.getState()).toMatchObject({ step: 3, passed: true });
    } finally { f.dispose(); }
  });
  it('invalidates in-flight evidence after edits or plan switching and never recreates a closed draft', async () => {
    const f = fixture(); try {
      await f.ready(); const id = f.controller.getState().draftId!, stale = f.submit('ping -c 1 192.168.10.20').command;
      f.net.devices.get(FIRST_DEVICES.a)!.getInterface('eth0')!.up = false; f.refresh();
      f.net.scheduler.advanceTo(f.net.now + 5000); expect(f.controller.getState().passed).toBe(false);
      f.net.devices.get(FIRST_DEVICES.a)!.getInterface('eth0')!.up = true; f.refresh();
      await f.switchTo('personal'); f.emit({ type: 'output', command: stale, text: '64 bytes from 192.168.10.20: icmp_seq=1 ttl=64 time=1.0 ms\n' });
      expect(f.controller.getState().active).toBe(false);
      await f.controller.start(); expect(f.controller.getState().draftId).toBe(id); expect(f.controller.getState().passed).toBe(false);
      f.close(); expect(f.controller.getState().draftId).toBeNull();
    } finally { f.dispose(); }
  });
  it('preserves the old plan on storage failure and blocks start with unfinished forms', async () => {
    const f = fixture(); try {
      f.forms(true); await f.controller.start(); expect(f.documents.size).toBe(1); expect(f.controller.getState().error).toBe(true);
      f.forms(false); f.fail(true); await f.controller.start(); expect(f.documents.size).toBe(1); expect(f.controller.getState().draftId).toBeNull();
    } finally { f.dispose(); }
  });
});
