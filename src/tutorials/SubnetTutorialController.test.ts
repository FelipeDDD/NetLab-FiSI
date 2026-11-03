import { describe, expect, it } from 'vitest';
import { TutorialController } from './TutorialController';
import { SubnetTutorialController } from './SubnetTutorialController';
import { TutorialProgressStore, TUTORIAL_PROGRESS_PREFIX } from './tutorialProgress';
import { SubnetProgressStore, SUBNET_PROGRESS_PREFIX, readSubnetProgress } from './subnetProgress';
import { FIRST_DEVICES } from './firstConnection';
import { SUBNET_PC_ID, SUBNET_LINK_ID, chapterOneSignature, correctedSubnet, subnetPeers, subnetPreparationError } from './subnetChapter';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { createDevice } from '../engine/factory';
import { Host } from '../engine/ipdevice';
import { parseCidr } from '../engine/ip';
import { Shell } from '../commands/shell';
import type { TerminalCommandContext, TerminalCommandEvent } from '../terminalCommandEvents';
import type { ProjectRepository } from '../projects/repository';
import type { MetaRecord, ProjectDocument } from '../projects/types';
import type { SessionControllerState, DraftControllerState, SessionResult } from '../persistence/sessionTypes';

function fixture() {
  const meta = new Map<string, MetaRecord>(), documents = new Map<string, ProjectDocument>();
  documents.set('personal', { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [], links: [] } });
  let net = restoreNetwork(documents.get('personal')!.topology), runtimeId = 'personal', counter = 0, commandId = 0, forms = false, failWrite = false, calls = 0;
  let terminalResult: 'accepted' | 'busy' | 'unapplied-input' | 'disposed' = 'accepted';
  let demonstration: { cancel(): void } | undefined;
  const listeners = new Set<() => void>(), observers = new Set<(e: TerminalCommandEvent) => void>();
  const notify = () => listeners.forEach(fn => fn());
  const draft = (id: string): DraftControllerState => ({ id, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null });
  let state: SessionControllerState = { phase: 'ready', activeDraftId: 'personal', session: null, drafts: [draft('personal')], pendingShare: false, error: null };
  const repository: Pick<ProjectRepository, 'getMeta' | 'setMeta'> = {
    getMeta: async key => ({ ok: true, value: structuredClone(meta.get(key) ?? null) }),
    setMeta: async mutation => {
      if (failWrite) return { ok: false, error: { code: 'quota-exceeded', message: 'Full' } };
      const old = meta.get(mutation.key) ?? null;
      if ((old?.revision ?? null) !== mutation.expectedRevision) return { ok: false, error: { code: 'meta-conflict', key: mutation.key, expectedRevision: mutation.expectedRevision, current: old, message: 'Conflict' } };
      const record = { key: mutation.key, revision: (old?.revision ?? 0) + 1, value: structuredClone(mutation.value) }; meta.set(record.key, record); return { ok: true, value: record };
    },
  };
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const switchDraft = async (id: string): Promise<SessionResult<void>> => {
    documents.set(runtimeId, { schemaVersion: 1, topology: serializeNetwork(net, {}) }); disposeNetwork(net);
    net = restoreNetwork(documents.get(id)!.topology); runtimeId = id; state = { ...state, activeDraftId: id }; notify(); return { ok: true, value: undefined };
  };
  const sessions = {
    getState: () => state, subscribe, hasPendingOperations: () => false, switchDraft,
    openDocument: async (document: ProjectDocument): Promise<SessionResult<string>> => { const id = 'draft-' + ++counter; documents.set(id, structuredClone(document)); state = { ...state, drafts: [...state.drafts, draft(id)] }; await switchDraft(id); return { ok: true, value: id }; },
    flush: async (): Promise<SessionResult<void>> => { documents.set(runtimeId, { schemaVersion: 1, topology: serializeNetwork(net, {}) }); return { ok: true, value: undefined }; },
  };
  const observeCommands = (fn: (e: TerminalCommandEvent) => void) => { observers.add(fn); return () => { observers.delete(fn); }; };
  const emit = (event: TerminalCommandEvent) => observers.forEach(fn => fn(event));
  const submit = (line: string, source: TerminalCommandContext['source'] = 'keyboard', deviceId = SUBNET_PC_ID) => {
    const command = { id: ++commandId, network: net, deviceId, line, source }; let interrupted = false;
    emit({ type: 'started', command });
    const running = new Shell(net.devices.get(deviceId) as Host).exec(line, { write: text => emit({ type: 'output', command, text }) }, () => emit({ type: 'finished', command, reason: interrupted ? 'interrupt' : 'completed' }));
    notify(); return { command, cancel() { interrupted = true; running?.cancel(); } };
  };
  const insert = (pcC: string) => {
    const error = subnetPreparationError(net, pcC); if (error) return error;
    const peers = subnetPeers(net, pcC)!, port = peers.sw.interfaces.find(i => !i.link && i.up && peers.sw.vlanOf(i.name) === peers.vlan)!;
    const d = createDevice(net, 'host', { id: SUBNET_PC_ID, name: 'PC D', os: 'linux' });
    d.getInterface('eth0')!.ip = parseCidr('192.168.10.12/28'); net.connect(d.id, peers.sw.id, { id: SUBNET_LINK_ID, aIface: 'eth0', bIface: port.name }); notify(); return null;
  };
  const makeFirst = () => new TutorialController(sessions, {
    network: () => net, activeDraftId: () => runtimeId, signature: () => JSON.stringify(serializeNetwork(net, {})), pendingForms: () => forms, subscribe, observeCommands,
    renameDevice: (id, name) => { net.devices.get(id)!.name = name; notify(); },
  }, new TutorialProgressStore(repository, sessions));
  let first = makeFirst();
  const makeSecond = () => new SubnetTutorialController(sessions, first, {
    network: () => net, activeDraftId: () => runtimeId, pendingForms: () => forms, subscribe, observeCommands, insert,
    demonstrate: () => { calls++; if (terminalResult === 'accepted') demonstration = submit('ping -c 8 192.168.10.10', 'api'); return terminalResult; },
  }, new SubnetProgressStore(repository, sessions));
  let second = makeSecond(), releaseFirst = first.connect(), releaseSecond = second.connect();
  const settle = async () => { for (let i = 0; i < 5; i++) { await first.initialize(); await first.flushProgress(); await second.flushProgress(); await new Promise(r => setTimeout(r, 0)); } };
  const advance = (ms = 10000) => { net.scheduler.advanceTo(net.now + ms); notify(); };
  const completeFirst = async () => {
    await first.start(); net.connect(FIRST_DEVICES.a, FIRST_DEVICES.sw); notify(); first.next();
    submit('ip addr add 192.168.10.10/24 dev eth0', 'keyboard', FIRST_DEVICES.a); first.next();
    const ping = submit('ping 192.168.10.20', 'keyboard', FIRST_DEVICES.a); advance(1500); ping.cancel(); first.next();
    createDevice(net, 'host', { id: 'c', name: 'PC C', os: 'linux' }); notify(); await settle(); first.next();
    net.connect('c', FIRST_DEVICES.sw); notify(); first.next(); submit('ip addr add 192.168.10.30/24 dev eth0', 'keyboard', 'c'); first.next();
    submit('ping -c 1 192.168.10.20', 'keyboard', 'c'); advance(); await settle(); expect(first.getState().finished).toBe(true);
  };
  const begin = async () => { await completeFirst(); await second.begin(); await settle(); expect(second.getState().active).toBe(true); };
  const answer = async () => { submit('ip addr'); second.answer('255.255.255.240'); second.checkAnswer(); second.next(); await settle(); };
  const demo = async () => { await answer(); advance(); await settle(); expect(second.getState().passed).toBe(true); second.next(); };
  const failure = async () => { await demo(); submit('ping -c 3 192.168.10.20'); expect(second.getState().passed).toBe(true); second.next(); };
  return { meta, documents, sessions, submit, emit, notify, settle, advance, completeFirst, begin, answer, demo, failure, insert,
    stopDemo() { demonstration?.cancel(); },
    get first() { return first; }, get second() { return second; }, get net() { return net; }, get calls() { return calls; },
    forms(value: boolean) { forms = value; notify(); }, terminal(value: typeof terminalResult) { terminalResult = value; }, fail(value: boolean) { failWrite = value; },
    async reload() { await settle(); await sessions.flush(); releaseSecond(); releaseFirst(); disposeNetwork(net); net = restoreNetwork(documents.get(runtimeId)!.topology); first = makeFirst(); second = makeSecond(); releaseFirst = first.connect(); releaseSecond = second.connect(); await settle(); },
    dispose() { releaseSecond(); releaseFirst(); disposeNetwork(net); },
  };
}

