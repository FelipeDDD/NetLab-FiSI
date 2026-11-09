import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import { Host } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';
import type { TerminalCommandEvent, TerminalCommandContext } from '../terminalCommandEvents';
import { FIRST_CONNECTION, FIRST_DEVICES, firstConnectionConditions, firstConnectionDocument } from './firstConnection';
import { TutorialProgressStore, tutorialFingerprint, encodeTutorialProgress, type TutorialSnapshot, type TutorialProgress } from './tutorialProgress';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import type { MetaValue } from '../projects/types';
import { chapterOneSignature } from './subnetChapter';

export type TutorialHint = 'cable' | 'ipv4' | 'ping' | 'stopPing' | 'network' | 'missing' | 'forms' | 'wrongTarget' | 'pingFailed' | 'addC' | 'cableC' | 'ipv4C' | 'ipv4CExisting' | 'pingC';
export interface TutorialState {
  busy: boolean;
  draftId: string | null;
  step: number;
  active: boolean;
  passed: boolean;
  hint: TutorialHint;
  error: boolean;
  pcC: string | null;
  finished: boolean;
  ready: boolean;
  saving: boolean;
  storageError: boolean;
  repeatPing: boolean;
}
export interface TutorialRuntime {
  openAttempt?: SessionController['openDocument'];
  checkpoint?:ChapterCheckpointHooks;
  restarting?():boolean;
  network(): Network;
  activeDraftId(): string | null;
  signature(): string;
  pendingForms(): boolean;
  subscribe(listener: () => void): () => void;
  observeCommands(listener: (event: TerminalCommandEvent) => void): () => void;
  renameDevice(id: string, name: string): void;
  started?(draftId: string): void;
  hostCreationDraft?(draftId: string | null): void;
  suspended?(): boolean;
}
type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'openDocument' | 'switchDraft' | 'hasPendingOperations'>;

/** One live simulation owned by SessionController. No verifier probes or progress writes. */
export class TutorialController {
  private state: TutorialState = { busy: false, draftId: null, step: 0, active: false, passed: false, hint: 'cable', error: false, pcC: null, finished: false, ready: true, saving: false, storageError: false, repeatPing: false };
  private listeners = new Set<() => void>();
  private releases: (() => void)[] = [];
  private disposed = false;
  private evidence?: { signature: string; commandId: number; interrupted: boolean };
  private candidate?: { command: TerminalCommandContext; signature: string; output: string };
  private pingHint: TutorialHint = 'ping';
  private cBaseline?: Set<string>;
  private cIpv4Command?: TerminalCommandContext;
  private cIpv4Applied = false;
  private cEvidence?: { signature: string; commandId: number; ended: boolean };
  private cCandidate?: { command: TerminalCommandContext; signature: string; output: string };
  private cPingHint: TutorialHint = 'pingC';
  private attempts = new Map<string, TutorialSnapshot | TutorialProgress>();
  private completed = new Set<number>();
  private startedAt = 0;
  private boundDraftId: string | null = null;
  private lastSnapshots = new Map<string, string>();
  private loaded = new Set<string>();
  private discovering = false;
  private restoring = false;
  private failedWrites = new Set<string>();
  private failedRestores = new Set<string>();
  private pendingWrites = 0;
  private discovery?: Promise<void>;
  private restoration?: Promise<void>;
  async initialize() { await this.discovery; await this.restoration; }

