import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import type { TerminalCommandEvent, TerminalCommandContext } from '../terminalCommandEvents';
import type { NetworkObservation } from '../networkObservations';
import type { MetaValue } from '../projects/types';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import { tutorialFingerprint } from './tutorialProgress';
import { ALTERNATIVE_IDS as I, ALTERNATIVE_TOTAL, ALTERNATIVE_ROUTERS, ALTERNATIVE_PCS, ALTERNATIVE_LINKS as L, NEIGHBOR_TESTS, alternativePathsDocument, alternativeConditions, alternativeSignature, neighborSignature, neighborLinkSignature, failureBaselineSignature, triangleWiring, transitConfigured, transitLinkConfigured, pcIdentity, initialAlternativePcs, pcPreparationError, alternativeTarget, expectedPcPath, type AlternativeWarning, type NeighborTest } from './alternativePathsChapter';
import { emptyNeighborProofs, AlternativePathsProgressStore, type AlternativePathsProgress } from './alternativePathsProgress';

type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'hasPendingOperations' | 'openDocument'>;
export interface AlternativeRuntime {
  openAttempt?: SessionController['openDocument']; checkpoint?: ChapterCheckpointHooks; restarting?(): boolean;
  network(): Network; activeDraftId(): string | null; pendingForms(): boolean;
  subscribe(fn: () => void): () => void; observeCommands(fn: (event: TerminalCommandEvent) => void): () => void;
  observeActivity(fn: (event: NetworkObservation) => void): () => void;
  insert(): AlternativeWarning | null; started?(id: string): void;
}
export interface AlternativeState {
  active: boolean; busy: boolean; saving: boolean; storageError: boolean; loadedDraft: string | null;
  record: AlternativePathsProgress | null; passed: boolean; warning: AlternativeWarning | null; answerError: boolean;
  neighbors: Record<NeighborTest, boolean>; replies: { ab: boolean; ba: boolean };
  pathStatus: 'expected' | 'verified' | 'invalidated'; failureMismatch: boolean;
}
interface Candidate {
  command: TerminalCommandContext; step: number; signature: string; key: NeighborTest | 'ab' | 'ba'; source: number; target: number;
  path: string[]; icmpId?: number; output: string; proved: boolean;
  paths: Map<number, { request: [string, string][]; reply: [string, string][] }>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class AlternativePathsController {
  private state: AlternativeState = { active: false, busy: false, saving: false, storageError: false, loadedDraft: null, record: null, passed: false, warning: null, answerError: false, neighbors: Object.fromEntries(NEIGHBOR_TESTS.map(test => [test.key, false])) as AlternativeState['neighbors'], replies: { ab: false, ba: false }, pathStatus: 'expected', failureMismatch: false };
  private listeners = new Set<() => void>(); private releases: (() => void)[] = [];
  private records = new Map<string, AlternativePathsProgress | null>(); private loading = new Map<string, Promise<void>>();
  private failed = new Set<string>(); private readFailed = new Set<string>(); private attempted = new WeakSet<Network>();
  private pending = 0; private disposed = false; private restoring = false; private preparing = false;
  private validated?: { net: Network; signature: string; hash: string; neighborHash: string; neighborHashes: string[]; failureHash: string };
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
    this.failed.delete(id); const r = this.records.get(id); if (r) await this.save(r); this.refresh();
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
        const record: AlternativePathsProgress = { schemaVersion: 1, chapterId: 'alternative-paths', chapterVersion: 2, draftId: id, attemptId: crypto.randomUUID(), prepared: false, stage: 'triangle', step: 1, completed: [], extension: null, neighbors: emptyNeighborProofs(), remoteUnderstood: false, hopUnderstood: false, lpmUnderstood: false, viaReplies: { ab: null, ba: null }, viaBaseline: null, failure: null, directReplies: { ab: null, ba: null }, investigated: null, returnInvestigated: null };
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
    if (kind === 'hop' && r.step === 13 || kind === 'lpm' && r.step === 14) { const correct = kind === 'hop' ? value === 'r2' && alternativeConditions(this.runtime.network()).via : value === 'specific'; this.publish({ answerError: !correct }); if (correct) void this.update(kind === 'hop' ? { hopUnderstood: true } : { lpmUnderstood: true }); }
  }
  private async restore(net: Network, signature: string, id: string) {
    if (this.restoring) return; this.restoring = true;
    try {
      const [hash, neighborHash, failureHash, ...neighborHashes] = await Promise.all([signature, neighborSignature(net), failureBaselineSignature(net), ...[0, 1, 2].map(index => neighborLinkSignature(net, index))].map(tutorialFingerprint));
      if (!this.disposed && this.runtime.network() === net && this.runtime.activeDraftId() === id && alternativeSignature(net) === signature) this.validated = { net, signature, hash, neighborHash, neighborHashes, failureHash };
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
    if (this.validated?.net !== net || this.validated.signature !== signature) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); void this.restore(net, signature, id); return; }
    const c = alternativeConditions(net), identity = pcIdentity(net);
    const warning: AlternativeWarning | null = this.runtime.pendingForms() ? 'forms' : !ALTERNATIVE_ROUTERS.every(key => net.devices.has(key)) || r.stage === 'lans' && !identity ? 'missing' : r.stage === 'lans' && !same(identity, r.extension) ? 'conflict' : !triangleWiring(net, r.step >= 15) ? 'wiring' : r.step > 3 && !(r.step >= 15 ? c.backbone : c.strict) ? 'transit' : r.stage === 'adding-pcs' && !initialAlternativePcs(net) ? pcPreparationError(net) : null;
    const neighbors = Object.fromEntries(NEIGHBOR_TESTS.map((test, index) => [test.key, r.neighbors[test.key] === this.validated!.neighborHash || r.neighbors[test.key] === this.validated!.neighborHashes[Math.floor(index / 2)]])) as AlternativeState['neighbors'];
    const evidence = r.step >= 16 ? r.directReplies : r.viaReplies;
    const replies = { ab: evidence.ab === this.validated.hash, ba: evidence.ba === this.validated.hash };
    const viaProved = c.via && r.viaReplies.ab === this.validated.hash && r.viaReplies.ba === this.validated.hash;
    const local = (count: number) => Array.from({ length: count }, (_, i) => transitLinkConfigured(net, i)).every(Boolean) && NEIGHBOR_TESTS.slice(0, count * 2).every(test => neighbors[test.key]);
    const passed = !warning && r.prepared && r.stage !== 'adding-pcs' && [local(1), local(2), local(3), c.strict && r.remoteUnderstood,
      c.lanA, c.lans, c.lans && r.investigated === this.validated.hash, c.r1Forward, c.forward, c.forward && r.returnInvestigated === this.validated.hash,
      c.forward && c.r3Back, viaProved, viaProved && r.hopUnderstood, viaProved && r.hopUnderstood && r.lpmUnderstood,
      c.broken && r.failure === this.validated.hash, c.broken && c.direct && !!r.failure, c.broken && c.direct && !!r.failure && replies.ab && replies.ba][r.step - 1];
    const pathValid = r.step >= 16 ? c.broken && c.direct : c.via;
    const stale = Object.values(evidence).some(proof => proof !== null && (proof !== this.validated!.hash || !pathValid));
    const pathStatus = pathValid && replies.ab && replies.ba ? 'verified' : stale ? 'invalidated' : 'expected';
    this.publish({ active: true, warning, passed, pathStatus, failureMismatch: r.step === 15 && c.broken && !!r.viaBaseline && this.validated.failureHash !== r.viaBaseline,
      neighbors: same(neighbors, this.state.neighbors) ? this.state.neighbors : neighbors, replies: same(replies, this.state.replies) ? this.state.replies : replies });
    if ((!r.prepared || r.stage === 'adding-pcs') && !this.state.busy && !warning && !this.attempted.has(net)) void this.prepare();
    if (passed) {
      const witnessed = (r.step === 13 || r.step === 14) && viaProved ? [12, r.step] : [r.step];
      const completed = witnessed.every(step => r.completed.includes(step)) ? r.completed : [...new Set([...r.completed, ...witnessed])].sort((a, b) => a - b);
      if (r.step === 14 && r.viaBaseline !== this.validated.failureHash) void this.update({ completed: completed.filter(step => step <= 14), viaBaseline: this.validated.failureHash, failure: null, directReplies: { ab: null, ba: null } });
      else if (completed !== r.completed) void this.update({ completed });
    }
  };
  private command = (event: TerminalCommandEvent) => {
    this.refresh(); const r = this.state.record, command = event.command, net = this.runtime.network();
    if (event.type === 'started') this.awaiting = undefined;
    if (!r || !this.state.active || this.state.warning || !this.validated || this.runtime.pendingForms() || command.network !== net || !['keyboard', 'quick-ping'].includes(command.source)) return;
    if (event.type === 'started') {
      if (![1, 2, 3, 7, 10, 12, 13, 14, 15, 17].includes(r.step)) return;
      const args = command.line.trim().split(/\s+/); if (args.shift()?.toLowerCase() !== 'ping') return;
      const targets: string[] = []; for (let index = 0; index < args.length; index++) { if (['-c', '-n'].includes(args[index])) { index++; continue; } if (!args[index].startsWith('-')) targets.push(args[index]); }
      if (targets.length !== 1) return;
      const target = parseIp(targets[0]), d = net.devices.get(command.deviceId); if (target === null || !(d instanceof IpDevice)) return;
      const route = d.lookupRoute(target), source = route && d.getInterface(route.ifaceName)?.ip?.addr; if (source === undefined || source === null) return;
      let key: Candidate['key'], path: string[];
      if (r.step <= 3) {
        const test = NEIGHBOR_TESTS.slice((r.step - 1) * 2, r.step * 2).find(test => test.from === command.deviceId && test.target === targets[0]);
        if (!test || route?.kind !== 'connected' || route.ifaceName !== test.iface) return;
        key = test.key; path = [test.from, test.to];
      } else {
        const pair = command.deviceId === I.a && targets[0] === alternativeTarget(net, I.b) ? 'ab' : command.deviceId === I.b && targets[0] === alternativeTarget(net, I.a) ? 'ba' : null;
        const c = alternativeConditions(net);
        if (!pair || r.step === 7 && (pair !== 'ab' || !c.lans || !c.strict) || r.step === 10 && (pair !== 'ab' || !c.forward) || [12, 13, 14].includes(r.step) && !c.via || r.step === 15 && (pair !== 'ab' || !c.broken || this.validated.failureHash !== r.viaBaseline) || r.step === 17 && (!c.broken || !c.direct || !r.failure)) return;
        key = pair; path = expectedPcPath(pair, r.step === 17 ? 'direct' : 'via');
      }
      this.candidates.set(command.id, { command, step: r.step, signature: this.validated.signature, key, source, target, path, output: '', proved: false, paths: new Map() }); this.awaiting = command.id; return;
    }
    const candidate = this.candidates.get(command.id); if (!candidate || candidate.signature !== this.validated.signature || candidate.step !== r.step) return;
    if (event.type === 'finished') { this.candidates.delete(command.id); if (this.awaiting === command.id) this.awaiting = undefined; return; }
    candidate.output = (candidate.output + event.text).slice(-8192); if (candidate.proved) return;
    if ([7, 10, 15].includes(r.step)) {
      const failed = candidate.output.split(/\r?\n/).some(line => {
        const m = /(?:icmp_seq=(\d+) Destination (?:Net|Host) Unreachable|no answer yet for icmp_seq=(\d+))/.exec(line), seq = Number(m?.[1] ?? m?.[2]);
        const pathMatches = (trace: { request: [string, string][] } | undefined) => r.step === 10 ? same(trace?.request, candidate.path.slice(1).map((id, index) => [candidate.path[index], id])) : same(trace?.request[0], [I.a, I.r1]);
        if (m) return pathMatches(candidate.paths.get(seq));
        return /^(?:Request timed out\.|Reply from \d+\.\d+\.\d+\.\d+: Destination (?:net|host) unreachable\.)$/.test(line) && [...candidate.paths.values()].some(pathMatches);
      });
      if (failed && (r.step !== 15 || alternativeConditions(net).broken && this.validated.failureHash === r.viaBaseline)) {
        candidate.proved = true; void this.update({ [r.step === 7 ? 'investigated' : r.step === 10 ? 'returnInvestigated' : 'failure']: this.validated.hash }); return;
      }
      if (r.step === 15) return;
    }
    const reply = candidate.output.split(/\r?\n/).some(line => {
      const m = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
      const windows = /^Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+$/.exec(line);
      if (parseIp(m?.[1] ?? windows?.[1] ?? '') !== candidate.target) return false;
      // Windows omits seq in its text. The trace still has this command's exact
      // protocol ID, endpoints and seq; no other command's path can be used.
      const traces = m ? [candidate.paths.get(Number(m[2]))] : windows ? [...candidate.paths.values()] : [];
      const edges = (nodes: string[]) => nodes.slice(1).map((id, index) => [nodes[index], id]);
      return traces.some(trace => !!trace && same(trace.request, edges(candidate.path)) && same(trace.reply, edges([...candidate.path].reverse())));
    });
    if (!reply) return; candidate.proved = true;
    if (r.step <= 3) {
      void this.update({ neighbors: { ...r.neighbors, [candidate.key]: this.validated.neighborHashes[r.step - 1] } });
    } else if (r.step === 7 || r.step === 10) {
      void this.update({ [r.step === 7 ? 'investigated' : 'returnInvestigated']: this.validated.hash });
    } else {
      const via = [12, 13, 14].includes(r.step), field = via ? 'viaReplies' : 'directReplies', keep = Object.values(r[field]).every(value => value === null || value === this.validated!.hash);
      void this.update({ [field]: { ...(keep ? r[field] : { ab: null, ba: null }), [candidate.key]: this.validated.hash }, completed: keep ? r.completed : r.completed.filter(step => step !== (via ? 12 : 17)) });
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
