import type { SessionController } from '../persistence/sessionController';
import type { Network } from '../engine/network';
import { parseIp } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';
import type { TerminalCommandContext, TerminalCommandEvent } from '../terminalCommandEvents';
import type { TutorialController } from './TutorialController';
import { FIRST_DEVICES } from './firstConnection';
import { chapterOneSignature, correctedSubnet, initialSubnetDevice, SUBNET_DEMO_COMMAND, SUBNET_LINK_ID, SUBNET_PC_ID, subnetDevice, subnetPreparationError, type SubnetWarning } from './subnetChapter';
import { newSubnetProgress, SubnetProgressStore, type SubnetProgress } from './subnetProgress';
import { tutorialFingerprint } from './tutorialProgress';
import type { ChapterCheckpointHooks } from './chapterCheckpoints';
import type { MetaValue } from '../projects/types';

type Sessions = Pick<SessionController, 'getState' | 'subscribe' | 'hasPendingOperations'>;
type First = Pick<TutorialController, 'getState' | 'subscribe' | 'flushProgress' | 'hasCompletedChapter'>;
export interface SubnetRuntime {
  checkpoint?:ChapterCheckpointHooks;
  restarting?():boolean;
  network(): Network;
  activeDraftId(): string | null;
  pendingForms(): boolean;
  subscribe(listener: () => void): () => void;
  observeCommands(listener: (event: TerminalCommandEvent) => void): () => void;
  insert(pcC: string): SubnetWarning | null;
  demonstrate(): 'accepted' | 'busy' | 'unapplied-input' | 'disposed';
  suspended?(): boolean;
}
export interface SubnetState {
  active: boolean; ready: boolean; busy: boolean; saving: boolean; storageError: boolean;
  record: SubnetProgress | null; passed: boolean; warning: SubnetWarning | null;
  answerError: boolean; demoRunning: boolean;
}
type Candidate = { command: TerminalCommandContext; signature: string; output: string; kind: 'inspect' | 'demo' | 'failure' | 'b' | 'c'; replies: Set<number>; proved?: boolean };
const signature = (net: Network) => JSON.stringify(serializeNetwork(net, {}));
const pingTarget = (line: string) => /^ping(?:\s+-c\s+[1-9]\d*)?\s+(192\.168\.10\.(?:10|20|30))\s*$/.exec(line.trim())?.[1];