  private snapshot(): TutorialSnapshot | null {
    if (!this.state.draftId || this.boundDraftId !== this.state.draftId) return null;
    return { draftId: this.state.draftId, startedAt: this.startedAt, step: this.state.step,
      completed: [...this.completed].sort((a,b) => a-b), pcC: this.state.pcC, baseline: this.cBaseline ? [...this.cBaseline] : null,
      ipv4Applied: this.cIpv4Applied,
      a: this.evidence ? { signature: this.evidence.signature, interrupted: this.evidence.interrupted } : null,
      c: this.cEvidence ? { signature: this.cEvidence.signature, ended: this.cEvidence.ended } : null };
  }
  private remember() {
    if(this.runtime.suspended?.())return;
    const snapshot = this.snapshot(); if (!snapshot || this.restoring || this.discovering) return;
    this.attempts.set(snapshot.draftId, snapshot);
    const json = JSON.stringify(snapshot);
    if (!this.progress || this.lastSnapshots.get(snapshot.draftId) === json || this.failedWrites.has(snapshot.draftId)) return;
    this.lastSnapshots.set(snapshot.draftId, json); this.pendingWrites++; this.publish({ saving: true });
    void this.progress.save(snapshot).catch(() => {
      if (!this.disposed) { this.failedWrites.add(snapshot.draftId); this.publish({ storageError: true }); }
    }).finally(() => { this.pendingWrites--; if (!this.disposed) this.publish({ saving: this.pendingWrites > 0 }); });
  }
  async flushProgress() { this.refresh(); this.remember(); await this.progress?.flush(); }
  async retryProgress() {
    this.failedWrites.clear(); this.lastSnapshots.clear(); this.publish({ storageError: false });
    this.failedRestores.clear();
    this.loaded.clear(); await this.discover(); await this.restoration; this.remember(); await this.flushProgress();
  }
  private async discover() {
    if (!this.progress || this.disposed || this.discovering || this.sessions.getState().phase !== 'ready') return;
    this.discovering = true;
    try {
      for (const draft of this.sessions.getState().drafts) {
        if (this.loaded.has(draft.id)) continue;
        // Never reread a locally edited attempt to rebase a failed CAS write.
        if (this.attempts.has(draft.id)) { this.loaded.add(draft.id); continue; }
        this.loaded.add(draft.id);
        try {
          const record = await this.progress.load(draft.id);
          if (this.disposed) return;
          if (record) this.attempts.set(draft.id, record);
        } catch { if (!this.disposed) this.publish({ storageError: true }); }
      }
      if (!this.disposed) this.publish({ ready: true });
    } catch { if (!this.disposed) this.publish({ storageError: true, ready: true }); }
    finally { this.discovering = false; if (!this.disposed) this.refresh(); }
  }
  private async restore(attempt: TutorialSnapshot | TutorialProgress) {
    if (this.restoring || this.disposed) return;
    this.restoring = true; this.publish({ active: false });
    const net = this.runtime.network(), draftId = this.runtime.activeDraftId();
    try {
      const original = this.originalSignature(), signature = chapterOneSignature(this.runtime.network());
      const persisted = 'schemaVersion' in attempt;
      const aValid = attempt.a && (persisted ? attempt.a.fingerprint === await tutorialFingerprint(original) : attempt.a.signature === original);
      const cValid = attempt.c && (persisted ? attempt.c.fingerprint === await tutorialFingerprint(signature) : attempt.c.signature === signature);
      if (this.disposed || this.sessions.hasPendingOperations() || this.runtime.network() !== net || this.runtime.activeDraftId() !== draftId) return;
      this.boundDraftId = attempt.draftId; this.startedAt = attempt.startedAt; this.completed = new Set(attempt.completed);
      this.cBaseline = attempt.baseline ? new Set(attempt.baseline) : undefined;
      this.cIpv4Applied = attempt.ipv4Applied;
      this.evidence = aValid && attempt.a ? { signature: original, commandId: -1, interrupted: attempt.a.interrupted } : undefined;
      this.cEvidence = cValid && attempt.c ? { signature, commandId: -1, ended: attempt.c.ended } : undefined;
      this.candidate = undefined; this.cCandidate = undefined; this.cIpv4Command = undefined;
      this.pingHint = 'ping'; this.cPingHint = 'pingC';
      this.publish({ draftId: attempt.draftId, step: persisted ? attempt.step - 1 : attempt.step, pcC: persisted ? attempt.devices.c : attempt.pcC, error: false });
    } catch { if (!this.disposed) { this.failedRestores.add(attempt.draftId); this.publish({ storageError: true }); } }
    finally { this.restoring = false; if (!this.disposed) this.refresh(); }
  }
  private originalSignature() {
    const topology = serializeNetwork(this.runtime.network(), {}), ids = new Set<string>(Object.values(FIRST_DEVICES));
    return JSON.stringify({ devices: topology.devices.filter(d => ids.has(d.id)), links: topology.links.filter(l => ids.has(l.a[0]) && ids.has(l.b[0])) });
  }
  private cConditions() {
    const net = this.runtime.network(), pc = net.devices.get(this.state.pcC ?? '');
    const host = pc instanceof Host && pc.kind === 'host' && pc.os === 'linux';
    const cable = host && [...net.links.values()].some(l => l.medium !== 'wireless' &&
      (l.a.device.id === pc.id && l.b.device.id === FIRST_DEVICES.sw || l.b.device.id === pc.id && l.a.device.id === FIRST_DEVICES.sw));
    const iface = pc?.getInterface('eth0');
    const ipv4 = host && iface?.ip?.addr === parseIp('192.168.10.30') && iface.ip.prefix === 24;
    return { host, cable, ipv4, ready: cable && ipv4 && iface?.up === true && firstConnectionConditions(net).ready };
  }
  constructor(private sessions: Sessions, private runtime: TutorialRuntime, private progress?: TutorialProgressStore) {
    this.state.ready = !progress;
  }
  getState = () => this.state;
  hasCompletedChapter = () => this.completed.has(FIRST_CONNECTION.steps.length);
  completedSteps = (draftId = this.state.draftId): number[] => {
    if (!draftId) return [];
    if (draftId === this.boundDraftId) return [...this.completed];
    return [...(this.attempts.get(draftId)?.completed ?? [])];
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<TutorialState>) {
    const next = { ...this.state, ...patch };
    if (Object.keys(next).every(key => next[key as keyof TutorialState] === this.state[key as keyof TutorialState])) return;
    this.state = next;
    this.runtime.hostCreationDraft?.(next.active && next.step === 4 && !next.finished ? next.draftId : null);
    this.listeners.forEach(listener => listener());
  }
  connect() {
    this.disposed = false;
    this.releases = [this.sessions.subscribe(this.refresh), this.runtime.subscribe(this.refresh), this.runtime.observeCommands(this.command)];
    this.discovery = this.discover();
    this.refresh();
    this.runtime.hostCreationDraft?.(this.state.active && this.state.step === 4 && !this.state.finished ? this.state.draftId : null);
    return () => { this.disposed = true; this.releases.forEach(release => release()); this.releases = []; this.candidate = undefined; this.runtime.hostCreationDraft?.(null); this.progress?.dispose(); };
  }
  async start(restart = false) {
    await this.initialize();
    if (this.disposed || this.state.busy || this.sessions.hasPendingOperations()) return;
    if (this.runtime.pendingForms()) { this.publish({ error: true }); return; }
    this.publish({ busy: true, error: false });
    try {
      if (!restart && this.state.draftId && this.sessions.getState().drafts.some(d => d.id === this.state.draftId)) {
        const switched = await this.sessions.switchDraft(this.state.draftId);
        if (!switched.ok) throw Error(switched.error.code);
        await this.restoration;
      } else {
        this.remember();
        const document = firstConnectionDocument();
        const opened = await (this.runtime.openAttempt?.(document) ?? this.sessions.openDocument(document));
        if (!opened.ok) throw Error(opened.error.code);
        if (this.disposed) return;
        this.runtime.started?.(opened.value);
        await this.runtime.checkpoint?.before(opened.value);
        this.evidence = undefined; this.candidate = undefined; this.pingHint = 'ping';
        this.cBaseline = undefined; this.cIpv4Command = undefined; this.cIpv4Applied = false; this.cEvidence = undefined; this.cCandidate = undefined;
        this.cPingHint = 'pingC';
        this.startedAt = Date.now(); this.completed = new Set();
        this.boundDraftId = opened.value;
        this.loaded.add(opened.value);
        this.publish({ draftId: opened.value, step: 0, pcC: null, finished: false });
        await this.runtime.checkpoint?.prepared(opened.value,await encodeTutorialProgress(this.snapshot()!) as unknown as MetaValue);
      }
      this.refresh();
      await this.flushProgress();
    } catch { if (!this.disposed) this.publish({ error: true }); }
    finally { if (!this.disposed) this.publish({ busy: false }); }
  }
  previous() {
    if (this.sessions.hasPendingOperations() || !this.state.active || this.state.step === 0) return;
    this.candidate = undefined;
    this.publish({ step: this.state.step - 1 }); this.refresh();
  }
  next() {
    this.refresh();
    if (this.sessions.hasPendingOperations() || !this.state.active || !this.state.passed || this.state.step === FIRST_CONNECTION.steps.length - 1) return;
    this.publish({ step: this.state.step + 1 }); this.refresh();
  }
  private refresh = () => {
    if (this.disposed) return;
    if(this.runtime.restarting?.()){this.candidate=undefined;this.cCandidate=undefined;this.cIpv4Command=undefined;return;}
    if (this.runtime.suspended?.()) { this.candidate = undefined; this.cCandidate = undefined; this.publish({ active: false }); return; }
    // Store/capture observers can publish between sim.net replacement and the
    // atomic workspace identity update. Evaluate only a settled handoff.
    if (this.sessions.hasPendingOperations()) { this.candidate = undefined; return; }
    const session = this.sessions.getState(), id = this.state.draftId;
    if (this.progress && !this.discovering && session.phase === 'ready' && session.drafts.some(d => !this.loaded.has(d.id))) {
      this.discovery = this.discover(); return;
    }
    if (this.discovering || this.restoring || !this.state.ready) return;
    const activeAttempt = this.attempts.get(session.activeDraftId ?? '');
    if (activeAttempt && !this.failedRestores.has(activeAttempt.draftId) && (session.activeDraftId !== id || this.boundDraftId !== id) && this.runtime.activeDraftId() === session.activeDraftId) {
      this.remember(); this.restoration = this.restore(activeAttempt); return;
    }
    if (!id && this.attempts.size) {
      const latest = [...this.attempts.values()].filter(a => session.drafts.some(d => d.id === a.draftId)).sort((a,b) => b.startedAt-a.startedAt)[0];
      if (latest) this.publish({ draftId: latest.draftId });
    }
    if (id && !session.drafts.some(draft => draft.id === id)) {
      this.candidate = undefined; this.evidence = undefined;
      this.attempts.delete(id); this.boundDraftId = null; this.publish({ draftId: null, active: false, passed: false, step: 0, finished: false }); return;
    }
    // Runtime activation precedes the SessionController focus publication.
    // Never invalidate a draft's evidence against its neighbor's network.
    const active = !!id && session.activeDraftId === id && this.runtime.activeDraftId() === id;
    if (!active) {
      this.candidate = undefined; this.cCandidate = undefined; this.cIpv4Command = undefined;
      if (this.evidence) this.evidence.commandId = -1;
      if (this.cEvidence) this.cEvidence.commandId = -1;
      this.publish({ active: false }); return;
    }
    const conditions = firstConnectionConditions(this.runtime.network()), signature = chapterOneSignature(this.runtime.network());
    // Adding C must not erase the completed A/B lesson; edits to A/B still do.
    if (this.evidence && this.evidence.signature !== this.originalSignature()) this.evidence = undefined;
    if (this.state.step === 4 && !this.cBaseline) this.cBaseline = new Set(this.runtime.network().devices.keys());
    if (this.state.step === 4 && !this.state.pcC) {
      const pc = [...this.runtime.network().devices.values()].find(d => !this.cBaseline!.has(d.id) && d instanceof Host && d.kind === 'host' && d.os === 'linux');
      if (pc) {
        this.publish({ pcC: pc.id });
        const network = this.runtime.network();
        // The creation action must commit its history entry before the rename.
        queueMicrotask(() => {
          if (this.disposed || this.sessions.hasPendingOperations() || !this.state.active || this.runtime.network() !== network || this.state.pcC !== pc.id || network.devices.get(pc.id) !== pc) return;
          if (![...network.devices.values()].some(d => d.id !== pc.id && d.name.trim().toLowerCase() === 'pc c')) this.runtime.renameDevice(pc.id, 'PC C');
        });
      }
    }
    if (this.cEvidence?.signature !== signature) this.cEvidence = undefined;
    if (this.cCandidate && (this.cCandidate.command.network !== this.runtime.network() || this.cCandidate.signature !== signature)) this.cCandidate = undefined;
    const c = this.cConditions();
    if (!c.ipv4) this.cIpv4Applied = false;
    if (this.candidate && (this.candidate.command.network !== this.runtime.network() || this.candidate.signature !== signature)) {
      this.candidate = undefined; this.pingHint = 'ping';
    }
    const forms = this.runtime.pendingForms();
    // State-based task: Inspector and terminal are equivalent. Keep the legacy
    // receipt field, but never trust it in place of the current cable/IP/mask.
    if (this.state.step === 6 && !forms && c.cable && c.ipv4) this.cIpv4Applied = true;
    const passed = !forms && (this.state.step === 0 ? conditions.cable : this.state.step === 1 ? conditions.cable && conditions.ipv4 : this.state.step < 4 ? conditions.ready && !!this.evidence && (this.state.step === 2 || this.evidence.interrupted) : this.state.step === 4 ? c.host : this.state.step === 5 ? c.cable : this.state.step === 6 ? c.cable && c.ipv4 && this.cIpv4Applied : c.ready && !!this.cEvidence);
    if (passed) this.completed.add(this.state.step + 1);
    const hint: TutorialHint = !conditions.exists ? 'missing' : !conditions.cable ? 'cable' :
      this.state.step >= 1 && forms ? 'forms' : this.state.step >= 1 && !conditions.ipv4 ? 'ipv4' :
      this.state.step >= 2 && !conditions.ready ? 'network' : this.state.step === 3 ? 'stopPing' : this.state.step === 2 ? this.pingHint : this.state.step === 1 ? 'ipv4' : 'cable';
    const hasCAddress = !!this.runtime.network().devices.get(this.state.pcC ?? '')?.getInterface('eth0')?.ip;
    this.publish({ active, passed, finished: this.state.step === 7 && passed && this.cEvidence?.ended === true,
      repeatPing: this.state.step === 3 && this.evidence?.commandId === -1 && !this.evidence.interrupted || this.state.step === 7 && this.cEvidence?.commandId === -1 && !this.cEvidence.ended,
      hint: this.state.step < 4 ? hint : forms ? 'forms' : !c.host ? 'addC' : this.state.step === 4 ? 'addC' : !c.cable ? 'cableC' : this.state.step <= 6 || !c.ipv4 ? hasCAddress && !this.cIpv4Applied ? 'ipv4CExisting' : 'ipv4C' : !c.ready ? 'network' : this.cPingHint });
    this.remember();
  };
  private command = (event: TerminalCommandEvent) => {
    this.refresh();
    if (this.disposed || this.sessions.hasPendingOperations()) return;
    const command = event.command;
    if (this.state.active && command.network === this.runtime.network() && command.source === 'keyboard' && command.deviceId === this.state.pcC && this.cConditions().host) {
      if (this.state.step === 6) {
        if (event.type === 'started') {
          const iface = this.runtime.network().devices.get(command.deviceId)?.getInterface('eth0');
          this.cIpv4Command = !iface?.ip && /^ip\s+(?:a|ad|add|addr|addre|addres|address)\s+add\s+192\.168\.10\.30\/24\s+dev\s+eth0\s*$/.test(command.line.trim()) ? command : undefined;
        } else if (event.type === 'finished' && this.cIpv4Command?.id === command.id) {
          this.cIpv4Applied = event.reason === 'completed' && this.cConditions().ipv4;
          this.cIpv4Command = undefined; this.refresh();
        }
      }
      if (this.state.step === 7) {
        if (event.type === 'started') {
          this.cCandidate = this.cConditions().ready && /^ping(?:\s+-c\s+\d+)?\s+192\.168\.10\.20\s*$/.test(command.line.trim()) ? { command, signature: chapterOneSignature(this.runtime.network()), output: '' } : undefined;
          if (this.cCandidate) this.cEvidence = undefined;
          this.cPingHint = this.cCandidate ? 'pingC' : /^ping\s/.test(command.line.trim()) ? 'wrongTarget' : 'pingC'; this.refresh();
        } else if (this.cCandidate?.command.id === command.id && this.cCandidate.signature === chapterOneSignature(this.runtime.network()) && !this.runtime.pendingForms()) {
          if (event.type === 'output') {
            this.cCandidate.output = (this.cCandidate.output + event.text).slice(-2048);
            if (/(?:^|\n)64 bytes from 192\.168\.10\.20: icmp_seq=\d+ ttl=\d+ time=[\d.]+ ms\r?(?:\n|$)/.test(this.cCandidate.output)) this.cEvidence = { signature: this.cCandidate.signature, commandId: command.id, ended: false };
            else if (/no answer yet|ping: connect:|ping: sendmsg:|[Uu]nreachable/.test(event.text)) this.cPingHint = 'pingFailed';
          } else {
            if (this.cEvidence?.commandId === command.id) this.cEvidence.ended = true;
            this.cCandidate = undefined;
          }
          this.refresh();
        }
      }
    }
    if (this.state.step > 3) return;
    if (!this.state.active || this.state.step < 2 || command.source !== 'keyboard' ||
      command.network !== this.runtime.network() || command.deviceId !== FIRST_DEVICES.a) return;
    if (event.type === 'started') {
      this.candidate = undefined;
      if (!/^ping(?:\s+-(?:c|n)\s+\d+)?\s+192\.168\.10\.20\s*$/.test(command.line.trim())) {
        if (/^ping\s/.test(command.line.trim())) { this.pingHint = 'wrongTarget'; this.refresh(); }
        return;
      }
      if (!firstConnectionConditions(this.runtime.network()).ready || this.runtime.pendingForms()) return;
      this.pingHint = 'ping';
      this.candidate = { command, signature: chapterOneSignature(this.runtime.network()), output: '' }; this.refresh(); return;
    }
    const candidate = this.candidate;
    if (!candidate || command.id !== candidate.command.id || candidate.signature !== chapterOneSignature(this.runtime.network()) || this.runtime.pendingForms()) return;
    if (event.type === 'output') {
      candidate.output = (candidate.output + event.text).slice(-2048);
      // These lines are emitted only after runPing receives an actual Echo Reply.
      // Never infer success from wire animation, a request, or generic terminal text.
      if (/(?:^|\n)(?:64 bytes from 192\.168\.10\.20: icmp_seq=\d+ ttl=\d+ time=[\d.]+ ms|Reply from 192\.168\.10\.20: time=[\d.]+ms TTL=\d+)\r?(?:\n|$)/.test(candidate.output)) {
        this.evidence = { signature: this.originalSignature(), commandId: command.id, interrupted: false };
        this.completed.add(3);
        if (this.state.step === 2) this.publish({ step: 3 });
        this.refresh();
      } else if (/no answer yet|Request timed out|ping: connect:|ping: sendmsg:|transmit failed|[Uu]nreachable/.test(event.text)) {
        this.pingHint = 'pingFailed'; this.refresh();
      }
    } else if (event.type === 'finished') {
      if (event.reason === 'interrupt' && this.evidence?.commandId === command.id) this.evidence.interrupted = true;
      if (!this.evidence) this.pingHint = 'pingFailed';
      this.candidate = undefined; this.refresh();
    }
  };
}
