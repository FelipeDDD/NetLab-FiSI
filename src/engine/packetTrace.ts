import type { FramePayload } from './types';
import type { Tuple } from './conntrack';
import type { Route } from './ipdevice';

export type TraceFact =
  | { kind: 'received' | 'local' | 'more' }
  | { kind: 'route'; route: Route; nextHop: number }
  | { kind: 'firewall'; chain: string; verdict: string; rule: string }
  | { kind: 'nat'; rule: string; before: Tuple; after: Tuple }
  | { kind: 'drop'; reason: 'noRoute' | 'replyNoRoute' | 'ttl' | 'arpTimeout' | 'linkDown' | 'forwardingOff' | 'natExhausted'; detail?: string };

export interface TraceEvent { deviceId: string; fact: TraceFact }

/** Only attached during capture. Local output has no inbound transfer yet. */
export class PacketTrace {
  private outgoing = new WeakMap<FramePayload, TraceEvent[]>();
  private arpFor = new WeakMap<FramePayload, FramePayload>();
  private lastProbe = new WeakMap<FramePayload, number>();
  private replies = new WeakMap<FramePayload, number>();

  constructor(private readonly arrival: (payload: FramePayload, deviceId: string) => number | undefined,
    observer: (id: number, event: TraceEvent) => void) {
    this.observe = (id, event) => {
      try { observer(id, event); } catch { /* A diagnostic subscriber cannot interrupt delivery. */ }
    };
  }
  private readonly observe: (id: number, event: TraceEvent) => void;

  reply(request: FramePayload, output: FramePayload, deviceId: string) {
    const id = this.arrival(request, deviceId);
    if (id !== undefined) this.replies.set(output, id);
  }

  responseId(payload: FramePayload) { return this.replies.get(payload); }

  decision(payload: FramePayload, deviceId: string, fact: TraceFact) {
    const id = this.arrival(payload, deviceId) ?? (fact.kind === 'drop' ? this.replies.get(payload) : undefined);
    const event = { deviceId, fact };
    if (id !== undefined) this.observe(id, event);
    else if (fact.kind === 'drop' && this.lastProbe.has(payload)) this.observe(this.lastProbe.get(payload)!, event);
    else {
      const notes = this.outgoing.get(payload) ?? [];
      if (notes.length < 16) notes.push(event);
      this.outgoing.set(payload, notes);
    }
  }

  probe(request: FramePayload, queued: FramePayload) { this.arpFor.set(request, queued); }

  carry(original: FramePayload, rewritten: FramePayload) {
    const events = this.outgoing.get(original);
    if (events && original !== rewritten) {
      this.outgoing.set(rewritten, events);
      this.outgoing.delete(original);
    }
  }

  sent(payload: FramePayload, id: number) {
    for (const event of this.outgoing.get(payload) ?? []) this.observe(id, event);
    this.outgoing.delete(payload);
    const queued = this.arpFor.get(payload);
    if (queued) {
      this.lastProbe.set(queued, id);
      this.arpFor.delete(payload);
    }
    this.replies.delete(payload);
  }

  received(id: number | undefined, deviceId: string) {
    if (id !== undefined) this.observe(id, { deviceId, fact: { kind: 'received' } });
  }

  inFlightLoss(id: number, deviceId: string, port: string) {
    this.observe(id, { deviceId, fact: { kind: 'drop', reason: 'linkDown', detail: port } });
  }
}
