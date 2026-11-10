import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import type { TerminalCommandEvent, TerminalCommandContext } from '../terminalCommandEvents';
import type { NetworkObservation } from '../networkObservations';
import type { MetaValue, ProjectDocument } from '../projects/types';
import { completedLpmBeforeStorm, stormDocument } from './alternativeStorm';
import { IpDevice } from '../engine/ipdevice';
import { networkOf, parseIp } from '../engine/ip';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import { tutorialFingerprint } from './tutorialProgress';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_TOTAL, ALTERNATIVE_ROUTERS, ALTERNATIVE_PCS, ALTERNATIVE_LINKS as L, NEIGHBOR_TESTS, alternativeConditions, alternativeSignature, neighborSignature, neighborLinkSignature, failureBaselineSignature, triangleWiring, transitConfigured, transitLinkConfigured, pcIdentity, initialAlternativePcs, pcPreparationError, alternativeTarget, expectedPcPath, type AlternativeWarning, type NeighborTest } from './alternativePathsChapter';
import { alternativeStepCompleted, alternativeFailureBaseline, AlternativePathsProgressStore, type AlternativePathsProgress } from './alternativePathsProgress';
import { createAlternativeEntryAttempt, createAlternativeBeginningAttempt } from './alternativeEntries';
import type { AlternativeEntryPoint } from './alternativeEntryContract';
import { emptyLpm, abSignature, lpmPortError, findLpmPc, lpmPcValid, lpmLocalSignature, lpmPathSignature, lpmBroadSignature, lpmR2Signature, lpmExperimentConditions, lpmPaths, LPM_ADDRESS, LPM_GATEWAY } from './alternativeLpm';

