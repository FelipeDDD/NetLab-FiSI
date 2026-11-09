import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import type { TerminalCommandEvent, TerminalCommandContext } from '../terminalCommandEvents';
import type { NetworkObservation } from '../networkObservations';
import type { MetaValue } from '../projects/types';
import { IpDevice } from '../engine/ipdevice';
import { networkOf, parseIp } from '../engine/ip';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import { tutorialFingerprint } from './tutorialProgress';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_TOTAL, ALTERNATIVE_ROUTERS, ALTERNATIVE_PCS, ALTERNATIVE_LINKS as L, NEIGHBOR_TESTS, alternativePathsDocument, alternativeConditions, alternativeSignature, neighborSignature, neighborLinkSignature, failureBaselineSignature, triangleWiring, transitConfigured, transitLinkConfigured, pcIdentity, initialAlternativePcs, pcPreparationError, alternativeTarget, expectedPcPath, type AlternativeWarning, type NeighborTest } from './alternativePathsChapter';
import { emptyNeighborProofs, AlternativePathsProgressStore, type AlternativePathsProgress } from './alternativePathsProgress';
import { emptyLpm, abSignature, lpmPortError, findLpmPc, lpmPcValid, lpmRoutesReady, lpmLocalSignature, lpmPathSignature, lpmPaths, LPM_ADDRESS, LPM_GATEWAY } from './alternativeLpm';