describe('subnet-mask guided chapter', () => {
  it('continues the same draft, keeps Chapter 1 receipts intact and restores exactly one PC D', async () => {
    const f = fixture(); try {
      await f.completeFirst(); const id = f.first.getState().draftId!, original = chapterOneSignature(f.net), devices = [...f.net.devices.values()], old = structuredClone(f.meta.get(TUTORIAL_PROGRESS_PREFIX + id)!.value);
      await f.second.begin(); await f.settle();
      expect(f.sessions.getState().drafts).toHaveLength(2); expect(f.sessions.getState().activeDraftId).toBe(id);
      expect(devices.every(d => f.net.devices.get(d.id) === d)).toBe(true); expect(chapterOneSignature(f.net)).toBe(original); expect(f.first.getState().finished).toBe(true);
      expect(f.meta.get(TUTORIAL_PROGRESS_PREFIX + id)!.value).toEqual(old);
      await f.reload(); expect(f.first.getState().finished).toBe(true); expect(f.second.getState().record?.answer).toBe('255.255.');
      f.second.previous(); expect(f.second.getState().active).toBe(false); await f.second.begin(); await f.second.begin();
      expect([...f.net.devices.values()].filter(d => d.id === SUBNET_PC_ID)).toHaveLength(1); expect(f.net.links.size).toBe(4);
    } finally { f.dispose(); }
  });
  it('requires keyboard inspection of D, preserves partial answers, and gives no credit for a guessed answer', async () => {
    const f = fixture(); try {
      await f.begin(); f.second.answer('255.255.255.240'); f.second.checkAnswer(); expect(f.second.getState().passed).toBe(false);
      f.submit('ip addr', 'api'); f.submit('ip addr', 'quick-ping'); f.submit('ip addr', 'keyboard', FIRST_DEVICES.a); expect(f.second.getState().record?.inspected).toBe(false);
      f.submit('ip addr'); f.second.answer('255.255.255.'); await f.reload(); expect(f.second.getState().record?.answer).toBe('255.255.255.'); expect(f.second.getState().record?.inspected).toBe(true);
      f.second.answer('255.255.255.0'); f.second.checkAnswer(); expect(f.second.getState().answerError).toBe(true);
      f.second.answer('255.255.255.240'); f.second.checkAnswer(); expect(f.second.getState().passed).toBe(true);
    } finally { f.dispose(); }
  });
  it.each(['busy', 'unapplied-input'] as const)('offers the demo once, respects %s and allows manual retry after F5', async blocked => {
    const f = fixture(); try {
      await f.begin(); f.terminal(blocked); await f.answer(); expect(f.calls).toBe(1); expect(f.second.getState().passed).toBe(false);
      await f.reload(); expect(f.calls).toBe(1); expect(f.second.getState().record?.demoClaimed).toBe(true);
      f.terminal('accepted'); await f.second.demonstrate(); f.advance(); await f.settle(); expect(f.calls).toBe(2); expect(f.second.getState().passed).toBe(true);
    } finally { f.dispose(); }
  });
  it('does not restore or repeat an active automatic ping after F5', async () => {
    const f = fixture(); try { await f.begin(); await f.answer(); expect(f.calls).toBe(1); expect(f.second.getState().demoRunning).toBe(true); await f.reload(); expect(f.calls).toBe(1); expect(f.second.getState().demoRunning).toBe(false); expect(f.second.getState().passed).toBe(false); }
    finally { f.dispose(); }
  });
  it('passes on the first real Echo Reply, accepts early interruption and preserves it after F5', async () => {
    const f = fixture(); try {
      await f.begin(); await f.answer(); expect(f.second.getState().passed).toBe(false);
      f.advance(900); await f.settle();
      expect(f.second.getState().demoRunning).toBe(true); expect(f.second.getState().passed).toBe(true);
      await f.second.demonstrate(); expect(f.calls).toBe(1);
      f.stopDemo(); expect(f.second.getState().demoRunning).toBe(false); expect(f.second.getState().warning).toBeNull(); expect(f.second.getState().passed).toBe(true);
      await f.reload(); expect(f.calls).toBe(1); expect(f.second.getState().passed).toBe(true); expect(f.second.getState().demoRunning).toBe(false);
      f.second.next(); expect(f.second.getState().record?.step).toBe(3);
    } finally { f.dispose(); }
  });
  it('does not pass on interruption before a reply and permits a safe manual retry', async () => {
    const f = fixture(); try {
      await f.begin(); await f.answer(); f.stopDemo();
      expect(f.second.getState().passed).toBe(false); expect(f.second.getState().warning).toBe('demoRepeat');
      await f.second.demonstrate(); expect(f.calls).toBe(2); f.advance(900); await f.settle();
      expect(f.second.getState().passed).toBe(true); expect(f.second.getState().demoRunning).toBe(true);
      f.second.next(); expect(f.second.getState().demoRunning).toBe(false);
    } finally { f.dispose(); }
  });
  it('releases the demo UI after an in-flight edit and allows a manual repeat without undoing a valid mask change', async () => {
    const f = fixture(); try {
      await f.begin(); await f.answer(); expect(f.second.getState().demoRunning).toBe(true);
      f.net.devices.get(SUBNET_PC_ID)!.getInterface('eth0')!.ip = parseCidr('192.168.10.12/27'); f.notify();
      expect(f.second.getState().demoRunning).toBe(false); f.advance(); expect(f.second.getState().passed).toBe(false);
      await f.second.demonstrate(); f.advance(); await f.settle(); expect(f.second.getState().passed).toBe(true);
    } finally { f.dispose(); }
  });
  it('accepts only the real keyboard no-route result on D, excluding other failures, commands and sources', async () => {
    const f = fixture(); try {
      await f.begin(); await f.demo();
      f.submit('ping -c 1 192.168.10.20', 'api'); f.submit('ping -c 1 192.168.10.20', 'quick-ping');
      f.submit('ping -c 1 192.168.10.13'); f.advance(); expect(f.second.getState().passed).toBe(false);
      const wrong = f.submit('ping -c 1 192.168.10.20', 'keyboard', FIRST_DEVICES.a); f.advance(); expect(f.second.getState().passed).toBe(false);
      f.emit({ type: 'finished', command: wrong.command, reason: 'completed' }); expect(f.second.getState().passed).toBe(false);
      f.net.devices.get(SUBNET_PC_ID)!.getInterface('eth0')!.up = false; f.notify(); f.submit('ping -c 1 192.168.10.20'); expect(f.second.getState().passed).toBe(false);
      f.net.devices.get(SUBNET_PC_ID)!.getInterface('eth0')!.up = true; f.notify(); f.submit('ping -c 3 192.168.10.20'); expect(f.second.getState().record?.unreachable).toBe(true); await f.reload(); expect(f.second.getState().passed).toBe(true);
    } finally { f.dispose(); }
  });
  it.each([24, 26, 27])('accepts /%i by actual connected routes and requires fresh learner replies from both peers', async prefix => {
    const f = fixture(); try {
      await f.begin(); await f.failure(); const d = f.net.devices.get(SUBNET_PC_ID) as Host;
      d.getInterface('eth0')!.ip = parseCidr(`192.168.10.12/${prefix}`); f.notify(); expect(correctedSubnet(f.net, 'c')).toBe(true); expect(f.second.getState().passed).toBe(true); f.second.next();
      f.submit('ping -c 1 192.168.10.20', 'api'); f.advance(); await f.settle(); expect(f.second.getState().record?.replies.b).toBeNull();
      f.submit('ping -c 1 192.168.10.20'); f.advance(); await f.settle(); expect(f.second.getState().passed).toBe(false); expect(f.second.getState().record?.replies.b).toMatch(/^sha256/);
      await f.reload(); expect(f.second.getState().record?.replies.b).toMatch(/^sha256/);
      f.submit('ping -c 1 192.168.10.30'); f.advance(); await f.settle(); expect(f.second.getState().passed).toBe(true); const before = serializeNetwork(f.net, {});
      for (let i = 0; i < 4; i++) f.second.previous(); for (let i = 0; i < 4; i++) f.second.next(); expect(serializeNetwork(f.net, {})).toEqual(before); expect(f.calls).toBe(1);
    } finally { f.dispose(); }
  });
  it('invalidates final replies after configuration changes or plan switching and never credits a stale event', async () => {
    const f = fixture(); try {
      await f.begin(); await f.failure(); const d = f.net.devices.get(SUBNET_PC_ID) as Host; d.getInterface('eth0')!.ip = parseCidr('192.168.10.12/27'); f.notify(); f.second.next();
      const ping = f.submit('ping -c 1 192.168.10.20'); await f.sessions.switchDraft('personal'); f.emit({ type: 'output', command: ping.command, text: '64 bytes from 192.168.10.20: icmp_seq=1 ttl=64 time=1.0 ms\n' }); await f.settle(); expect(f.second.getState().active).toBe(false);
      await f.sessions.switchDraft(f.first.getState().draftId!); await f.settle(); expect(f.second.getState().record?.replies.b).toBeNull();
    } finally { f.dispose(); }
  });
  it('accepts final Quick Ping replies only from D to the matching peers and restores them after F5', async () => {
    const f = fixture(); try {
      await f.begin(); await f.failure(); f.net.devices.get(SUBNET_PC_ID)!.getInterface('eth0')!.ip = parseCidr('192.168.10.12/27'); f.notify(); f.second.next();
      f.submit('ping -c 4 192.168.10.20', 'quick-ping', FIRST_DEVICES.a); f.advance();
      f.submit('ping -c 4 192.168.10.10', 'quick-ping'); f.advance();
      f.submit('ping -c 1 192.168.10.13', 'quick-ping'); f.advance(); await f.settle();
      expect(f.second.getState().record?.replies).toEqual({ b: null, c: null });
      const b = f.submit('ping -c 4 192.168.10.20', 'quick-ping');
      expect(f.second.getState().record?.replies.b).toBeNull(); f.advance(900); await f.settle(); b.cancel();
      expect(f.second.getState().record?.replies.b).toMatch(/^sha256/); expect(f.second.getState().record?.replies.c).toBeNull();
      await f.reload(); expect(f.second.getState().record?.replies.b).toMatch(/^sha256/); expect(f.second.getState().passed).toBe(false);
      f.submit('ping -c 4 192.168.10.30', 'quick-ping'); expect(f.second.getState().record?.replies.c).toBeNull(); f.advance(); await f.settle();
      expect(f.second.getState().passed).toBe(true); await f.reload(); expect(f.second.getState().passed).toBe(true); expect(f.calls).toBe(1);
    } finally { f.dispose(); }
  });
  it('keeps topology intact on preparation conflicts and metadata failure', async () => {
    const f = fixture(); try {
      await f.completeFirst(); createDevice(f.net, 'host', { id: SUBNET_PC_ID, name: 'Other', os: 'windows' }); const before = serializeNetwork(f.net, {});
      await f.second.begin(); expect(f.second.getState().warning).toBe('conflict'); expect(serializeNetwork(f.net, {})).toEqual(before);
      f.net.removeDevice(SUBNET_PC_ID); f.fail(true); await f.second.begin(); expect(f.net.devices.has(SUBNET_PC_ID)).toBe(false); expect(f.second.getState().storageError).toBe(true);
    } finally { f.dispose(); }
  });
  it('reserves progress separately from v1 and validates its contract', async () => {
    const f = fixture(); try {
      await f.begin(); const id = f.first.getState().draftId!, record = f.meta.get(SUBNET_PROGRESS_PREFIX + id)!.value;
      expect(readSubnetProgress(record, id).pcD).toBe(SUBNET_PC_ID); expect(f.meta.has(TUTORIAL_PROGRESS_PREFIX + id)).toBe(true);
      expect(() => readSubnetProgress({ ...(record as object), step: 6 }, id)).toThrow(); expect(() => readSubnetProgress({ ...(record as object), draftId: 'other' }, id)).toThrow();
    } finally { f.dispose(); }
  });
  it('warns about an exhausted or missing switch after historical Chapter 1 completion, without creating D', async () => {
    const f = fixture(); try {
      await f.completeFirst();
      while (f.net.devices.get(FIRST_DEVICES.sw)!.freeInterface()) {
        const host = createDevice(f.net, 'host'); f.net.connect(host.id, FIRST_DEVICES.sw);
      }
      f.notify(); expect(f.first.hasCompletedChapter()).toBe(true); const before = serializeNetwork(f.net, {});
      await f.second.begin(); expect(f.second.getState().warning).toBe('noPort'); expect(serializeNetwork(f.net, {})).toEqual(before);
      f.net.removeDevice(FIRST_DEVICES.sw); f.notify(); await f.second.begin(); expect(f.second.getState().warning).toBe('missing'); expect(f.net.devices.has(SUBNET_PC_ID)).toBe(false);
    } finally { f.dispose(); }
  });
  it('recovers a durable preparation intent without duplicating D and never recreates a deliberately removed D', async () => {
    const f = fixture(); try {
      await f.begin(); const id = f.first.getState().draftId!, key = SUBNET_PROGRESS_PREFIX + id;
      const record = structuredClone(f.meta.get(key)!); (record.value as unknown as { prepared: boolean }).prepared = false; f.meta.set(key, record);
      await f.reload(); expect(f.second.getState().record?.prepared).toBe(false); await f.second.begin(); await f.settle();
      expect(f.second.getState().record?.prepared).toBe(true); expect([...f.net.devices.values()].filter(d => d.id === SUBNET_PC_ID)).toHaveLength(1);
      f.net.removeDevice(SUBNET_PC_ID); f.notify(); await f.reload(); expect(f.second.getState().warning).toBe('missing'); await f.second.begin(); expect(f.net.devices.has(SUBNET_PC_ID)).toBe(false);
    } finally { f.dispose(); }
  });
  it('clears final receipts after an IPv4 edit and blocks an automatic demo when its claim cannot be persisted', async () => {
    const f = fixture(); try {
      await f.begin(); await f.failure(); const iface = f.net.devices.get(SUBNET_PC_ID)!.getInterface('eth0')!;
      iface.ip = parseCidr('192.168.10.12/27'); f.notify(); f.second.next(); f.submit('ping -c 1 192.168.10.20'); f.advance(); await f.settle();
      expect(f.second.getState().record?.replies.b).toMatch(/^sha256/); iface.ip = parseCidr('192.168.10.12/26'); f.notify(); expect(f.second.getState().record?.replies.b).toBeNull();
    } finally { f.dispose(); }
    const g = fixture(); try { await g.begin(); g.submit('ip addr'); g.second.answer('255.255.255.240'); g.second.checkAnswer(); await g.settle(); g.fail(true); g.second.next(); await g.settle(); expect(g.calls).toBe(0); expect(g.second.getState().storageError).toBe(true); }
    finally { g.dispose(); }
  });
});