type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'hasPendingOperations' | 'openDocument'>;
export interface AlternativeRuntime {
  openAttempt?: SessionController['openDocument']; checkpoint?: ChapterCheckpointHooks; restarting?(): boolean;
  network(): Network; activeDraftId(): string | null; pendingForms(): boolean;
  subscribe(fn: () => void): () => void; observeCommands(fn: (event: TerminalCommandEvent) => void): () => void;
  observeActivity(fn: (event: NetworkObservation) => void): () => void;
  insert(): AlternativeWarning | null; started?(id: string): void;
  prepareLpm?(): AlternativeWarning | null;
  captureDocument?(): ProjectDocument;
  stormHistory?(changed: boolean, before:AlternativePathsProgress): (after:AlternativePathsProgress) => void;
  nameLanC?(pc: { id: string; mac: string }): void;
}
export interface AlternativeState {
  active: boolean; busy: boolean; saving: boolean; storageError: boolean; loadedDraft: string | null;
  record: AlternativePathsProgress | null; passed: boolean; historical: boolean; reviewing: boolean; canAdvance: boolean; warning: AlternativeWarning | null; answerError: boolean;
  neighbors: Record<NeighborTest, boolean>; replies: { ab: boolean; ba: boolean };
  pathStatus: 'expected' | 'verified' | 'invalidated'; failureMismatch: boolean;
  investigationResult: 'missing-route' | 'missing-return' | 'reply' | 'other' | null;
  lpmObserved: boolean;
  experiment: { r2Route: boolean; broadRoute: boolean; specificRoute: boolean; r2Ping: boolean; broadPing: boolean; specificPing: boolean; broadBlocked: boolean };
}
interface Candidate {
  command: TerminalCommandContext; step: number; signature: string; key: NeighborTest | 'ab' | 'ba' | 'local' | 'r2' | 'broad' | 'specific'; source: number; target: number;
  path: string[]; observedReturn?: boolean; icmpId?: number; output: string; proved: boolean;
  paths: Map<number, { request: [string, string][]; reply: [string, string][] }>;
  missingR1Route: boolean;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lacksRoute = (device: IpDevice, target: number) => !device.routes().some(route => networkOf(target, route.prefix) === route.dest);
export class AlternativePathsController {
  private state: AlternativeState = { active: false, busy: false, saving: false, storageError: false, loadedDraft: null, record: null, passed: false, historical: false, reviewing: false, canAdvance: false, warning: null, answerError: false, neighbors: Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, false])) as AlternativeState['neighbors'], replies: { ab: false, ba: false }, pathStatus: 'expected', failureMismatch: false, investigationResult: null, lpmObserved: false, experiment: { r2Route: false, broadRoute: false, specificRoute: false, r2Ping: false, broadPing: false, specificPing: false, broadBlocked: false } };
  private entry?: { draftId: string; attemptId: string; step: number; historical: boolean };
  // Presentation evidence only. Historical "investigated" does not encode a cause.
  private investigation?: { net: Network; signature: string; draftId: string; step: number; result: AlternativeState['investigationResult'] };
  private listeners = new Set<() => void>(); private releases: (() => void)[] = [];
  private records = new Map<string, AlternativePathsProgress | null>(); private loading = new Map<string, Promise<void>>();
  private failed = new Set<string>(); private readFailed = new Set<string>(); private attempted = new WeakSet<Network>();
  private pending = 0; private disposed = false; private restoring = false; private preparing = false;
  private lpmPreparing = false; private lpmAttempted = new WeakSet<Network>();
  private stormPreparing = false;
  private focusedDraft: string | null = null;
  private validated?: { net: Network; signature: string; hash: string; abHash: string; neighborHash: string; neighborHashes: string[]; failureHash: string; pcId: string | null; localHash: string; lpmHash: string; r2Hash: string; broadHash: string };
  private candidates = new Map<number, Candidate>(); private awaiting?: number;
  private repeatedReplies?: { net: Network; draftId: string; hash: string; field: 'viaReplies' | 'directReplies'; ab: boolean; ba: boolean };
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
  async begin(entry?: AlternativeEntryPoint) {
    if (this.state.busy || this.sessions.hasPendingOperations()) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    this.publish({ busy: true, warning: null });
    try {
      const initial=entry?await createAlternativeEntryAttempt(entry):createAlternativeBeginningAttempt();
      initial.options.initialization!.control=[...initial.options.initialization!.control,await this.progress.openingSelection(initial.progress)];
      const document=initial.document;
      const result = await (this.runtime.openAttempt?.(document,initial.options) ?? this.sessions.openDocument(document,initial.options));
      if (!result.ok) { this.publish({ storageError: true }); return; }
      const id = result.value; this.runtime.started?.(id);
      if (this.runtime.activeDraftId() !== id || this.sessions.getState().activeDraftId !== id || this.runtime.pendingForms()) return;
      if (!this.records.has(id)) await this.load(id); if (this.readFailed.has(id)) return;
      if (!this.records.get(id)) throw Error('Atomic attempt progress missing.');
      await this.prepare();
    } catch { const id = this.runtime.activeDraftId(); if (id&&!entry) this.failed.add(id); this.publish({ storageError: true }); }
    finally { this.refresh(); await this.progress.flush(); this.publish({ busy: false }); this.refresh(); }
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
  previous() { const r = this.state.record; if (!r || !this.state.active || this.state.busy || r.step <= (r.entry?.firstTask??1) || r.stage === 'adding-pcs') return; this.candidates.clear(); this.publish({ answerError: false }); void this.update({ step: r.step - 1 }); }
  async prepareLanC() {
    const r = this.state.record, net = this.runtime.network();
    if (!r || r.step !== 14 || r.lpm.legacy || r.lpm.stage === 'ready' || this.lpmPreparing || this.state.storageError || this.runtime.pendingForms() || this.runtime.restarting?.() || this.sessions.hasPendingOperations() || !this.state.active) return;
    const supplied = r.entry?.point === 'part-3';
    if (!alternativeConditions(net).via || !supplied && (!r.hopUnderstood || !this.proof(r.viaReplies.ab) || !this.proof(r.viaReplies.ba))) return;
    this.lpmPreparing = true; this.lpmAttempted.add(net); this.publish({ busy: true });
    try {
      if (r.lpm.stage === 'unprepared') {
        if (lpmPortError(net)) { this.publish({ warning: 'lpmPort' }); return; }
        if (!await this.update({ lpm: { ...emptyLpm(), stage: 'preparing', baseline: [...net.devices.keys()] }, viaReplies: supplied?r.viaReplies:{ ab: this.validated!.abHash, ba: this.validated!.abHash } })) return;
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
  private async prepareStorm() {
    const r = this.state.record, net = this.runtime.network();
    if (!r || r.step !== 20 || r.storm !== 'pending' || this.stormPreparing || this.state.busy || this.state.storageError || this.state.warning || this.runtime.pendingForms() || this.runtime.restarting?.() || this.sessions.hasPendingOperations() || !this.state.active) return;
    if (!this.baselineMatches(alternativeFailureBaseline(r)) || !net.links.get(L.left)?.operational) { this.publish({ warning: 'conflict' }); return; }
    const signature = alternativeSignature(net);
    this.stormPreparing = true; this.publish({ busy: true }); this.candidates.clear();
    try {
      await this.flushProgress();
      if (this.disposed || this.runtime.network() !== net || alternativeSignature(net) !== signature || this.runtime.activeDraftId() !== r.draftId || this.state.record?.step !== 20 || this.runtime.pendingForms() || this.runtime.restarting?.() || this.sessions.hasPendingOperations()) return;
      const expected = this.runtime.captureDocument?.(); if (!expected) throw Error('Atomic incident unavailable.');
      const alreadyDown = !net.links.get(L.right)?.operational;
      const next = { ...this.state.record!, storm: alreadyDown ? 'adopted' as const : 'applied' as const };
      const finishHistory = this.runtime.stormHistory?.(!alreadyDown,this.state.record!);
      await this.progress.commitStorm(next, expected, alreadyDown ? expected : stormDocument(expected));
      finishHistory?.(next);
      this.records.set(r.draftId, next); this.publish({ record: next });
    } catch { this.failed.add(r.draftId); this.publish({ storageError: true }); }
    finally { this.stormPreparing = false; this.publish({ busy: false }); this.refresh(); }
  }
  async next() {
    const r = this.state.record; if (!r || !this.state.active || !this.state.canAdvance || this.state.busy || this.state.storageError || this.runtime.pendingForms() || r.step === ALTERNATIVE_TOTAL) return;
    this.candidates.clear(); this.publish({ answerError: false });
    if (r.step !== 4 || r.stage === 'lans') { await this.update({ step: r.step + 1 }); return; }
    if (ALTERNATIVE_PCS.some(id => this.runtime.network().devices.has(id)) || [L.a, L.b].some(id => this.runtime.network().links.has(id))) { this.publish({ warning: 'conflict' }); return; }
    const net = this.runtime.network(); this.publish({ busy: true });
    try { if (!await this.update({ stage: 'adding-pcs' })) return; if (this.runtime.network() === net && this.runtime.activeDraftId() === r.draftId && !this.sessions.hasPendingOperations()) await this.prepare(); }
    finally { this.publish({ busy: false }); this.refresh(); }
  }
  answer(kind: 'remote' | 'hop' | 'lpm', value: string) {
    // A review shows the saved answer, not a new answer graded against a later network.
    if (this.state.historical && !this.state.passed) { this.publish({ answerError: false }); return; }
    const r = this.state.record; if (!r || !this.state.active || this.state.busy || this.state.storageError || this.state.warning) return;
    if (kind === 'remote' && r.step === 4) { const correct = value === '23' && transitConfigured(this.runtime.network()); this.publish({ answerError: !correct }); if (correct) void this.update({ remoteUnderstood: true }); }
    if (kind === 'hop' && r.step === 13 || kind === 'lpm' && r.step === 19 && !r.lpm.experiment.legacy && this.state.lpmObserved) { const correct = kind === 'hop' ? value === 'r2' && alternativeConditions(this.runtime.network()).via : value === 'specific'; this.publish({ answerError: !correct }); if (correct) void this.update(kind === 'hop' ? { hopUnderstood: true } : { lpmUnderstood: true }); }
  }
  private async restore(net: Network, signature: string, id: string) {
    if (this.restoring) return; this.restoring = true;
    try {
      const pcId = this.records.get(id)?.lpm.pc?.id ?? null;
      const [hash, neighborHash, failureHash, abHash, localHash, lpmHash, r2Hash, broadHash, ...neighborHashes] = await Promise.all([signature, neighborSignature(net), failureBaselineSignature(net), abSignature(net), pcId ? lpmLocalSignature(net, pcId) : '', pcId ? lpmPathSignature(net, pcId) : '', pcId ? lpmR2Signature(net, pcId) : '', pcId ? lpmBroadSignature(net, pcId) : '', ...[0, 1, 2].map(index => neighborLinkSignature(net, index))].map(tutorialFingerprint));
      if (!this.disposed && this.runtime.network() === net && this.runtime.activeDraftId() === id && alternativeSignature(net) === signature) this.validated = { net, signature, hash, abHash, localHash, lpmHash, r2Hash, broadHash, pcId, neighborHash, neighborHashes, failureHash };
    } catch { this.failed.add(id); }
    finally { this.restoring = false; this.refresh(); }
  }
  private refresh = () => {
    if (this.disposed || this.runtime.restarting?.()) { this.candidates.clear(); this.awaiting = undefined; return; }
    const id = this.sessions.getState().activeDraftId, net = this.runtime.network();
    if (this.entry?.draftId !== id) this.entry = undefined;
    if (!id || this.runtime.activeDraftId() !== id || this.sessions.hasPendingOperations()) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); return; }
    if (!this.records.has(id)) { this.publish({ active: false, record: null, storageError: this.readFailed.has(id) }); if (!this.readFailed.has(id)) void this.load(id); return; }
    const r = this.records.get(id) ?? null; this.publish({ record: r, storageError: this.failed.has(id) || this.readFailed.has(id) });
    if (!r) { this.focusedDraft=null;this.publish({ active: false }); return; } if (this.state.storageError) { this.publish({ active: true, passed: false, canAdvance: false }); return; }
    if(this.focusedDraft!==id){this.focusedDraft=id;void this.progress.selectCurrent(r).catch(()=>{this.failed.add(id);this.focusedDraft=null;this.refresh();});}
    const signature = alternativeSignature(net);
    if (this.validated?.net !== net || this.validated.signature !== signature || this.validated.pcId !== (r.lpm.pc?.id ?? null)) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); void this.restore(net, signature, id); return; }
    const c = alternativeConditions(net), identity = pcIdentity(net), lpmHistory = completedLpmBeforeStorm(r);
    const lpmPc = r.lpm.pc && net.devices.get(r.lpm.pc.id);
    const warning: AlternativeWarning | null = this.runtime.pendingForms() ? 'forms' : !ALTERNATIVE_ROUTERS.every(key => net.devices.has(key)) || r.stage === 'lans' && !identity ? 'missing' : r.stage === 'lans' && !same(identity, r.extension) ? 'conflict' : !triangleWiring(net, r.step >= 20 || lpmHistory) ? 'wiring' : r.step > 3 && !(r.step >= 20 || lpmHistory ? c.backbone : c.strict) ? 'transit' : r.stage === 'adding-pcs' && !initialAlternativePcs(net) ? pcPreparationError(net) : r.step >= 14 && r.step <= 19 && r.lpm.pc && (!lpmPc || lpmPc.getInterface('eth0')?.mac !== r.lpm.pc.mac) ? 'lpmIdentity' : r.step === 14 && !r.lpm.legacy && r.lpm.stage === 'unprepared' && lpmPortError(net) ? 'lpmPort' : null;
    const neighbors = Object.fromEntries(NEIGHBOR_TESTS.map((test, index) => [test.key, r.neighbors[test.key] === this.validated!.neighborHash || r.neighbors[test.key] === this.validated!.neighborHashes[Math.floor(index / 2)]])) as AlternativeState['neighbors'];
    const evidence = r.step >= 21 ? r.directReplies : r.viaReplies;
    const replies = { ab: this.proof(evidence.ab), ba: this.proof(evidence.ba) };
    const viaProved = c.via && this.proof(r.viaReplies.ab) && this.proof(r.viaReplies.ba);
    const conditions = lpmExperimentConditions(net, r.lpm), e = r.lpm.experiment;
    const experiment = { r2Route: conditions.r2Route, broadRoute: conditions.broadRoute, specificRoute: conditions.specificRoute,
      r2Ping: !!e.r2 && e.r2.hash === this.validated.r2Hash,
      broadPing: !!e.broad && e.broad.hash === this.validated.broadHash,
      specificPing: !!e.specific && e.specific.hash === this.validated.lpmHash,
      broadBlocked: r.step === 17 && conditions.specificRoute && e.broad?.hash !== this.validated.broadHash };
    const lpmObserved = !warning && experiment.r2Ping && experiment.broadPing && experiment.specificPing && conditions.specificSelected;
    const local = (count: number) => Array.from({ length: count }, (_, i) => transitLinkConfigured(net, i)).every(Boolean) && NEIGHBOR_TESTS.slice(0, count * 2).every(test => neighbors[test.key]);
    const historical = alternativeStepCompleted(r);
    // Entering an already earned task is a review, even if it is still valid.
    // First-time success stays ordinary feedback; no new metadata is persisted.
    if (!this.entry || this.entry.draftId !== id || this.entry.attemptId !== r.attemptId || this.entry.step !== r.step || !historical)
      this.entry = { draftId: id, attemptId: r.attemptId, step: r.step, historical };
    const passed = !warning && r.prepared && r.stage !== 'adding-pcs' && [local(1), local(2), local(3), c.strict && r.remoteUnderstood,
      c.lanA, c.lans, c.lans && this.proof(r.investigated), c.r1Forward, c.forward, c.forward && this.proof(r.returnInvestigated),
      c.forward && c.r3Back, viaProved, viaProved && r.hopUnderstood,
      lpmPcValid(net, r.lpm), lpmPcValid(net, r.lpm) && r.lpm.localReply === this.validated.localHash,
      conditions.r2Route && experiment.r2Ping,
      conditions.broadSelected && experiment.broadPing,
      conditions.specificSelected && experiment.specificPing,
      lpmObserved && r.lpmUnderstood,
      r.storm !== 'pending' && c.broken && r.failure === this.validated.hash, c.direct && !!r.failure, c.direct && !!r.failure && replies.ab && replies.ba][r.step - 1];
    // Reviewing earned credit may cross obsolete or damaged configurations.
    // Never use that permission to record fresh technical completion below.
    const canAdvance = !this.runtime.pendingForms() && r.prepared && r.stage !== 'adding-pcs' && (historical || passed);
    const pathValid = r.step >= 21 ? c.direct : c.via;
    const stale = Object.values(evidence).some(proof => proof !== null && (!this.proof(proof) || !pathValid));
    const pathStatus = pathValid && replies.ab && replies.ba ? 'verified' : stale ? 'invalidated' : 'expected';
    const observed = this.investigation;
    const investigationResult = !warning && [7, 10].includes(r.step) && observed?.step === r.step && observed.net === net && observed.signature === signature && observed.draftId === id ? observed.result : null;
    this.publish({ active: true, warning, passed, historical, reviewing: historical && (this.entry.historical || !passed), canAdvance, pathStatus, investigationResult, lpmObserved, experiment: same(experiment, this.state.experiment) ? this.state.experiment : experiment, failureMismatch: r.step === 20 && (r.storm === 'legacy' || !r.failure) && c.broken && !!alternativeFailureBaseline(r) && !this.baselineMatches(alternativeFailureBaseline(r)),
      neighbors: same(neighbors, this.state.neighbors) ? this.state.neighbors : neighbors, replies: same(replies, this.state.replies) ? this.state.replies : replies });
    if ((!r.prepared || r.stage === 'adding-pcs') && !this.state.busy && !warning && !this.attempted.has(net)) void this.prepare();
    if (r.step === 20 && r.storm === 'pending' && !warning && !this.state.busy) void this.prepareStorm();
    if (r.step === 14 && !historical && !r.lpm.legacy && !warning && !this.state.busy) {
      if (r.lpm.stage !== 'ready' && !this.lpmAttempted.has(net)) void this.prepareLanC();
      else if (r.lpm.stage === 'ready' && !r.lpm.pc) {
        const pc = findLpmPc(net, r.lpm.baseline!);
        if (pc) { void this.update({ lpm: { ...r.lpm, pc } }); return; }
      }
      if (r.lpm.pc && r.lpm.pc.nameChecked === undefined) {
        const pc = { ...r.lpm.pc, nameChecked: true };
        // Persist the one-shot decision first: Undo/F5 must never repeat a rename.
        // Already-proved older activities keep their names and receipt hashes.
        const unproved = !r.lpm.localReply && !r.lpm.pathReply && !e.r2 && !e.broad && !e.specific && !r.completed.some(step => step >= 15);
        void this.update({ lpm: { ...r.lpm, pc } }).then(saved => {
          if (saved && unproved && !this.disposed && this.runtime.network() === net && this.runtime.activeDraftId() === id &&
              this.state.record?.step === 14 && this.state.record.lpm.pc?.id === pc.id && this.state.record.lpm.pc.mac === pc.mac && !this.runtime.pendingForms()) this.runtime.nameLanC?.(pc);
        });
        return;
      }
    }
    if (passed) {
      const witnessed = r.step === 13 && viaProved ? [12, r.step] : (r.lpm.legacy && r.step >= 14 || e.legacy && r.step >= 16) && r.step <= 19 ? [] : [r.step];
      const completed = witnessed.every(step => r.completed.includes(step)) ? r.completed : [...new Set([...r.completed, ...witnessed])].sort((a, b) => a - b);
      if (r.step === 19 && (r.storm === 'pending' || r.storm === 'legacy' && !r.failure) && !e.legacy && r.viaBaseline !== this.validated.failureHash) void this.update({ completed: completed.filter(step => step <= 19), viaBaseline: this.validated.failureHash, failure: null, directReplies: { ab: null, ba: null } });
      else if (completed !== r.completed) void this.update({ completed });
    }
  };
  private reportInvestigation(result: AlternativeState['investigationResult']) {
    const r = this.state.record;
    if (!r || ![7, 10].includes(r.step) || !this.validated) return;
    this.investigation = { net: this.runtime.network(), signature: this.validated.signature, draftId: r.draftId, step: r.step, result };
    this.publish({ investigationResult: result });
  }
  private command = (event: TerminalCommandEvent) => {
    this.refresh(); const r = this.state.record, command = event.command, net = this.runtime.network();
    if (event.type === 'started') this.awaiting = undefined;
    if (!r || !this.state.active || this.state.warning || !this.validated || this.runtime.pendingForms() || command.network !== net || !['keyboard', 'quick-ping'].includes(command.source)) return;
    if (event.type === 'started') {
      if (r.step === 20 && r.storm === 'pending') return;
      if (r.entry?.point === 'part-3' && r.step === 14) return; // Earlier A/B tasks were supplied, not performed in this attempt.
      if (![1, 2, 3, 7, 10, 12, 13, 14, 15, 16, 17, 18, 20, 22].includes(r.step)) return;
      const args = command.line.trim().split(/\s+/); if (args.shift()?.toLowerCase() !== 'ping') return;
      const targets: string[] = []; for (let index = 0; index < args.length; index++) { if (['-c', '-n'].includes(args[index])) { index++; continue; } if (!args[index].startsWith('-')) targets.push(args[index]); }
      if (targets.length !== 1) return;
      const target = parseIp(targets[0]), d = net.devices.get(command.deviceId); if (target === null || !(d instanceof IpDevice)) return;
      const route = d.lookupRoute(target), source = route && d.getInterface(route.ifaceName)?.ip?.addr; if (source === undefined || source === null) return;
      let key: Candidate['key'], path: string[], observedReturn = false;
      if (r.step <= 3) {
        const test = NEIGHBOR_TESTS.slice((r.step - 1) * 2, r.step * 2).find(test => test.from === command.deviceId && test.target === targets[0]);
        if (!test || route?.kind !== 'connected' || route.ifaceName !== test.iface) return;
        key = test.key; path = [test.from, test.to];
      } else if (r.step >= 15 && r.step <= 18) {
        if (r.lpm.legacy || r.lpm.experiment.legacy || !r.lpm.pc || !lpmPcValid(net, r.lpm)) return;
        if (r.step === 15) {
          if (command.deviceId !== r.lpm.pc.id || targets[0] !== LPM_GATEWAY || route?.kind !== 'connected') return;
          key = 'local'; path = [r.lpm.pc.id, I.r3];
        } else if (r.step === 16) {
          if (command.deviceId !== I.r2 || targets[0] !== LPM_ADDRESS || !lpmExperimentConditions(net, r.lpm).r2Route) return;
          key = 'r2'; path = [I.r2, I.r3, r.lpm.pc.id]; observedReturn = true;
        } else {
          const conditions = lpmExperimentConditions(net, r.lpm);
          if (command.deviceId !== I.a || targets[0] !== LPM_ADDRESS || !(r.step === 17 ? conditions.broadSelected : conditions.specificSelected)) return;
          key = r.step === 17 ? 'broad' : 'specific';
          path = r.step === 17 ? [I.a, I.r1, I.r2, I.r3, r.lpm.pc.id] : lpmPaths(r.lpm.pc.id).request; observedReturn = true;
        }
      } else {
        const pair = command.deviceId === I.a && targets[0] === alternativeTarget(net, I.b) ? 'ab' : command.deviceId === I.b && targets[0] === alternativeTarget(net, I.a) ? 'ba' : null;
        const c = alternativeConditions(net);
        if (!pair || r.step === 7 && (pair !== 'ab' || !c.lans || !c.strict) || r.step === 10 && (pair !== 'ab' || !c.forward) || [12, 13, 14].includes(r.step) && !c.via || r.step === 20 && (pair !== 'ab' || !c.broken || !this.baselineMatches(alternativeFailureBaseline(r)) || r.storm !== 'legacy' && (net.links.get(L.right)?.operational || !net.links.get(L.left)?.operational)) || r.step === 22 && (!c.direct || !r.failure)) return;
        key = pair; path = expectedPcPath(pair, r.step === 22 ? 'direct' : 'via');
      }
      const firstRouter = net.devices.get(I.r1);
      if ([7, 10].includes(r.step)) this.reportInvestigation(null);
      this.candidates.set(command.id, { command, step: r.step, signature: this.validated.signature, key, source, target, path, observedReturn, output: '', proved: false, paths: new Map(), missingR1Route: firstRouter instanceof IpDevice && lacksRoute(firstRouter, target) }); this.awaiting = command.id; return;
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
    if ([7, 10, 20].includes(r.step)) {
      const failed = candidate.output.split(/\r?\n/).some(line => {
        const m = /(?:icmp_seq=(\d+) Destination (?:Net|Host) Unreachable|no answer yet for icmp_seq=(\d+))/.exec(line), seq = Number(m?.[1] ?? m?.[2]);
        const pathMatches = (trace: { request: [string, string][] } | undefined) => r.step === 10 ? same(trace?.request, candidate.path.slice(1).map((id, index) => [candidate.path[index], id])) : r.step === 20 && r.storm !== 'legacy' ? same(trace?.request, [[I.a, I.r1], [I.r1, I.r2]]) : same(trace?.request[0], [I.a, I.r1]);
        if (m) return pathMatches(candidate.paths.get(seq));
        return /^(?:Request timed out\.|Reply from \d+\.\d+\.\d+\.\d+: Destination (?:net|host) unreachable\.)$/.test(line) && [...candidate.paths.values()].some(pathMatches);
      });
      if (failed && (r.step !== 20 || alternativeConditions(net).broken && this.baselineMatches(alternativeFailureBaseline(r)))) {
        if (r.step === 7 && !this.state.investigationResult) this.reportInvestigation('other');
        if (r.step === 10) {
          // Explain only this command's observed return failure. A timeout or
          // historical completion alone cannot identify a missing return route.
          const reverse = [...candidate.path].reverse();
          const missingReturn = [...candidate.paths.values()].some(trace => {
            if (!same(trace.request, candidate.path.slice(1).map((id, i) => [candidate.path[i], id])) || !trace.reply.length) return false;
            if (!same(trace.reply, reverse.slice(1, trace.reply.length + 1).map((id, i) => [reverse[i], id]))) return false;
            const stoppedAt = net.devices.get(trace.reply.at(-1)![1]);
            return stoppedAt instanceof IpDevice && (stoppedAt.id === I.r2 || stoppedAt.id === I.r3) && lacksRoute(stoppedAt, candidate.source);
          });
          this.reportInvestigation(missingReturn ? 'missing-return' : 'other');
        }
        candidate.proved = true; void this.update({ [r.step === 7 ? 'investigated' : r.step === 10 ? 'returnInvestigated' : 'failure']: r.step === 20 ? this.validated.hash : this.validated.abHash }); return;
      }
      if (r.step === 20) return;
    }
    let provedReturn: string[] | undefined;
    const reply = candidate.output.split(/\r?\n/).some(line => {
      const m = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
      const windows = /^Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+$/.exec(line);
      if (parseIp(m?.[1] ?? windows?.[1] ?? '') !== candidate.target) return false;
      // Windows omits seq in its text. The trace still has this command's exact
      // protocol ID, endpoints and seq; no other command's path can be used.
      const traces = m ? [candidate.paths.get(Number(m[2]))] : windows ? [...candidate.paths.values()] : [];
      const edges = (nodes: string[]) => nodes.slice(1).map((id, index) => [nodes[index], id]);
      return traces.some(trace => {
        if (!trace || !same(trace.request, edges(candidate.path))) return false;
        const validReturn = candidate.observedReturn
          ? trace.reply.length > 0 && trace.reply[0][0] === candidate.path.at(-1) && trace.reply.at(-1)![1] === command.deviceId && trace.reply.every(([from], i) => i === 0 || from === trace.reply[i - 1][1])
          : same(trace.reply, edges([...candidate.path].reverse()));
        if (validReturn) provedReturn = [trace.reply[0][0], ...trace.reply.map(edge => edge[1])];
        return validReturn;
      });
    });
    if (!reply) return; candidate.proved = true;
    if (r.step === 10) this.reportInvestigation('reply');
    if (r.step <= 3) {
      void this.update({ neighbors: { ...r.neighbors, [candidate.key]: this.validated.neighborHashes[r.step - 1] } });
    } else if (candidate.key === 'local') {
      void this.update({ lpm: { ...r.lpm, localReply: this.validated.localHash } });
    } else if (candidate.key === 'r2' || candidate.key === 'broad' || candidate.key === 'specific') {
      const hash = candidate.key === 'r2' ? this.validated.r2Hash : candidate.key === 'broad' ? this.validated.broadHash : this.validated.lpmHash;
      void this.update({ lpm: { ...r.lpm, experiment: { ...r.lpm.experiment, [candidate.key]: { hash, reply: provedReturn! } } } });
    } else if (r.step === 7 || r.step === 10) {
      void this.update({ [r.step === 7 ? 'investigated' : 'returnInvestigated']: this.validated.abHash });
    } else {
      const via = [12, 13, 14].includes(r.step), field = via ? 'viaReplies' : 'directReplies', keep = Object.values(r[field]).every(value => value === null || this.proof(value));
      if (!keep && alternativeStepCompleted(r, via ? 12 : 22)) {
        // Keep the certified old pair intact while only one new reply exists.
        // Replace it atomically after both directions match the new configuration.
        const old = this.repeatedReplies;
        const fresh: NonNullable<typeof this.repeatedReplies> = old?.net === net && old.draftId === r.draftId && old.hash === this.validated.abHash && old.field === field
          ? old : { net, draftId: r.draftId, hash: this.validated.abHash, field, ab: false, ba: false };
        if (candidate.key !== 'ab' && candidate.key !== 'ba') return;
        fresh[candidate.key] = true; this.repeatedReplies = fresh;
        if (fresh.ab && fresh.ba) void this.update({ [field]: { ab: fresh.hash, ba: fresh.hash } });
        return;
      }
      // Normalize both still-valid legacy receipts together. Mixing an old full
      // hash with a new scoped hash would violate the persisted pair contract.
      const previous = keep ? { ab: r[field].ab ? this.validated.abHash : null, ba: r[field].ba ? this.validated.abHash : null } : { ab: null, ba: null };
      void this.update({ [field]: { ...previous, [candidate.key]: this.validated.abHash }, completed: keep ? r.completed : r.completed.filter(step => step !== (via ? 12 : 22)) });
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
