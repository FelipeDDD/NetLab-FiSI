import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import type { TerminalCommandContext, TerminalCommandEvent } from '../terminalCommandEvents';
import type { NetworkObservation } from '../networkObservations';
import { LPM_IDS as I, LPM_TARGET, LPM_LONG, LPM_SHORT, lpmConditions, lpmSignature } from './lpmChapter';
import { LpmProgressStore, type LpmProgress, type LpmReceipt } from './lpmProgress';
import { createLpmAttempt } from './lpmAttempt';
import { tutorialFingerprint } from './tutorialProgress';

export interface LpmRuntime {
  network(): Network; activeDraftId(): string | null; pendingForms(): boolean; restarting(): boolean;
  subscribe(fn: () => void): () => void; observeCommands(fn: (event: TerminalCommandEvent) => void): () => void;
  observeActivity(fn: (event: NetworkObservation) => void): () => void;
  openAttempt: SessionController['openDocument']; started?(id: string): void;
}
export interface LpmState {
  active: boolean; record: LpmProgress | null; busy: boolean; saving: boolean; storageError: boolean;
  warning: 'forms' | 'identity' | null; passed: boolean; historical: boolean; canAdvance: boolean; answerError: boolean; shortRoute: boolean; longRouteProved: boolean;
}
interface Candidate {
  command: TerminalCommandContext; step: number; signature: string; icmpId?: number; output: string; proved: boolean;
  traces: Map<number, { request: [string, string][]; reply: [string, string][] }>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const edges = (nodes: string[]) => nodes.slice(1).map((id, i) => [nodes[i], id]);
export class LpmController {
  private state: LpmState = { active: false, record: null, busy: false, saving: false, storageError: false, warning: null, passed: false, historical: false, canAdvance: false, answerError: false, shortRoute:false, longRouteProved:false };
  private listeners = new Set<() => void>(); private releases: (() => void)[] = []; private disposed = false;
  private records = new Map<string, LpmProgress | null>(); private loading = new Map<string, Promise<void>>(); private failed = new Set<string>(); private readFailed = new Set<string>();
  private candidates = new Map<number, Candidate>(); private awaiting?: number; private pending = 0;
  private configuration?: { net: Network; signature: string; fingerprint?: string }; private evidence: Promise<unknown> = Promise.resolve();
  constructor(private sessions: Pick<SessionController, 'subscribe' | 'getState' | 'hasPendingOperations'>, private runtime: LpmRuntime, private progress: LpmProgressStore) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(patch: Partial<LpmState>) {
    if (this.disposed || Object.entries(patch).every(([key, value]) => this.state[key as keyof LpmState] === value)) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn());
  }
  connect() {
    this.releases = [this.sessions.subscribe(this.refresh), this.runtime.subscribe(this.refresh), this.runtime.observeCommands(this.command), this.runtime.observeActivity(this.activity)]; this.refresh();
    return () => { this.disposed = true; this.releases.forEach(fn => fn()); this.progress.dispose(); this.candidates.clear(); };
  }
  private async load(id: string) {
    if (this.loading.has(id)) return this.loading.get(id);
    const task = (async () => {
      try { const record = await this.progress.load(id); if (!this.disposed) this.records.set(id, record); }
      catch { this.readFailed.add(id); }
      finally { this.loading.delete(id); this.refresh(); }
    })(); this.loading.set(id, task); return task;
  }
  private async update(patch: Partial<LpmProgress>) {
    const old = this.state.record; if (!old || this.failed.has(old.draftId)) return false;
    const record = { ...old, ...patch }; if (same(old, record)) return true;
    this.records.set(record.draftId, record); this.publish({ record }); this.pending++; this.publish({ saving: true });
    this.refresh();
    try { await this.progress.save(record); return true; }
    catch { this.failed.add(record.draftId); return false; }
    finally { this.pending--; this.publish({ saving: this.pending > 0 }); this.refresh(); }
  }
  async flushProgress() { await Promise.all(this.loading.values()); await this.evidence; await this.progress.flush(); }
  async retryProgress() {
    const id = this.runtime.activeDraftId(); if (!id) return;
    if (this.readFailed.delete(id)) { this.records.delete(id); await this.load(id); }
    this.failed.delete(id); const record = this.records.get(id);
    try { if (record) await this.progress.save(record); } catch { this.failed.add(id); } this.refresh();
  }
  async begin() {
    if (this.state.busy || this.sessions.hasPendingOperations() || this.runtime.restarting()) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    this.publish({ busy: true });
    try {
      const attempt = createLpmAttempt(), result = await this.runtime.openAttempt(attempt.document, attempt.options);
      if (!result.ok) { this.publish({ storageError: true }); return; }
      this.runtime.started?.(result.value); await this.load(result.value);
    } catch { this.publish({ storageError: true }); }
    finally { this.publish({ busy: false }); this.refresh(); }
  }
  previous() {
    const r = this.state.record; if (!r || !this.state.active || this.state.busy || this.state.saving || this.state.storageError || r.step === 1) return;
    this.candidates.clear(); this.publish({ answerError: false }); void this.update({ step: r.step - 1 });
  }
  async next() {
    const r = this.state.record; if (!r || !this.state.canAdvance || this.state.busy || this.state.saving || r.step === 5) return;
    this.candidates.clear(); this.publish({ answerError: false }); await this.update({ step: r.step + 1 });
  }
  inspectRoutes() { if (this.state.active && this.state.record?.step === 2 && lpmConditions(this.runtime.network()).initial) void this.update({ inspected: true }); }
  answer(value: string) {
    const r = this.state.record;
    if (!r || !this.state.active || this.state.busy || this.state.storageError || this.state.warning || r.completed.includes(r.step)) return;
    const c = lpmConditions(this.runtime.network());
    if (r.step === 2 && r.inspected && c.initial && r.completed.includes(1)) {
      const correct = value === 'both'; this.publish({ answerError: !correct });
      if (correct) void this.update({ compared: true, completed: [...new Set([...r.completed, 2])] });
    }
    if (r.step === 3 && c.initial && r.completed.includes(2)) {
      const correct = value === '25'; this.publish({ answerError: !correct });
      if (correct) void this.update({ rule: true, completed: [...new Set([...r.completed, 3])] });
    }
  }
  private identityValid(record: LpmProgress, net: Network) {
    return Object.entries(record.identities).every(([id, macs]) => {
      const device = net.devices.get(id); return device instanceof IpDevice && same(device.interfaces.map(i => i.mac), macs);
    });
  }
  private refresh = () => {
    if (this.disposed) return;
    const id = this.sessions.getState().activeDraftId;
    if (!id || this.runtime.activeDraftId() !== id || this.sessions.hasPendingOperations() || this.runtime.restarting()) { this.candidates.clear(); this.awaiting = undefined; this.publish({ active: false }); return; }
    if (!this.records.has(id)) { this.publish({ active: false, record: null, storageError: this.readFailed.has(id) }); if (!this.readFailed.has(id)) void this.load(id); return; }
    const record = this.records.get(id) ?? null, storageError = this.failed.has(id) || this.readFailed.has(id);
    if (!record) { this.candidates.clear(); this.publish({ active: false, record: null }); return; }
    const net = this.runtime.network(), signature = lpmSignature(net);
    if (this.configuration?.net !== net || this.configuration.signature !== signature || this.state.record?.draftId !== id) {
      this.candidates.clear(); this.awaiting = undefined;
      const configuration = { net, signature, fingerprint: undefined as string | undefined }; this.configuration = configuration;
      void tutorialFingerprint(signature).then(fingerprint => { if (!this.disposed && this.configuration === configuration) { configuration.fingerprint = fingerprint; this.refresh(); } }).catch(() => { this.failed.add(id); this.refresh(); });
    }
    const warning = this.runtime.pendingForms() ? 'forms' : !this.identityValid(record, net) ? 'identity' : null;
    const c = lpmConditions(net), historical = record.completed.includes(record.step);
    // Historical credit is independent of the current path. Never re-award tasks
    // from that credit, or force the learner to undo later legitimate routing.
    const proof = record.step <= 3 ? record.initial : record.step === 4 ? record.short : record.restored;
    const passed = !warning && historical && proof?.fingerprint === this.configuration.fingerprint && (record.step <= 3 ? c.initial : record.step === 4 ? c.short && c.removed : c.long);
    this.publish({ active: true, record, storageError, warning, historical, passed, shortRoute:warning!=='identity'&&c.original, longRouteProved:record.step===5&&passed, canAdvance: historical && !storageError && !this.runtime.pendingForms() });
  };
  private command = (event: TerminalCommandEvent) => {
    const r = this.state.record, net = this.runtime.network(), command = event.command;
    // Recognize another way of consulting the same real table. The existing
    // inspected flag and answer/network criteria are unchanged.
    if (r?.step === 2 && this.state.active && !this.state.warning && !this.state.storageError && command.network === net && command.deviceId === I.r1 && command.source === 'keyboard' && event.type === 'finished' && event.reason === 'completed' && /^ip\s+(?:-4\s+)?route(?:\s+(?:show|list))?\s*$/.test(command.line.trim())) {
      this.inspectRoutes(); return;
    }
    if (!r || !this.state.active || this.state.storageError || this.state.busy || this.state.warning || command.network !== net || command.source === 'api' || command.deviceId !== I.a) return;
    if (event.type === 'started') {
      if (![1, 4, 5].includes(r.step) || !Array.from({ length: r.step - 1 }, (_, i) => i + 1).every(step => r.completed.includes(step))) return;
      const tokens = command.line.trim().split(/\s+/); if (tokens.shift()?.toLowerCase() !== 'ping') return;
      const targets: string[] = []; for (let i = 0; i < tokens.length; i++) { if (['-c', '-n'].includes(tokens[i])) { i++; continue; } if (!tokens[i].startsWith('-')) targets.push(tokens[i]); }
      if (targets.length !== 1 || targets[0] !== LPM_TARGET) return;
      const c = lpmConditions(net); if (!(r.step === 1 ? c.initial : r.step === 4 ? c.short && c.removed : c.long && !!r.short)) return;
      this.candidates.set(command.id, { command, step: r.step, signature: lpmSignature(net), output: '', proved: false, traces: new Map() }); this.awaiting = command.id; return;
    }
    const candidate = this.candidates.get(command.id);
    if (!candidate || candidate.step !== r.step || candidate.signature !== lpmSignature(net)) return;
    if (event.type === 'finished') { this.candidates.delete(command.id); if (this.awaiting === command.id) this.awaiting = undefined; return; }
    candidate.output = (candidate.output + event.text).slice(-8192); if (candidate.proved) return;
    const path = r.step === 4 ? LPM_SHORT : LPM_LONG, back = [...LPM_SHORT].reverse();
    const proved = candidate.output.split(/\r?\n/).some(line => {
      const m = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
      if (!m || m[1] !== LPM_TARGET) return false;
      const trace = candidate.traces.get(Number(m[2])); return !!trace && same(trace.request, edges(path)) && same(trace.reply, edges(back));
    });
    if (!proved) return;
    candidate.proved = true;
    const signature = candidate.signature, step = candidate.step, draftId = r.draftId, attemptId = r.attemptId;
    this.pending++; this.publish({ saving: true });
    this.evidence = this.evidence.then(async () => {
      const fingerprint = await tutorialFingerprint(signature), current = this.state.record;
      if (this.disposed || this.runtime.network() !== net || lpmSignature(net) !== signature || this.runtime.activeDraftId() !== draftId || current?.draftId !== draftId || current.attemptId !== attemptId || current.step !== step || this.runtime.pendingForms()) return;
      const receipt: LpmReceipt = { fingerprint, request: [...path], reply: back };
      await this.update({ [step === 1 ? 'initial' : step === 4 ? 'short' : 'restored']: receipt, completed: [...new Set([...current.completed, step])].sort((a, b) => a - b) });
    }).catch(() => { this.failed.add(draftId); this.refresh(); }).finally(() => { this.pending--; this.publish({ saving: this.pending > 0 }); });
  };
  private activity = (event: NetworkObservation) => {
    if (!this.state.active || this.state.warning || event.network !== this.runtime.network()) return;
    if (event.kind === 'ping') {
      if (event.event.type !== 'started' || this.awaiting === undefined) return;
      const candidate = this.candidates.get(this.awaiting);
      if (candidate?.command.deviceId === event.event.deviceId) candidate.icmpId = event.event.icmpId;
      this.awaiting = undefined; return;
    }
    for (const candidate of this.candidates.values()) {
      if (candidate.proved || candidate.icmpId !== event.icmpId || candidate.signature !== lpmSignature(event.network)) continue;
      const request = event.direction === 'request';
      if (event.source !== parseIp(request ? '192.168.60.10' : LPM_TARGET) || event.destination !== parseIp(request ? LPM_TARGET : '192.168.60.10')) continue;
      const trace = candidate.traces.get(event.seq) ?? { request: [], reply: [] };
      trace[event.direction].push([event.from, event.to]); candidate.traces.set(event.seq, trace);
    }
  };
}
