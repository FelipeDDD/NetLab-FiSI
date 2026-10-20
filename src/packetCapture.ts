import type { WireFrameContext, WireTransfer } from './engine/network';

export const MAX_CAPTURE_RECORDS = 1_000;
export const MAX_CAPTURE_TEXT_LENGTH = 16_384; // UTF-16 units, not wire bytes.
export const CAPTURE_BATCH_MS = 100;

export interface TruncatedCaptureField {
  path: string;
  originalLength: number;
  capturedLength: number;
}

export interface CapturedPacket extends WireTransfer, WireFrameContext {
  truncatedFields: TruncatedCaptureField[];
}

export interface PacketCaptureState {
  status: 'stopped' | 'capturing' | 'paused';
  linkId: string | null; // null observes all links.
  records: readonly CapturedPacket[];
  discarded: number; // Records evicted by retention, including pending overflow.
}

function emptyCapture(): PacketCaptureState {
  return { status: 'stopped', linkId: null, records: [], discarded: 0 };
}

function limitText(value: object, path: string, truncated: TruncatedCaptureField[]): void {
  for (const [key, field] of Object.entries(value)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (typeof field === 'string' && field.length > MAX_CAPTURE_TEXT_LENGTH) {
      let length = MAX_CAPTURE_TEXT_LENGTH;
      // Do not split an astral Unicode character at the boundary.
      if (field.charCodeAt(length - 1) >= 0xd800 && field.charCodeAt(length - 1) <= 0xdbff
        && field.charCodeAt(length) >= 0xdc00 && field.charCodeAt(length) <= 0xdfff) length--;
      (value as Record<string, unknown>)[key] = field.slice(0, length);
      truncated.push({ path: fieldPath, originalLength: field.length, capturedLength: length });
    } else if (field && typeof field === 'object') limitText(field, fieldPath, truncated);
  }
}

/** Owns pending observations; state is the same published snapshot held by Zustand.
 * Start begins a fresh trace. Pause/stop retain it; clear retains status/scope.
 * No virtual-clock scheduling, persistence, device references or protocol actions.
 */
export class PacketCapture {
  private snapshot = emptyCapture();
  private pending: CapturedPacket[] = [];
  private pendingDiscarded = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(private readonly onChange: (state: PacketCaptureState) => void) {}

  get state(): PacketCaptureState { return this.snapshot; }

  start(linkId: string | null = null): void {
    this.cancelPending();
    this.snapshot = { ...emptyCapture(), status: 'capturing', linkId };
    this.publish();
  }

  pause(): void {
    if (this.snapshot.status !== 'capturing') return;
    this.finish('paused');
  }

  resume(): void {
    if (this.snapshot.status !== 'paused') return;
    this.snapshot = { ...this.snapshot, status: 'capturing' };
    this.publish();
  }

  stop(): void {
    if (this.snapshot.status !== 'stopped') this.finish('stopped');
  }

  clear(): void {
    this.cancelPending();
    this.snapshot = { ...this.snapshot, records: [], discarded: 0 };
    this.publish();
  }

  reset(): void {
    this.cancelPending();
    this.snapshot = emptyCapture();
    this.publish();
  }

  observe(transfer: WireTransfer, context: WireFrameContext): void {
    if (this.snapshot.status !== 'capturing' || (this.snapshot.linkId !== null && this.snapshot.linkId !== transfer.linkId)) return;
    try {
      const copy = structuredClone(context);
      const truncatedFields: TruncatedCaptureField[] = [];
      limitText(copy, '', truncatedFields);
      if (this.pending.length === MAX_CAPTURE_RECORDS) {
        this.pending.shift();
        this.pendingDiscarded++;
      }
      this.pending.push({ ...transfer, ...copy, truncatedFields });
      if (this.timer === null) {
        const generation = this.generation;
        this.timer = setTimeout(() => {
          if (generation !== this.generation) return;
          this.timer = null;
          this.mergePending();
          this.publish();
        }, CAPTURE_BATCH_MS);
      }
    } catch {
      // A malformed/uncloneable observation cannot affect simulated traffic.
    }
  }

  private mergePending(): void {
    const records = [...this.snapshot.records, ...this.pending];
    const excess = Math.max(0, records.length - MAX_CAPTURE_RECORDS);
    this.snapshot = {
      ...this.snapshot, records: records.slice(excess),
      discarded: this.snapshot.discarded + this.pendingDiscarded + excess,
    };
    this.pending = [];
    this.pendingDiscarded = 0;
  }

  private finish(status: 'paused' | 'stopped'): void {
    this.cancelTimer();
    this.mergePending();
    this.snapshot = { ...this.snapshot, status };
    this.publish();
  }

  private cancelTimer(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private cancelPending(): void {
    this.cancelTimer();
    this.pending = [];
    this.pendingDiscarded = 0;
  }

  private publish(): void {
    try { this.onChange(this.snapshot); } catch { /* Observational subscribers only. */ }
  }
}
