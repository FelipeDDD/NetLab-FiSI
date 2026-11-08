import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { Shell, type Running } from '../commands/shell';
import type { StaticVerificationPresentation } from './staticRoutingVerification';
import type { TerminalCommandEvent, TerminalCommandContext } from '../terminalCommandEvents';
import type { MetaValue } from '../projects/types';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import { tutorialFingerprint } from './tutorialProgress';
import { STATIC_IDS as I, STATIC_BASE_IDS, STATIC_EXTENSION_IDS, STATIC_EXTENSION_LINKS, STATIC_PAIRS, staticRoutingDocument, staticRoutingConditions, staticRoutingSignature, staticTarget, staticExtensionIdentity, initialStaticExtension, staticExpansionError, type StaticWarning, type StaticPair } from './staticRoutingChapter';
import { emptyStaticReplies, type MissingRouter, type StaticRoutingProgress, StaticRoutingProgressStore } from './staticRoutingProgress';

type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'hasPendingOperations' | 'openDocument'>;
export interface StaticRoutingRuntime {
  openAttempt?: SessionController['openDocument']; checkpoint?: ChapterCheckpointHooks;
  network(): Network; activeDraftId(): string | null; pendingForms(): boolean; restarting?(): boolean;
  subscribe(fn: () => void): () => void; observeCommands(fn: (e: TerminalCommandEvent) => void): () => void;
  expand(): StaticWarning | null; started?(id: string): void;
  verificationPresentation?: StaticVerificationPresentation;
}
export interface StaticRoutingState {
  active: boolean; busy: boolean; saving: boolean; storageError: boolean; loadedDraft: string | null;
  record: StaticRoutingProgress | null; warning: StaticWarning | null; passed: boolean; answerError: boolean;
  replies: Record<StaticPair, boolean>;
  verification: { running: boolean; statuses: Record<StaticPair, StaticVerificationStatus> };
}
export type StaticVerificationStatus = 'pending' | 'running' | 'confirmed' | 'failed';
const pendingVerification = () => Object.fromEntries(STATIC_PAIRS.map(pair => [pair, 'pending'])) as Record<StaticPair, StaticVerificationStatus>;
interface FinalRun {
  net: Network; draft: string; attempt: string; signature: string; index: number;
  command?: TerminalCommandContext; handle?: Running | null; finished: boolean; replied: boolean;
  initialized: boolean; restore?: () => void;
}
interface Candidate { command: TerminalCommandContext; signature: string; step: number; pair: StaticPair; output: string; proved: boolean; missing: boolean }
export class StaticRoutingTutorialController {
  private state: StaticRoutingState = { active: false, busy: false, saving: false, storageError: false, loadedDraft: null, record: null, warning: null, passed: false, answerError: false, replies: { ab: false, ba: false, ac: false, ca: false, bc: false, cb: false }, verification: { running: false, statuses: pendingVerification() } };
  private listeners = new Set<() => void>(); private releases: (() => void)[] = [];
  private records = new Map<string, StaticRoutingProgress | null>(); private loading = new Map<string, Promise<void>>();
  private readFailed = new Set<string>(); private failed = new Set<string>(); private attempted = new WeakSet<Network>();
  private pending = 0; private disposed = false; private restoring = false; private preparing = false;
  private validated?: { net: Network; signature: string; hash: string };
  private candidates = new Map<number, Candidate>();
  private finalRun?: FinalRun; private finalVisit?: string; private finalCommandId = 0; private pumping = false;
  constructor(private sessions: Sessions, private runtime: StaticRoutingRuntime, private progress: StaticRoutingProgressStore) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  holdsDraft(id: string | null) { return !!id && (!this.records.has(id) || !!this.records.get(id)); }
  private publish(patch: Partial<StaticRoutingState>) {
    if (this.disposed || Object.entries(patch).every(([key, value]) => this.state[key as keyof StaticRoutingState] === value)) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn());
  }
  connect() {
    this.releases = [this.sessions.subscribe(this.refresh), this.runtime.subscribe(this.refresh), this.runtime.observeCommands(this.command)]; this.refresh();
    return () => { this.cancelFinalVerification(); this.disposed = true; this.releases.forEach(fn => fn()); this.progress.dispose(); this.candidates.clear(); };
  }
  enterFinalVerification() {
    const r = this.state.record;
    if (!r || r.step !== 11 || !this.state.active || this.finalVisit === r.attemptId) return;
    this.finalVisit = r.attemptId;
    if (!r.completed.includes(11)) this.startFinalVerification();
  }
  startFinalVerification() {
    const r = this.state.record;
    if (!r || r.step !== 11 || !this.state.active || this.state.busy || this.state.storageError || this.state.warning || this.state.passed || this.finalRun) return;
    const run: FinalRun = { net: this.runtime.network(), draft: r.draftId, attempt: r.attemptId, signature: staticRoutingSignature(this.runtime.network()), index: 0, finished: false, replied: false, initialized: false };
    this.finalRun = run;
    this.publish({ verification: { running: true, statuses: pendingVerification() } });
    run.restore = this.runtime.verificationPresentation?.begin(); run.initialized = true;
    this.pumpFinalVerification();
  }
  cancelFinalVerification = () => {
    const run = this.finalRun; if (!run) return;
    this.finalRun = undefined;
    if (run.command) this.candidates.delete(run.command.id);
    run.handle?.cancel(); run.restore?.();
    const statuses = { ...this.state.verification.statuses };
    for (const pair of STATIC_PAIRS) if (statuses[pair] === 'running') statuses[pair] = 'pending';
    this.publish({ verification: { running: false, statuses } });
  };
  private pumpFinalVerification() {
    const run = this.finalRun;
    if (!run || !run.initialized || this.pumping) return;
    if (!this.state.active || this.state.storageError || this.state.warning) { this.cancelFinalVerification(); return; }
    if (run.command && !run.finished || this.runtime.verificationPresentation && !this.runtime.verificationPresentation.ready()) return;
    this.pumping = true;
    try {
      if (run.command) {
        const pair = STATIC_PAIRS[run.index];
        this.publish({ verification: { running: true, statuses: { ...this.state.verification.statuses, [pair]: run.replied ? 'confirmed' : 'failed' } } });
        run.index++; run.command = undefined; run.handle = undefined;
      }
      if (run.index === STATIC_PAIRS.length) { this.cancelFinalVerification(); return; }
      const pair = STATIC_PAIRS[run.index], device = run.net.devices.get(I[pair[0] as 'a']), target = staticTarget(run.net, pair[1] as 'a');
      if (!(device instanceof IpDevice) || !target) { this.cancelFinalVerification(); return; }
      const command: TerminalCommandContext = { id: --this.finalCommandId, network: run.net, deviceId: device.id, line: `ping -c 1 ${target}`, source: 'api' };
      run.command = command; run.finished = false; run.replied = false;
      this.publish({ verification: { running: true, statuses: { ...this.state.verification.statuses, [pair]: 'running' } } });
      this.command({ type: 'started', command });
      // The same Shell/runPing and validator as terminal input. A private command
      // identity admits only this owned API invocation, never arbitrary probes.
      const handle = new Shell(device).exec(command.line, { write: text => {
        if (this.finalRun !== run) return;
        this.command({ type: 'output', command, text });
        run.replied ||= this.candidates.get(command.id)?.proved === true;
      } }, () => {
        if (this.finalRun !== run) return;
        this.command({ type: 'finished', command, reason: 'completed' });
        run.finished = true;
        queueMicrotask(() => this.pumpFinalVerification());
      });
      if (this.finalRun === run) run.handle = run.finished ? null : handle;
      else handle?.cancel();
    } finally { this.pumping = false; }
  }
  private async load(id: string) {
    if (this.loading.has(id)) return this.loading.get(id);
    const work = (async () => { try { const r = await this.progress.load(id); if (!this.disposed) this.records.set(id, r); }
      catch { this.readFailed.add(id); }
      finally { this.loading.delete(id); this.publish({ loadedDraft: id }); this.refresh(); } })();
    this.loading.set(id, work); return work;
  }
  private async save(record: StaticRoutingProgress) {
    if (this.failed.has(record.draftId)) return false;
    this.pending++; this.publish({ saving: true });
    try { await this.progress.save(record); return !this.disposed; }
    catch { this.failed.add(record.draftId); this.refresh(); return false; }
    finally { this.pending--; this.publish({ saving: this.pending > 0 }); }
  }
  private update(patch: Partial<StaticRoutingProgress>) {
    const old = this.state.record; if (!old) return Promise.resolve(false);
    const record = { ...old, ...patch }; if (JSON.stringify(old) === JSON.stringify(record)) return Promise.resolve(true);
    this.records.set(record.draftId, record); this.publish({ record }); const saved = this.save(record); this.refresh(); return saved;
  }
  async flushProgress() { await Promise.all(this.loading.values()); await this.progress.flush(); }
  async retryProgress() {
    const id = this.runtime.activeDraftId(); if (!id) return;
    if (this.readFailed.delete(id)) { this.records.delete(id); await this.load(id); }
    this.failed.delete(id); this.publish({ storageError: false }); const r = this.records.get(id); if (r) await this.save(r); this.refresh();
  }
  async begin() {
    if (this.state.busy || this.sessions.hasPendingOperations()) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    this.publish({ busy: true, warning: null });
    try {
      const result = await (this.runtime.openAttempt?.(staticRoutingDocument()) ?? this.sessions.openDocument(staticRoutingDocument()));
      if (!result.ok) { this.publish({ storageError: true }); return; }
      const id = result.value; this.runtime.started?.(id);
      if (this.runtime.activeDraftId() !== id || this.sessions.getState().activeDraftId !== id || this.runtime.pendingForms()) return;
      if (!this.records.has(id)) await this.load(id); if (this.readFailed.has(id)) return;
      if (!this.records.get(id)) {
        await this.runtime.checkpoint?.before(id);
        const record: StaticRoutingProgress = { schemaVersion: 1, chapterId: 'static-routing', chapterVersion: 2, draftId: id, attemptId: crypto.randomUUID(), prepared: false, stage: 'line', step: 1, completed: [], investigated: null, missingAnswer: null, extension: null, inspectedR1: false, retested: null, returnInvestigated: null, lineReplies: { ab: null, ba: null }, finalReplies: emptyStaticReplies() };
        this.records.set(id, record); this.publish({ record }); if (!await this.save(record)) return;
      }
      await this.prepare();
    } catch { const id = this.runtime.activeDraftId(); if (id) this.failed.add(id); this.publish({ storageError: true }); }
    finally { this.publish({ busy: false }); this.refresh(); }
  }
  async prepare() {
    const r = this.state.record, net = this.runtime.network();
    if (this.preparing || !r || this.runtime.activeDraftId() !== r.draftId || this.sessions.hasPendingOperations() || this.runtime.pendingForms() || this.state.storageError) return;
    this.preparing = true; this.attempted.add(net);
    try {
      if (!r.prepared) {
        const prepared = { ...r, prepared: true };
        await this.runtime.checkpoint?.prepared(r.draftId, prepared as unknown as MetaValue);
        if (this.runtime.network() === net && this.runtime.activeDraftId() === r.draftId) await this.update({ prepared: true });
      } else if (r.stage === 'expanding') {
        const any = STATIC_EXTENSION_IDS.some(id => net.devices.has(id));
        const error = any ? initialStaticExtension(net) ? null : 'conflict' : this.runtime.expand();
        if (error) { this.publish({ warning: error }); return; }
        const extension = staticExtensionIdentity(net); if (!extension) { this.publish({ warning: 'conflict' }); return; }
        await this.update({ stage: 'lan-c', step: 9, extension });
      }
    } catch { this.failed.add(r.draftId); this.publish({ storageError: true }); }
    finally { this.preparing = false; }
    this.refresh();
  }
  previous() {
    const r = this.state.record; if (!r || !this.state.active || this.state.busy || r.step === 1 || r.stage === 'expanding') return;
    this.cancelFinalVerification(); this.finalVisit = undefined;
    this.candidates.clear(); this.publish({ answerError: false }); void this.update({ step: r.step - 1 });
  }
  async next() {
    const r = this.state.record; if (!r || !this.state.active || !this.state.passed || this.state.busy || this.state.storageError || r.step === 11) return;
    this.candidates.clear(); this.publish({ answerError: false });
    if (r.step !== 8 || r.stage === 'lan-c') { await this.update({ step: r.step + 1 }); return; }
    if (STATIC_EXTENSION_IDS.some(id => this.runtime.network().devices.has(id)) || STATIC_EXTENSION_LINKS.some(id => this.runtime.network().links.has(id))) { this.publish({ warning: 'conflict' }); return; }
    const net = this.runtime.network(); this.publish({ busy: true });
    try {
      if (!await this.update({ stage: 'expanding' })) return;
      if (this.runtime.network() !== net || this.runtime.activeDraftId() !== r.draftId || this.sessions.hasPendingOperations()) return;
      await this.prepare();
    } finally { this.publish({ busy: false }); this.refresh(); }
  }
  chooseMissing(answer: MissingRouter) {
    const r = this.state.record; if (!r || !this.state.active || r.step !== 3 || this.state.busy) return;
    const c = staticRoutingConditions(this.runtime.network());
    const correct = c.base && (answer === 'none' ? c.forward : c.firstMissing === I[answer]);
    this.publish({ answerError: !correct }); if (correct) void this.update({ missingAnswer: answer });
  }
  private async restore(net: Network, signature: string, id: string) {
    if (this.restoring) return; this.restoring = true;
    try { const hash = await tutorialFingerprint(signature); if (!this.disposed && this.runtime.network() === net && this.runtime.activeDraftId() === id && staticRoutingSignature(net) === signature) this.validated = { net, signature, hash }; }
    catch { this.failed.add(id); this.publish({ storageError: true }); }
    finally { this.restoring = false; this.refresh(); }
  }
  private refresh = () => {
    if (this.disposed || this.runtime.restarting?.()) { this.cancelFinalVerification(); this.finalVisit = undefined; this.candidates.clear(); return; }
    const id = this.sessions.getState().activeDraftId, net = this.runtime.network();
    const run = this.finalRun, current = id ? this.records.get(id) : null;
    if (current?.step !== 11) this.finalVisit = undefined;
    if (run && (run.net !== net || run.draft !== id || current?.attemptId !== run.attempt || current?.step !== 11 || staticRoutingSignature(net) !== run.signature || this.sessions.hasPendingOperations())) this.cancelFinalVerification();
    if (!id || id !== this.runtime.activeDraftId() || this.sessions.hasPendingOperations()) { this.candidates.clear(); this.publish({ active: false }); return; }
    if (!this.records.has(id)) { this.publish({ active: false, record: null }); if (!this.readFailed.has(id)) void this.load(id); else this.publish({ storageError: true }); return; }
    const r = this.records.get(id) ?? null;
    this.publish({ record: r, storageError: this.failed.has(id) || this.readFailed.has(id) });
    if (!r) { this.publish({ active: false }); return; }
    if (this.state.storageError) { this.publish({ active: true, passed: false }); return; }
    const signature = staticRoutingSignature(net);
    if (this.validated?.net !== net || this.validated.signature !== signature) { this.candidates.clear(); this.publish({ active: false }); void this.restore(net, signature, id); return; }
    const c = staticRoutingConditions(net), missing = !STATIC_BASE_IDS.every(key => net.devices.has(key));
    const extension = staticExtensionIdentity(net), identity = r.stage !== 'lan-c' || JSON.stringify(extension) === JSON.stringify(r.extension);
    const warning: StaticWarning | null = this.runtime.pendingForms() ? 'forms' : missing || r.stage === 'lan-c' && !extension ? 'missing' : !identity ? 'conflict' : !c.base ? 'network' : r.stage === 'expanding' ? staticExpansionError(net) : null;
    const proof = r.step === 11 ? r.finalReplies : r.lineReplies;
    const replies = Object.fromEntries(STATIC_PAIRS.map(pair => [pair, (proof as Record<string, string | null>)[pair] === this.validated!.hash])) as Record<StaticPair, boolean>;
    const missingCorrect = r.missingAnswer === 'none' ? c.forward : r.missingAnswer !== null && c.firstMissing === I[r.missingAnswer];
    const passed = !warning && r.prepared && r.stage !== 'expanding' && [!!r.investigated, r.inspectedR1 && c.r1Forward, r.retested === this.validated.hash && c.r1Forward && missingCorrect, c.forward, r.returnInvestigated === this.validated.hash && c.forward, c.forward && c.r3Back, c.forward && c.backward, c.forward && c.backward && (replies.ab && replies.ba || r.stage === 'lan-c' && r.completed.includes(8)), c.lanC, c.toC, c.toC && STATIC_PAIRS.every(key => replies[key])][r.step - 1];
    this.publish({ active: true, warning, passed, replies: JSON.stringify(replies) === JSON.stringify(this.state.replies) ? this.state.replies : replies });
    if ((!r.prepared || r.stage === 'expanding') && !this.state.busy && !warning && !this.state.storageError && !this.attempted.has(net)) void this.prepare();
    if (passed && !r.completed.includes(r.step)) void this.update({ completed: [...r.completed, r.step].sort((a, b) => a - b) });
    this.pumpFinalVerification();
  };
  private command = (event: TerminalCommandEvent) => {
    this.refresh(); const r = this.state.record, net = this.runtime.network(), command = event.command;
    if (!r || !this.state.active || this.state.warning || !this.validated || this.runtime.pendingForms() || command.network !== net || !['keyboard', 'quick-ping'].includes(command.source) && !(r.step === 11 && this.finalRun?.command === command)) return;
    if (event.type === 'finished' && r.step === 2 && command.deviceId === I.r1 && command.source === 'keyboard' && /^ip\s+(?:-4\s+)?route(?:\s+(?:show|list))?\s*$/.test(command.line.trim()) && event.reason === 'completed') { void this.update({ inspectedR1: true }); return; }
    if (event.type === 'started') {
      if (![1, 3, 5, 8, 11].includes(r.step)) return;
      const args = command.line.trim().split(/\s+/); if (args.shift()?.toLowerCase() !== 'ping') return;
      const targets: string[] = []; for (let i = 0; i < args.length; i++) { if (['-c', '-n'].includes(args[i])) { i++; continue; } if (!args[i].startsWith('-')) targets.push(args[i]); }
      if (targets.length !== 1) return;
      const pair = STATIC_PAIRS.find(key => command.deviceId === I[key[0] as 'a'] && staticTarget(net, key[1] as 'a') === targets[0]);
      if (!pair || [1, 3, 5].includes(r.step) && pair !== 'ab' || r.step === 8 && !['ab', 'ba'].includes(pair)) return;
      this.candidates.set(command.id, { command, signature: this.validated.signature, step: r.step, pair, output: '', proved: false, missing: r.step === 1 && staticRoutingConditions(net).firstMissing === I.r1 }); return;
    }
    const candidate = this.candidates.get(command.id);
    if (!candidate || candidate.signature !== this.validated.signature || candidate.step !== r.step) return;
    if (event.type === 'finished') {
      this.candidates.delete(command.id);
      const c = staticRoutingConditions(net), timedOut = /(?:no answer yet for icmp_seq=\d+|Request timed out\.)/.test(candidate.output);
      const r2Error = /(?:^|\n)From 10\.0\.(?:12\.2|23\.1) icmp_seq=\d+ Destination Net Unreachable/.test(candidate.output);
      if (candidate.proved) return;
      if (r.step === 3 && c.r1Forward && (c.firstMissing === I.r2 || c.forward) && (timedOut || r2Error)) void this.update({ retested: this.validated.hash });
      if (r.step === 5 && c.forward && !c.backward && timedOut) void this.update({ returnInvestigated: this.validated.hash });
      return;
    }
    candidate.output = (candidate.output + event.text).slice(-8192);
    if (candidate.proved) return;
    const target = staticTarget(net, candidate.pair[1] as 'a'), c = staticRoutingConditions(net);
    const reply = candidate.output.split(/\r?\n/).some(line => { const m = /^(?:64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=\d+ ttl=\d+ time=[\d.]+ ms|Reply from (\d+\.\d+\.\d+\.\d+): time=[\d.]+ms TTL=\d+)$/.exec(line); return !!m && (m[1] ?? m[2]) === target; });
    const failure = candidate.missing && /(?:^|\n)From 192\.168\.10\.1 icmp_seq=\d+ Destination Net Unreachable\r?(?:\n|$)/.test(candidate.output) && c.firstMissing === I.r1;
    if (r.step === 1 ? !failure && !(reply && c.forward && c.backward) : !reply) return;
    candidate.proved = true; const hash = this.validated.hash;
    if (r.step === 1) void this.update({ investigated: hash });
    else if (r.step === 3 && c.forward && c.backward) void this.update({ retested: hash });
    else if (r.step === 5 && c.forward && c.backward) void this.update({ returnInvestigated: hash });
    else if (r.step === 8) void this.update({ lineReplies: { ...r.lineReplies, [candidate.pair]: hash } });
    else if (r.step === 11) {
      const keep = Object.values(r.finalReplies).every(value => value === null || value === hash);
      void this.update({ finalReplies: { ...(keep ? r.finalReplies : emptyStaticReplies()), [candidate.pair]: hash }, completed: keep ? r.completed : r.completed.filter(step => step !== 11) });
    }
  };
}