type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'hasPendingOperations' | 'openDocument'>;
export interface AlternativeRuntime {
  openAttempt?: SessionController['openDocument']; checkpoint?: ChapterCheckpointHooks; restarting?(): boolean;
  network(): Network; activeDraftId(): string | null; pendingForms(): boolean;
  subscribe(fn: () => void): () => void; observeCommands(fn: (event: TerminalCommandEvent) => void): () => void;
  observeActivity(fn: (event: NetworkObservation) => void): () => void;
  insert(): AlternativeWarning | null; started?(id: string): void;
  prepareLpm?(): AlternativeWarning | null;
}
export interface AlternativeState {
  active: boolean; busy: boolean; saving: boolean; storageError: boolean; loadedDraft: string | null;
  record: AlternativePathsProgress | null; passed: boolean; warning: AlternativeWarning | null; answerError: boolean;
  neighbors: Record<NeighborTest, boolean>; replies: { ab: boolean; ba: boolean };
  pathStatus: 'expected' | 'verified' | 'invalidated'; failureMismatch: boolean;
  investigationResult: 'missing-route' | 'reply' | 'other' | null;
  lpmObserved: boolean;
}
interface Candidate {
  command: TerminalCommandContext; step: number; signature: string; key: NeighborTest | 'ab' | 'ba' | 'local' | 'lpm'; source: number; target: number;
  path: string[]; returnPath?: string[]; icmpId?: number; output: string; proved: boolean;
  paths: Map<number, { request: [string, string][]; reply: [string, string][] }>;
  missingR1Route: boolean;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lacksRoute = (device: IpDevice, target: number) => !device.routes().some(route => networkOf(target, route.prefix) === route.dest);
export class AlternativePathsController {
  private state: AlternativeState = { active: false, busy: false, saving: false, storageError: false, loadedDraft: null, record: null, passed: false, warning: null, answerError: false, neighbors: Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, false])) as AlternativeState['neighbors'], replies: { ab: false, ba: false }, pathStatus: 'expected', failureMismatch: false, investigationResult: null, lpmObserved: false };
  // Presentation evidence only. Historical "investigated" does not encode a cause.
  private investigation?: { net: Network; signature: string; draftId: string; result: AlternativeState['investigationResult'] };
  private listeners = new Set<() => void>(); private releases: (() => void)[] = [];
  private records = new Map<string, AlternativePathsProgress | null>(); private loading = new Map<string, Promise<void>>();
  private failed = new Set<string>(); private readFailed = new Set<string>(); private attempted = new WeakSet<Network>();
  private pending = 0; private disposed = false; private restoring = false; private preparing = false;
  private lpmPreparing = false; private lpmAttempted = new WeakSet<Network>();
  private validated?: { net: Network; signature: string; hash: string; abHash: string; neighborHash: string; neighborHashes: string[]; failureHash: string; pcId: string | null; localHash: string; lpmHash: string };
  private candidates = new Map<number, Candidate>(); private awaiting?: number;
  constructor(private sessions: Sessions, private runtime: AlternativeRuntime, private progress: AlternativePathsProgressStore) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  holdsDraft(id: string | null) { return !!id && (!this.records.has(id) || !!this.records.get(id)); }
  private publish(patch: Partial<AlternativeState>) {
    if (this.disposed || Object.entries(patch).every(([key, value]) => this.state[key as keyof AlternativeState] === value)) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn());
  }
  connect() {
    this.releases = [this.sessions.subscribe(this.refresh), this.runtime.subscribe(this.refresh), this.runtime.observeCommands(this.command), this.runtime.observeActivity(this.activity)]; this.refresh();
    return () => { this.disposed = true; this.releases.forEach(fn => fn()); this.progress.dispose(); this.candidates.clear(); };
  }
  private async load(id: string) {
    if (this.loading.has(id)) return this.loading.get(id);
    const work = (async () => { try { const r = await this.progress.load(id); if (!this.disposed) this.records.set(id, r); } catch { this.readFailed.add(id); }
      finally { this.loading.delete(id); this.publish({ loadedDraft: id }); this.refresh(); } })();
    this.loading.set(id, work); return work;
  }
  private async save(record: AlternativePathsProgress) {
    if (this.failed.has(record.draftId)) return false;
    this.pending++; this.publish({ saving: true });
    try { await this.progress.save(record); return !this.disposed; } catch { this.failed.add(record.draftId); this.refresh(); return false; }
    finally { this.pending--; this.publish({ saving: this.pending > 0 }); }
  }
  private update(patch: Partial<AlternativePathsProgress>) {
    const old = this.state.record; if (!old) return Promise.resolve(false);
    const record = { ...old, ...patch }; if (same(old, record)) return Promise.resolve(true);
    this.records.set(record.draftId, record); this.publish({ record }); const saved = this.save(record); this.refresh(); return saved;
  }
  async flushProgress() { await Promise.all(this.loading.values()); await this.progress.flush(); }
  async retryProgress() {
    const id = this.runtime.activeDraftId(); if (!id) return;
    if (this.readFailed.delete(id)) { this.records.delete(id); await this.load(id); }
    this.failed.delete(id); this.lpmAttempted.delete(this.runtime.network()); const r = this.records.get(id); if (r) await this.save(r); this.refresh();
  }
  async begin() {
    if (this.state.busy || this.sessions.hasPendingOperations()) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    this.publish({ busy: true, warning: null });
    try {
      const result = await (this.runtime.openAttempt?.(alternativePathsDocument()) ?? this.sessions.openDocument(alternativePathsDocument()));
      if (!result.ok) { this.publish({ storageError: true }); return; }
      const id = result.value; this.runtime.started?.(id);
      if (this.runtime.activeDraftId() !== id || this.sessions.getState().activeDraftId !== id || this.runtime.pendingForms()) return;
      if (!this.records.has(id)) await this.load(id); if (this.readFailed.has(id)) return;
      if (!this.records.get(id)) {
        await this.runtime.checkpoint?.before(id);
        const record: AlternativePathsProgress = { schemaVersion: 1, chapterId: 'alternative-paths', chapterVersion: 3, draftId: id, attemptId: crypto.randomUUID(), prepared: false, stage: 'triangle', step: 1, completed: [], extension: null, neighbors: emptyNeighborProofs(), remoteUnderstood: false, hopUnderstood: false, lpmUnderstood: false, viaReplies: { ab: null, ba: null }, viaBaseline: null, failure: null, directReplies: { ab: null, ba: null }, investigated: null, returnInvestigated: null, lpm: emptyLpm() };
        this.records.set(id, record); this.publish({ record }); if (!await this.save(record)) return;
      }
      await this.prepare();
    } catch { const id = this.runtime.activeDraftId(); if (id) this.failed.add(id); this.publish({ storageError: true }); }
    finally { this.publish({ busy: false }); this.refresh(); }
  }
  async prepare() {
    const r = this.state.record, net = this.runtime.network();
    if (this.preparing || !r || this.state.storageError || this.runtime.pendingForms() || this.sessions.hasPendingOperations() || this.runtime.activeDraftId() !== r.draftId) return;
    this.preparing = true; this.attempted.add(net);
    try {
      if (!r.prepared) {
        await this.runtime.checkpoint?.prepared(r.draftId, { ...r, prepared: true } as unknown as MetaValue);
        if (this.runtime.activeDraftId() === r.draftId && this.runtime.network() === net) await this.update({ prepared: true });
      } else if (r.stage === 'adding-pcs') {
        const some = ALTERNATIVE_PCS.some(id => net.devices.has(id));
        const error = some ? initialAlternativePcs(net) ? null : 'conflict' : this.runtime.insert();
        if (error) { this.publish({ warning: error }); return; }
        const extension = pcIdentity(net); if (!extension) { this.publish({ warning: 'conflict' }); return; }
        await this.update({ stage: 'lans', step: 5, extension });
      }
    } catch { this.failed.add(r.draftId); this.publish({ storageError: true }); }
    finally { this.preparing = false; }
    this.refresh();
  }
  previous() { const r = this.state.record; if (!r || !this.state.active || this.state.busy || r.step === 1 || r.stage === 'adding-pcs') return; this.candidates.clear(); this.publish({ answerError: false }); void this.update({ step: r.step - 1 }); }
  async prepareLanC() {
    const r = this.state.record, net = this.runtime.network();
    if (!r || r.step !== 14 || r.lpm.legacy || r.lpm.stage === 'ready' || this.lpmPreparing || this.state.storageError || this.runtime.pendingForms() || this.runtime.restarting?.() || this.sessions.hasPendingOperations() || !this.state.active) return;
    if (!alternativeConditions(net).via || !r.hopUnderstood || !this.proof(r.viaReplies.ab) || !this.proof(r.viaReplies.ba)) return;
    this.lpmPreparing = true; this.lpmAttempted.add(net); this.publish({ busy: true });
    try {
      if (r.lpm.stage === 'unprepared') {
        if (lpmPortError(net)) { this.publish({ warning: 'lpmPort' }); return; }
        if (!await this.update({ lpm: { ...emptyLpm(), stage: 'preparing', baseline: [...net.devices.keys()] }, viaReplies: { ab: this.validated!.abHash, ba: this.validated!.abHash } })) return;
      }
      if (this.disposed || this.runtime.network() !== net || this.runtime.activeDraftId() !== r.draftId || this.runtime.pendingForms() || this.runtime.restarting?.() || this.sessions.hasPendingOperations()) return;
      const current = this.state.record!;
      const port = net.devices.get(I.r3)?.getInterface('eth3');
      const adopted = port?.up && !port.gateway && port.ip?.addr === parseIp(LPM_GATEWAY) && port.ip.prefix === 25 && (!port.link || !!findLpmPc(net, current.lpm.baseline!));
      const error = adopted ? null : lpmPortError(net) ? 'lpmPort' : this.runtime.prepareLpm ? this.runtime.prepareLpm() : 'lpmPort';
      if (error) { this.publish({ warning: error }); return; }
      await this.update({ lpm: { ...current.lpm, stage: 'ready' } });
    } catch { this.failed.add(r.draftId); this.publish({ storageError: true }); }
    finally { this.lpmPreparing = false; this.publish({ busy: false }); this.refresh(); }
  }
  private proof(value: string | null) { return !!value && !!this.validated && (value === this.validated.abHash || value === this.validated.hash); }
  private baselineMatches(value: string | null) { return !!value && value === this.validated?.failureHash; }
  async next() {
    const r = this.state.record; if (!r || !this.state.active || !this.state.passed || this.state.busy || this.state.storageError || r.step === ALTERNATIVE_TOTAL) return;
    this.candidates.clear(); this.publish({ answerError: false });
    if (r.step !== 4 || r.stage === 'lans') { await this.update({ step: r.step + 1 }); return; }
    if (ALTERNATIVE_PCS.some(id => this.runtime.network().devices.has(id)) || [L.a, L.b].some(id => this.runtime.network().links.has(id))) { this.publish({ warning: 'conflict' }); return; }
    const net = this.runtime.network(); this.publish({ busy: true });
    try { if (!await this.update({ stage: 'adding-pcs' })) return; if (this.runtime.network() === net && this.runtime.activeDraftId() === r.draftId && !this.sessions.hasPendingOperations()) await this.prepare(); }
    finally { this.publish({ busy: false }); this.refresh(); }
  }
  answer(kind: 'remote' | 'hop' | 'lpm', value: string) {
    const r = this.state.record; if (!r || !this.state.active || this.state.busy || this.state.storageError || this.state.warning) return;
    if (kind === 'remote' && r.step === 4) { const correct = value === '23' && transitConfigured(this.runtime.network()); this.publish({ answerError: !correct }); if (correct) void this.update({ remoteUnderstood: true }); }
    if (kind === 'hop' && r.step === 13 || kind === 'lpm' && r.step === 17 && !r.lpm.legacy && r.lpm.pathReply === this.validated?.lpmHash && lpmRoutesReady(this.runtime.network(), r.lpm)) { const correct = kind === 'hop' ? value === 'r2' && alternativeConditions(this.runtime.network()).via : value === 'specific'; this.publish({ answerError: !correct }); if (correct) void this.update(kind === 'hop' ? { hopUnderstood: true } : { lpmUnderstood: true }); }
  }
  private async restore(net: Network, signature: string, id: string) {
    if (this.restoring) return; this.restoring = true;
    try {
      const pcId = this.records.get(id)?.lpm.pc?.id ?? null;
      const [hash, neighborHash, failureHash, abHash, localHash, lpmHash, ...neighborHashes] = await Promise.all([signature, neighborSignature(net), failureBaselineSignature(net), abSignature(net), pcId ? lpmLocalSignature(net, pcId) : '', pcId ? lpmPathSignature(net, pcId) : '', ...[0, 1, 2].map(index => neighborLinkSignature(net, index))].map(tutorialFingerprint));
      if (!this.disposed && this.runtime.network() === net && this.runtime.activeDraftId() === id && alternativeSignature(net) === signature) this.validated = { net, signature, hash, abHash, localHash, lpmHash, pcId, neighborHash, neighborHashes, failureHash };
    } catch { this.failed.add(id); }
    finally { this.restoring = false; this.refresh(); }
  }
  private refresh = () => {
    if (this.disposed || this.runtime.restarting?.()) { this.candidates.clear(); this.awaiting = undefined; return; }
    const id = this.sessions.getState().activeDraftId, net = this.runtime.network();
    if (!id || this.runtime.activeDraftId() !== id || this.sessions.hasPendingOperations()) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); return; }
    if (!this.records.has(id)) { this.publish({ active: false, record: null, storageError: this.readFailed.has(id) }); if (!this.readFailed.has(id)) void this.load(id); return; }
    const r = this.records.get(id) ?? null; this.publish({ record: r, storageError: this.failed.has(id) || this.readFailed.has(id) });
    if (!r) { this.publish({ active: false }); return; } if (this.state.storageError) { this.publish({ active: true, passed: false }); return; }
    const signature = alternativeSignature(net);
    if (this.validated?.net !== net || this.validated.signature !== signature || this.validated.pcId !== (r.lpm.pc?.id ?? null)) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); void this.restore(net, signature, id); return; }
    const c = alternativeConditions(net), identity = pcIdentity(net);
    const lpmPc = r.lpm.pc && net.devices.get(r.lpm.pc.id);
    const warning: AlternativeWarning | null = this.runtime.pendingForms() ? 'forms' : !ALTERNATIVE_ROUTERS.every(key => net.devices.has(key)) || r.stage === 'lans' && !identity ? 'missing' : r.stage === 'lans' && !same(identity, r.extension) ? 'conflict' : !triangleWiring(net, r.step >= 18) ? 'wiring' : r.step > 3 && !(r.step >= 18 ? c.backbone : c.strict) ? 'transit' : r.stage === 'adding-pcs' && !initialAlternativePcs(net) ? pcPreparationError(net) : r.step >= 14 && r.step <= 17 && r.lpm.pc && (!lpmPc || lpmPc.getInterface('eth0')?.mac !== r.lpm.pc.mac) ? 'lpmIdentity' : r.step === 14 && !r.lpm.legacy && r.lpm.stage === 'unprepared' && lpmPortError(net) ? 'lpmPort' : null;
    const neighbors = Object.fromEntries(NEIGHBOR_TESTS.map((test, index) => [test.key, r.neighbors[test.key] === this.validated!.neighborHash || r.neighbors[test.key] === this.validated!.neighborHashes[Math.floor(index / 2)]])) as AlternativeState['neighbors'];
    const evidence = r.step >= 19 ? r.directReplies : r.viaReplies;
    const replies = { ab: this.proof(evidence.ab), ba: this.proof(evidence.ba) };
    const viaProved = c.via && this.proof(r.viaReplies.ab) && this.proof(r.viaReplies.ba);
    const local = (count: number) => Array.from({ length: count }, (_, i) => transitLinkConfigured(net, i)).every(Boolean) && NEIGHBOR_TESTS.slice(0, count * 2).every(test => neighbors[test.key]);
    const passed = !warning && r.prepared && r.stage !== 'adding-pcs' && [local(1), local(2), local(3), c.strict && r.remoteUnderstood,
      c.lanA, c.lans, c.lans && this.proof(r.investigated), c.r1Forward, c.forward, c.forward && this.proof(r.returnInvestigated),
      c.forward && c.r3Back, viaProved, viaProved && r.hopUnderstood,
      r.lpm.legacy || lpmPcValid(net, r.lpm), r.lpm.legacy || lpmPcValid(net, r.lpm) && r.lpm.localReply === this.validated.localHash,
      r.lpm.legacy || c.via && lpmRoutesReady(net, r.lpm), r.lpm.legacy || c.via && lpmRoutesReady(net, r.lpm) && r.lpm.pathReply === this.validated.lpmHash && r.lpmUnderstood,
      c.broken && r.failure === this.validated.hash, c.broken && c.direct && !!r.failure, c.broken && c.direct && !!r.failure && replies.ab && replies.ba][r.step - 1];
    const pathValid = r.step >= 19 ? c.broken && c.direct : c.via;
    const stale = Object.values(evidence).some(proof => proof !== null && (!this.proof(proof) || !pathValid));
    const pathStatus = pathValid && replies.ab && replies.ba ? 'verified' : stale ? 'invalidated' : 'expected';
    const observed = this.investigation;
    const investigationResult = !warning && r.step === 7 && observed?.net === net && observed.signature === signature && observed.draftId === id ? observed.result : null;
    this.publish({ active: true, warning, passed, pathStatus, investigationResult, lpmObserved: !warning && c.via && lpmRoutesReady(net, r.lpm) && r.lpm.pathReply === this.validated.lpmHash, failureMismatch: r.step === 18 && c.broken && !!r.viaBaseline && !this.baselineMatches(r.viaBaseline),
      neighbors: same(neighbors, this.state.neighbors) ? this.state.neighbors : neighbors, replies: same(replies, this.state.replies) ? this.state.replies : replies });
    if ((!r.prepared || r.stage === 'adding-pcs') && !this.state.busy && !warning && !this.attempted.has(net)) void this.prepare();
    if (r.step === 14 && !r.lpm.legacy && !warning && !this.state.busy) {
      if (r.lpm.stage !== 'ready' && !this.lpmAttempted.has(net)) void this.prepareLanC();
      else if (r.lpm.stage === 'ready' && !r.lpm.pc) {
        const pc = findLpmPc(net, r.lpm.baseline!);
        if (pc) { void this.update({ lpm: { ...r.lpm, pc } }); return; }
      }
    }
    if (passed) {
      const witnessed = r.step === 13 && viaProved ? [12, r.step] : r.lpm.legacy && r.step >= 14 && r.step <= 17 ? [] : [r.step];
      const completed = witnessed.every(step => r.completed.includes(step)) ? r.completed : [...new Set([...r.completed, ...witnessed])].sort((a, b) => a - b);
      if (r.step === 17 && !r.lpm.legacy && r.viaBaseline !== this.validated.failureHash) void this.update({ completed: completed.filter(step => step <= 17), viaBaseline: this.validated.failureHash, failure: null, directReplies: { ab: null, ba: null } });
      else if (completed !== r.completed) void this.update({ completed });
    }
  };
  private reportInvestigation(result: AlternativeState['investigationResult']) {
    const r = this.state.record;
    if (!r || r.step !== 7 || !this.validated) return;
    this.investigation = { net: this.runtime.network(), signature: this.validated.signature, draftId: r.draftId, result };
    this.publish({ investigationResult: result });
  }
  private command = (event: TerminalCommandEvent) => {
    this.refresh(); const r = this.state.record, command = event.command, net = this.runtime.network();
    if (event.type === 'started') this.awaiting = undefined;
    if (!r || !this.state.active || this.state.warning || !this.validated || this.runtime.pendingForms() || command.network !== net || !['keyboard', 'quick-ping'].includes(command.source)) return;
    if (event.type === 'started') {
      if (![1, 2, 3, 7, 10, 12, 13, 14, 15, 17, 18, 20].includes(r.step)) return;
      const args = command.line.trim().split(/\s+/); if (args.shift()?.toLowerCase() !== 'ping') return;
      const targets: string[] = []; for (let index = 0; index < args.length; index++) { if (['-c', '-n'].includes(args[index])) { index++; continue; } if (!args[index].startsWith('-')) targets.push(args[index]); }
      if (targets.length !== 1) return;
      const target = parseIp(targets[0]), d = net.devices.get(command.deviceId); if (target === null || !(d instanceof IpDevice)) return;
      const route = d.lookupRoute(target), source = route && d.getInterface(route.ifaceName)?.ip?.addr; if (source === undefined || source === null) return;
      let key: Candidate['key'], path: string[], returnPath: string[] | undefined;
      if (r.step <= 3) {
        const test = NEIGHBOR_TESTS.slice((r.step - 1) * 2, r.step * 2).find(test => test.from === command.deviceId && test.target === targets[0]);
        if (!test || route?.kind !== 'connected' || route.ifaceName !== test.iface) return;
        key = test.key; path = [test.from, test.to];
      } else if (r.step === 15 || r.step === 17) {
        if (r.lpm.legacy || !r.lpm.pc || !lpmPcValid(net, r.lpm)) return;
        if (r.step === 15) {
          if (command.deviceId !== r.lpm.pc.id || targets[0] !== LPM_GATEWAY || route?.kind !== 'connected') return;
          key = 'local'; path = [r.lpm.pc.id, I.r3];
        } else {
          if (command.deviceId !== I.a || targets[0] !== LPM_ADDRESS || !alternativeConditions(net).via || !lpmRoutesReady(net, r.lpm)) return;
          key = 'lpm'; const paths = lpmPaths(r.lpm.pc.id); path = paths.request; returnPath = paths.reply;
        }
      } else {
        const pair = command.deviceId === I.a && targets[0] === alternativeTarget(net, I.b) ? 'ab' : command.deviceId === I.b && targets[0] === alternativeTarget(net, I.a) ? 'ba' : null;
        const c = alternativeConditions(net);
        if (!pair || r.step === 7 && (pair !== 'ab' || !c.lans || !c.strict) || r.step === 10 && (pair !== 'ab' || !c.forward) || [12, 13, 14].includes(r.step) && !c.via || r.step === 18 && (pair !== 'ab' || !c.broken || !this.baselineMatches(r.viaBaseline)) || r.step === 20 && (!c.broken || !c.direct || !r.failure)) return;
        key = pair; path = expectedPcPath(pair, r.step === 20 ? 'direct' : 'via');
      }
      const firstRouter = net.devices.get(I.r1);
      if (r.step === 7) this.reportInvestigation(null);
      this.candidates.set(command.id, { command, step: r.step, signature: this.validated.signature, key, source, target, path, returnPath, output: '', proved: false, paths: new Map(), missingR1Route: firstRouter instanceof IpDevice && lacksRoute(firstRouter, target) }); this.awaiting = command.id; return;
    }
    const candidate = this.candidates.get(command.id); if (!candidate || candidate.signature !== this.validated.signature || candidate.step !== r.step) return;
    if (event.type === 'finished') { this.candidates.delete(command.id); if (this.awaiting === command.id) this.awaiting = undefined; return; }
    candidate.output = (candidate.output + event.text).slice(-8192); if (candidate.proved) return;
    if (r.step === 7) {
      const firstRouter = net.devices.get(I.r1);
      const missing = candidate.missingR1Route && firstRouter instanceof IpDevice && lacksRoute(firstRouter, candidate.target) && candidate.output.split(/\r?\n/).some(line => {
        const linux = /^From (\d+\.\d+\.\d+\.\d+) icmp_seq=(\d+) Destination Net Unreachable$/.exec(line);
        const windows = /^Reply from (\d+\.\d+\.\d+\.\d+): Destination net unreachable\.$/.exec(line);
        const address = parseIp(linux?.[1] ?? windows?.[1] ?? '');
        if (address === null || !firstRouter.hasIp(address)) return false;
        const traces = linux ? [candidate.paths.get(Number(linux[2]))] : [...candidate.paths.values()];
        return traces.some(trace => same(trace?.request, [[I.a, I.r1]]));
      });
      if (missing) this.reportInvestigation('missing-route');
      else if (candidate.output.split(/\r?\n/).some(line => {
        const linux = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
        const windows = /^Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+$/.exec(line);
        if (parseIp(linux?.[1] ?? windows?.[1] ?? '') !== candidate.target) return false;
        const traces = linux ? [candidate.paths.get(Number(linux[2]))] : windows ? [...candidate.paths.values()] : [];
        return traces.some(trace => trace?.request.at(-1)?.[1] === I.b && trace.reply.at(-1)?.[1] === I.a);
      })) this.reportInvestigation('reply');
    }
    if ([7, 10, 18].includes(r.step)) {
      const failed = candidate.output.split(/\r?\n/).some(line => {
        const m = /(?:icmp_seq=(\d+) Destination (?:Net|Host) Unreachable|no answer yet for icmp_seq=(\d+))/.exec(line), seq = Number(m?.[1] ?? m?.[2]);
        const pathMatches = (trace: { request: [string, string][] } | undefined) => r.step === 10 ? same(trace?.request, candidate.path.slice(1).map((id, index) => [candidate.path[index], id])) : same(trace?.request[0], [I.a, I.r1]);
        if (m) return pathMatches(candidate.paths.get(seq));
        return /^(?:Request timed out\.|Reply from \d+\.\d+\.\d+\.\d+: Destination (?:net|host) unreachable\.)$/.test(line) && [...candidate.paths.values()].some(pathMatches);
      });
      if (failed && (r.step !== 18 || alternativeConditions(net).broken && this.baselineMatches(r.viaBaseline))) {
        if (r.step === 7 && !this.state.investigationResult) this.reportInvestigation('other');
        candidate.proved = true; void this.update({ [r.step === 7 ? 'investigated' : r.step === 10 ? 'returnInvestigated' : 'failure']: r.step === 18 ? this.validated.hash : this.validated.abHash }); return;
      }
      if (r.step === 18) return;
    }
    const reply = candidate.output.split(/\r?\n/).some(line => {
      const m = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
      const windows = /^Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+$/.exec(line);
      if (parseIp(m?.[1] ?? windows?.[1] ?? '') !== candidate.target) return false;
      // Windows omits seq in its text. The trace still has this command's exact
      // protocol ID, endpoints and seq; no other command's path can be used.
      const traces = m ? [candidate.paths.get(Number(m[2]))] : windows ? [...candidate.paths.values()] : [];
      const edges = (nodes: string[]) => nodes.slice(1).map((id, index) => [nodes[index], id]);
      return traces.some(trace => !!trace && same(trace.request, edges(candidate.path)) && same(trace.reply, edges(candidate.returnPath ?? [...candidate.path].reverse())));
    });
    if (!reply) return; candidate.proved = true;
    if (r.step <= 3) {
      void this.update({ neighbors: { ...r.neighbors, [candidate.key]: this.validated.neighborHashes[r.step - 1] } });
    } else if (candidate.key === 'local' || candidate.key === 'lpm') {
      void this.update({ lpm: { ...r.lpm, [candidate.key === 'local' ? 'localReply' : 'pathReply']: candidate.key === 'local' ? this.validated.localHash : this.validated.lpmHash } });
    } else if (r.step === 7 || r.step === 10) {
      void this.update({ [r.step === 7 ? 'investigated' : 'returnInvestigated']: this.validated.abHash });
    } else {
      const via = [12, 13, 14].includes(r.step), field = via ? 'viaReplies' : 'directReplies', keep = Object.values(r[field]).every(value => value === null || this.proof(value));
      // Normalize both still-valid legacy receipts together. Mixing an old full
      // hash with a new scoped hash would violate the persisted pair contract.
      const previous = keep ? { ab: r[field].ab ? this.validated.abHash : null, ba: r[field].ba ? this.validated.abHash : null } : { ab: null, ba: null };
      void this.update({ [field]: { ...previous, [candidate.key]: this.validated.abHash }, completed: keep ? r.completed : r.completed.filter(step => step !== (via ? 12 : 20)) });
    }
  };
  private activity = (event: NetworkObservation) => {
    if (!this.state.active || this.state.warning || !this.validated || event.network !== this.runtime.network() || this.runtime.pendingForms()) return;
    if (event.kind === 'ping') {
      if (event.event.type !== 'started' || this.awaiting === undefined) return;
      const candidate = this.candidates.get(this.awaiting);
      if (candidate?.command.deviceId === event.event.deviceId) candidate.icmpId = event.event.icmpId;
      this.awaiting = undefined; return;
    }
    for (const candidate of this.candidates.values()) {
      if (candidate.proved || candidate.icmpId !== event.icmpId || candidate.signature !== this.validated.signature) continue;
      const request = event.direction === 'request';
      if (event.source !== (request ? candidate.source : candidate.target) || event.destination !== (request ? candidate.target : candidate.source)) continue;
      const paths = candidate.paths.get(event.seq) ?? { request: [], reply: [] };
      paths[event.direction].push([event.from, event.to]); candidate.paths.set(event.seq, paths);
    }
  };
}