/** Chapter-specific orchestration. It observes real commands and never probes the network. */
export class SubnetTutorialController {
  private state: SubnetState = { active: false, ready: false, busy: false, saving: false, storageError: false, record: null, passed: false, warning: null, answerError: false, demoRunning: false };
  private listeners = new Set<() => void>();
  private releases: (() => void)[] = [];
  private records = new Map<string, SubnetProgress | null>();
  private loading = new Map<string, Promise<void>>();
  private failedReads = new Set<string>();
  private failedWrites = new Set<string>();
  private pending = 0;
  private disposed = false;
  private restoring = false;
  private validation?: { draft: string; net: Network; base: string; valid: boolean };
  private receiptSignatures: { b: string | null; c: string | null } = { b: null, c: null };
  private candidate?: Candidate;
  private demoRequested?: { net: Network; draft: string; signature: string };
  constructor(private sessions: Sessions, private first: First, private runtime: SubnetRuntime, private progress: SubnetProgressStore) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SubnetState>) {
    if (this.disposed) return;
    const next = { ...this.state, ...patch };
    if (Object.keys(next).every(k => next[k as keyof SubnetState] === this.state[k as keyof SubnetState])) return;
    this.state = next; this.listeners.forEach(fn => fn());
  }
  connect() {
    this.disposed = false;
    this.releases = [this.sessions.subscribe(this.refresh), this.first.subscribe(this.refresh), this.runtime.subscribe(this.refresh), this.runtime.observeCommands(this.command)];
    this.refresh();
    return () => { this.disposed = true; this.releases.forEach(fn => fn()); this.candidate = undefined; this.demoRequested = undefined; this.progress.dispose(); };
  }
  private async load(draft: string) {
    if (this.loading.has(draft)) return this.loading.get(draft);
    const task = (async () => {
      try { const record = await this.progress.load(draft); if (!this.disposed) this.records.set(draft, record); }
      catch { this.failedReads.add(draft); this.publish({ storageError: true }); }
      finally { this.loading.delete(draft); if (!this.disposed) this.refresh(); }
    })();
    this.loading.set(draft, task); return task;
  }
  private async restore(record: SubnetProgress, net: Network) {
    if (this.restoring) return;
    this.restoring = true; this.publish({ active: false });
    const base = chapterOneSignature(net), current = signature(net);
    try {
      const [baseHash, currentHash] = await Promise.all([tutorialFingerprint(base), tutorialFingerprint(current)]);
      if (this.disposed || net !== this.runtime.network() || record.draftId !== this.runtime.activeDraftId() || this.sessions.hasPendingOperations()) return;
      this.validation = { draft: record.draftId, net, base, valid: baseHash === record.baseFingerprint };
      this.receiptSignatures = { b: record.replies.b === currentHash ? current : null, c: record.replies.c === currentHash ? current : null };
    } catch { this.validation = { draft: record.draftId, net, base, valid: false }; this.publish({ storageError: true }); }
    finally { this.restoring = false; if (!this.disposed) this.refresh(); }
  }
  private async save(record: SubnetProgress): Promise<boolean> {
    if (this.failedWrites.has(record.draftId)) return false;
    this.pending++; this.publish({ saving: true });
    try { await this.progress.save(record); return !this.disposed; }
    catch { this.failedWrites.add(record.draftId); this.publish({ storageError: true }); return false; }
    finally { this.pending--; this.publish({ saving: this.pending > 0 }); }
  }
  private updateRecord(patch: Partial<SubnetProgress>, save = true) {
    const old = this.state.record; if (!old) return null;
    const record = { ...old, ...patch };
    if (JSON.stringify(record) === JSON.stringify(old)) return old;
    this.records.set(record.draftId, record); this.publish({ record });
    if (save) void this.save(record);
    this.refresh(); return record;
  }
  async flushProgress() { await Promise.all(this.loading.values()); await this.progress.flush(); }
  async retryProgress() {
    const id = this.runtime.activeDraftId(); if (!id) return;
    if (this.failedReads.delete(id)) { this.records.delete(id); await this.load(id); }
    this.failedWrites.delete(id); this.publish({ storageError: false });
    const record = this.records.get(id); if (record) await this.save(record);
  }
  async begin() {
    const first = this.first.getState(), id = this.sessions.getState().activeDraftId, net = this.runtime.network();
    if (!id || id !== this.runtime.activeDraftId() || id !== first.draftId || !first.active || !this.first.hasCompletedChapter() || !first.pcC || this.state.busy || this.sessions.hasPendingOperations()) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    if (!this.records.has(id)) await this.load(id);
    if (this.failedReads.has(id) || this.disposed || net !== this.runtime.network() || id !== this.runtime.activeDraftId()) return;
    this.publish({ busy: true, warning: null });
    try {
      let record = this.records.get(id);
      if (!record) {
        const error = subnetPreparationError(net, first.pcC);
        if (error) { this.publish({ warning: error }); return; }
        await this.first.flushProgress();
        if (this.first.getState().storageError || !this.first.hasCompletedChapter()) return;
        const base = chapterOneSignature(net);
        await this.runtime.checkpoint?.before(id);
        record = await newSubnetProgress(id, first.pcC, base);
        if (net !== this.runtime.network() || id !== this.runtime.activeDraftId() || chapterOneSignature(net) !== base || this.runtime.pendingForms() || this.sessions.hasPendingOperations()) return;
        this.records.set(id, record); this.publish({ record });
        // Durable intent precedes insertion. A crash between topology and the
        // prepared receipt can adopt only this exact reserved device/link.
        if (!await this.save(record)) return;
        this.validation = { draft: id, net, base, valid: true };
      }
      if (net !== this.runtime.network() || id !== this.runtime.activeDraftId() || this.sessions.hasPendingOperations() || this.runtime.pendingForms()) return;
      if (this.validation?.net !== net || !this.validation.valid || this.validation.base !== chapterOneSignature(net)) { this.publish({ warning: 'network' }); return; }
      this.publish({ record });
      if (!record.prepared) {
        const exists = net.devices.has(SUBNET_PC_ID);
        const link = net.links.get(SUBNET_LINK_ID);
        const recoverable = exists && initialSubnetDevice(net, record.pcC) && net.devices.get(SUBNET_PC_ID)?.name === 'PC D' && !!link &&
          link.a.device.id === SUBNET_PC_ID && link.b.device.id === FIRST_DEVICES.sw;
        const error = exists ? recoverable ? null : 'conflict' : this.runtime.insert(record.pcC);
        if (error) { this.publish({ warning: error }); return; }
        const prepared = this.updateRecord({ prepared: true, visible: true }, false)!;
        await this.runtime.checkpoint?.prepared(id,prepared as unknown as MetaValue);
        await this.save(prepared);
      } else this.updateRecord({ visible: true });
      this.refresh();
    } catch {this.publish({storageError:true});} finally { this.publish({ busy: false }); }
  }
  answer(value: string) {
    if (!this.state.active || this.state.record?.step !== 1) return;
    this.publish({ answerError: false });
    this.updateRecord({ answer: value.slice(0, 100), answerAccepted: false });
  }
  checkAnswer() {
    const r = this.state.record;
    if (!this.state.active || r?.step !== 1 || this.runtime.pendingForms()) return;
    const correct = r.inspected && r.answer.trim() === '255.255.255.240';
    this.publish({ answerError: !correct });
    if (correct) this.updateRecord({ answerAccepted: true });
  }
  previous() {
    const r = this.state.record;
    if (!this.state.active || !r || this.state.busy) return;
    this.candidate = undefined; this.demoRequested = undefined; this.publish({ demoRunning: false, warning: null, answerError: false });
    this.updateRecord(r.step > 1 ? { step: r.step - 1 } : { visible: false });
  }
  next() {
    const r = this.state.record;
    if (!this.state.active || !r || !this.state.passed || this.state.busy || r.step === 5) return;
    this.candidate = undefined; this.demoRequested = undefined; this.publish({ demoRunning: false, warning: null, answerError: false });
    this.updateRecord({ step: r.step + 1 });
    if (r.step === 1 && !r.demoClaimed) void this.demonstrate(true);
  }
  async demonstrate(automatic = false) {
    const r = this.state.record, net = this.runtime.network();
    if (!this.state.active || r?.step !== 2 || this.state.busy || this.state.demoRunning || automatic && r.demoClaimed) return;
    if (this.runtime.pendingForms()) { this.publish({ warning: 'forms' }); return; }
    const device = subnetDevice(net, r.pcC), route = device?.d.lookupRoute(parseIp('192.168.10.10')!);
    if (!device || route?.kind !== 'connected' || route.via !== null || route.ifaceName !== 'eth0') { this.publish({ warning: 'network' }); return; }
    this.publish({ busy: true, warning: null });
    const record = this.updateRecord({ demoClaimed: true }, false)!;
    try {
      // At-most-once automatic offering, even if the page closes before redraw.
      if (!await this.save(record) || this.disposed || !this.state.active || this.state.record?.step !== 2 || net !== this.runtime.network() || r.draftId !== this.runtime.activeDraftId() || this.runtime.pendingForms()) return;
      this.demoRequested = { net, draft: r.draftId, signature: signature(net) };
      const result = this.runtime.demonstrate();
      if (result !== 'accepted') {
        this.demoRequested = undefined;
        this.publish({ warning: result === 'unapplied-input' ? 'terminalInput' : 'terminalBusy' });
      } else this.publish({ demoRunning: true });
    } finally { this.publish({ busy: false }); }
  }
  private refresh = () => {
    if (this.disposed) return;
    if(this.runtime.restarting?.()){this.candidate=undefined;this.demoRequested=undefined;return;}
    if (this.runtime.suspended?.()) { this.candidate = undefined; this.demoRequested = undefined; this.publish({ active: false, demoRunning: false }); return; }
    const id = this.sessions.getState().activeDraftId, net = this.runtime.network(), first = this.first.getState();
    if (!id || id !== this.runtime.activeDraftId() || this.sessions.hasPendingOperations()) {
      this.candidate = undefined; this.demoRequested = undefined;
      this.publish({ active: false, demoRunning: false }); return;
    }
    if (!this.records.has(id)) {
      this.publish({ active: false, ready: false, record: null });
      if (!this.failedReads.has(id)) void this.load(id);
      return;
    }
    const r = this.records.get(id) ?? null;
    if (this.state.record?.draftId !== id) { this.candidate = undefined; this.demoRequested = undefined; this.publish({ demoRunning: false, warning: null, answerError: false }); }
    this.publish({ record: r, ready: true });
    if (!r) { this.publish({ active: false }); return; }
    const base = chapterOneSignature(net);
    if (this.validation?.draft !== id || this.validation.net !== net || this.validation.base !== base) {
      this.candidate = undefined; this.demoRequested = undefined;
      this.publish({ active: false, demoRunning: false }); void this.restore(r, net); return;
    }
    if (this.restoring) return;
    const active = r.visible && first.active && first.draftId === id;
    const current = signature(net);
    if (this.candidate && (this.candidate.command.network !== net || this.candidate.signature !== current || !active || this.runtime.pendingForms())) {
      const demo = this.candidate.kind === 'demo'; this.candidate = undefined;
      if (demo) { this.demoRequested = undefined; this.publish({ demoRunning: false, warning: 'demoRepeat' }); }
    }
    if (this.demoRequested && (this.demoRequested.net !== net || this.demoRequested.draft !== id || this.demoRequested.signature !== current || !active || this.runtime.pendingForms())) {
      this.demoRequested = undefined; this.publish({ demoRunning: false, warning: 'demoRepeat' });
    }
    if (!active) { this.publish({ active: false, demoRunning: false }); return; }
    const invalidReplies = (r.replies.b && this.receiptSignatures.b !== current) || (r.replies.c && this.receiptSignatures.c !== current);
    if (invalidReplies) { this.receiptSignatures = { b: null, c: null }; this.updateRecord({ replies: { b: null, c: null } }); return; }
    const warning = this.runtime.pendingForms() ? 'forms' : !net.devices.has(SUBNET_PC_ID) ? 'missing' : !r.prepared || !this.validation.valid ? 'network' : null;
    const passed = !warning && (r.step === 1 ? r.inspected && r.answerAccepted : r.step === 2 ? r.demoPassed : r.step === 3 ? r.unreachable : r.step === 4 ? correctedSubnet(net, r.pcC) : correctedSubnet(net, r.pcC) && !!r.replies.b && !!r.replies.c);
    this.publish({ active, passed, ...(warning ? { warning } : this.state.warning === 'missing' || this.state.warning === 'network' || this.state.warning === 'forms' ? { warning: null } : {}) });
  };
  private command = (event: TerminalCommandEvent) => {
    this.refresh();
    const r = this.state.record, command = event.command, net = this.runtime.network();
    if (!r || !this.state.active || this.state.warning === 'network' || this.state.warning === 'missing' || this.runtime.pendingForms() || this.sessions.hasPendingOperations() || command.network !== net || command.deviceId !== SUBNET_PC_ID) return;
    if (event.type === 'started') {
      let kind: Candidate['kind'] | undefined;
      const target = pingTarget(command.line);
      if (r.step === 1 && command.source === 'keyboard' && initialSubnetDevice(net, r.pcC) && /^ip\s+(?:a|ad|add|addr|addre|addres|address)(?:\s+(?:show|s)(?:\s+dev\s+eth0)?)?\s*$/.test(command.line.trim())) kind = 'inspect';
      if (r.step === 2 && command.source === 'api' && command.line.trim() === SUBNET_DEMO_COMMAND && this.demoRequested?.net === net && this.demoRequested.draft === r.draftId && this.demoRequested.signature === signature(net)) kind = 'demo';
      if (r.step === 3 && command.source === 'keyboard' && target === '192.168.10.20' && initialSubnetDevice(net, r.pcC) && subnetDevice(net, r.pcC)?.d.lookupRoute(parseIp(target)!) === null) kind = 'failure';
      if (r.step === 5 && (command.source === 'keyboard' || command.source === 'quick-ping') && correctedSubnet(net, r.pcC)) kind = target === '192.168.10.20' ? 'b' : target === '192.168.10.30' ? 'c' : undefined;
      this.candidate = kind ? { command, kind, signature: signature(net), output: '', replies: new Set() } : undefined;
      return;
    }
    const candidate = this.candidate;
    if (!candidate || candidate.command.id !== command.id || candidate.command.network !== net || candidate.signature !== signature(net)) return;
    if (event.type === 'output') {
      candidate.output = (candidate.output + event.text).slice(-4096);
      if (candidate.kind === 'inspect') return;
      const target = candidate.kind === 'demo' ? '192.168.10.10' : candidate.kind === 'b' ? '192.168.10.20' : '192.168.10.30';
      for (const line of candidate.output.split(/\r?\n/)) {
        const reply = /^64 bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=\d+ time=[\d.]+ ms$/.exec(line);
        if (reply?.[1] === target) candidate.replies.add(Number(reply[2]));
      }
      if (candidate.kind === 'demo' && candidate.replies.size && !r.demoPassed) this.updateRecord({ demoPassed: true });
      if ((candidate.kind === 'b' || candidate.kind === 'c') && candidate.replies.size && !candidate.proved) {
        candidate.proved = true; const key = candidate.kind, draft = r.draftId;
        void tutorialFingerprint(candidate.signature).then(hash => {
          if (this.disposed || !this.state.active || this.state.record?.draftId !== draft || this.state.record.step !== 5 || this.runtime.network() !== net || signature(net) !== candidate.signature || this.runtime.pendingForms()) return;
          this.receiptSignatures[key] = candidate.signature;
          this.updateRecord({ replies: { ...this.state.record.replies, [key]: hash } });
        }).catch(() => this.publish({ storageError: true }));
      }
    } else {
      this.candidate = undefined;
      if (candidate.kind === 'inspect' && event.reason === 'completed' && /(?:^|\n)\s*inet 192\.168\.10\.12\/28\s/.test(candidate.output)) this.updateRecord({ inspected: true });
      if (candidate.kind === 'failure' && event.reason === 'completed' && /(?:^|\n)ping: connect: Network is unreachable\r?(?:\n|$)/.test(candidate.output) && subnetDevice(net, r.pcC)?.d.lookupRoute(parseIp('192.168.10.20')!) === null) this.updateRecord({ unreachable: true });
      if (candidate.kind === 'demo') {
        this.demoRequested = undefined; this.publish({ demoRunning: false });
        if (!candidate.replies.size) this.publish({ warning: 'demoRepeat' });
      }
    }
  };
}
