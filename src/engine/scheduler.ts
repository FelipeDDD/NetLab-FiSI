// Discrete-event scheduler over a virtual clock (milliseconds). The UI
// advances the clock in real time; tests advance it instantly. Everything
// in the engine is deterministic given the same sequence of schedule calls.
export interface ScheduledEvent {
  t: number;
  seq: number;
  fn: () => void;
}

export class Scheduler {
  now = 0;
  private seq = 0;
  private queue: ScheduledEvent[] = [];

  schedule(delay: number, fn: () => void): ScheduledEvent {
    const ev: ScheduledEvent = { t: this.now + Math.max(0, delay), seq: this.seq++, fn };
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const e = this.queue[mid];
      if (e.t < ev.t || (e.t === ev.t && e.seq < ev.seq)) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, ev);
    return ev;
  }

  cancel(ev: ScheduledEvent): void {
    const i = this.queue.indexOf(ev);
    if (i >= 0) this.queue.splice(i, 1);
  }

  advanceTo(t: number): void {
    while (this.queue.length && this.queue[0].t <= t) {
      const ev = this.queue.shift()!;
      this.now = ev.t;
      ev.fn();
    }
    if (t > this.now) this.now = t;
  }

  get pending(): number {
    return this.queue.length;
  }
}
