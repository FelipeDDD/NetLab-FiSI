import type { PingProgress, WireFrameContext, WireTransfer, WireVisualTrace } from './engine/network';

export type PacketVisualizationMode = 'live' | 'guided';
export const GUIDED_PING_COUNT = 4; // Rolling replay window, never a session limit.
export const MAX_GUIDED_HOPS = 256;
export const MAX_GUIDED_QUEUE = 32;

export interface GuidedHop extends WireTransfer {
  parentTransferId?: number;
  fromDeviceName: string;
  toDeviceName: string;
  fromInterface: string;
  toInterface: string;
  ping: number; // Actual ICMP sequence number, including continuous pings.
  direction: 'request' | 'reply';
  arp?: 'request' | 'reply';
  /** Relative presentation step within one attempt; siblings share a step. */
  visualStep?: number;
}
export interface GuidedAttempt {
  seq: number;
  requestRoot: number | null;
  requestDestination: number | null;
  replyRoot: number | null;
  replyDestination: number | null;
  deadline: number;
  replied: boolean;
  settled?: boolean;
  local?: boolean;
}
export interface GuidedObservation {
  status: 'waiting' | 'observing' | 'complete' | 'incomplete';
  session: { deviceId: string; icmpId: number } | null;
  attempts: readonly GuidedAttempt[];
  observed: readonly GuidedHop[];
  sourceFinished: boolean;
  cancelled?: boolean;
  truncated: boolean;
  message: string;
}
export interface GuidedPlayback {
  kind: 'follow' | 'replay';
  status: 'waiting' | 'playing' | 'paused' | 'finished';
  hops: readonly GuidedHop[];
  index: number;
  progress: number;
  skipped: number;
}
export interface GuidedPacketState {
  observation: GuidedObservation;
  playback: GuidedPlayback;
}
const emptyPlayback = (): GuidedPlayback => ({ kind: 'follow', status: 'waiting', hops: [], index: 0, progress: 0, skipped: 0 });
export const emptyGuidedPacket = (): GuidedPacketState => ({
  observation: { status: 'waiting', session: null, attempts: [], observed: [], sourceFinished: false, truncated: false,
    message: 'Waiting for a ping. The newest command takes focus automatically.' },
  playback: emptyPlayback(),
});

function beginSession(event: PingProgress): GuidedPacketState {
  const state = emptyGuidedPacket();
  return { ...state, observation: { ...state.observation, status: 'observing',
    session: { deviceId: event.deviceId, icmpId: event.icmpId },
    message: 'New ping selected. Waiting for its first link transmission (DNS/ARP may be needed).' } };
}

export function observeGuidedPingProgress(state: GuidedPacketState, event: PingProgress, now: number): GuidedPacketState {
  // This event is synchronous at command start, BEFORE DNS and ARP. Only a new
  // command can replace an established focus; late attempts/replies cannot.
  if (event.type === 'started') return beginSession(event);
  if (!state.observation.session && event.type === 'attempt') state = beginSession(event); // Entering Guided mid-command.
  const o = state.observation;
  if (event.deviceId !== o.session?.deviceId || event.icmpId !== o.session.icmpId) return state;
  if (o.status === 'incomplete') return state;
  if (event.type === 'attempt') {
    if (o.sourceFinished || o.attempts.some((a) => a.seq === event.seq)) return state;
    const recent = [...o.attempts, { seq: event.seq, requestRoot: null, requestDestination: null, replyRoot: null,
      replyDestination: null, deadline: event.deadline, replied: false, local: event.local }].slice(-GUIDED_PING_COUNT);
    // A slow presentation can still need provenance for its current attempt
    // after it leaves the four-attempt technical recovery window.
    const active = o.attempts.find(a => a.seq === state.playback.hops[state.playback.index]?.ping);
    const attempts = active && !recent.some(a => a.seq === active.seq) ? [active, ...recent] : recent;
    const kept = new Set(attempts.map((a) => a.seq));
    return { ...state, observation: { ...o, status: 'observing', attempts,
      observed: o.observed.filter((hop) => kept.has(hop.ping)),
      message: event.local ? 'Local ping: no packets cross a link.' : `Following ping ${event.seq}. Waiting for observed transmissions.` } };
  }
  const next = event.type === 'finished' ? { ...o, sourceFinished: true, cancelled: event.cancelled === true }
    : { ...o, attempts: o.attempts.map((a) => a.seq === event.seq ? { ...a, settled: true } : a) };
  const p = state.playback, current = p.hops[p.index];
  const hops = next.cancelled && p.kind === 'follow' ? p.hops.filter(h => h.ping === current?.ping) : p.hops;
  return updateGuidedObservation({ ...state, observation: next,
    playback: hops.length === p.hops.length ? p : { ...p, hops, index: Math.max(0, hops.findIndex(h => h.id === current?.id)),
      skipped: p.skipped + p.hops.length - hops.length } }, now);
}

function enqueueHop(playback: GuidedPlayback, hop: GuidedHop, observation: GuidedObservation): GuidedPlayback {
  if (playback.kind === 'replay') return playback; // Replay is an immutable view, not the observer.
  const current = playback.hops[playback.index];
  if (observation.cancelled && hop.ping !== current?.ping) return { ...playback, skipped: playback.skipped + 1 };
  // Late frames remain in observation/capture, without rewinding the visible dot.
  if (current && hop.ping < current.ping) return { ...playback, skipped: playback.skipped + 1 };
  if (current && hop.ping === current.ping && hop.visualStep !== undefined && current.visualStep !== undefined &&
      (hop.visualStep < current.visualStep || hop.visualStep === current.visualStep && playback.progress === 1)) {
    return { ...playback, skipped: playback.skipped + 1 };
  }
  const exhausted = !playback.hops.length || playback.index === playback.hops.length - 1 && playback.progress === 1;
  const attempt = observation.attempts.find(a => a.seq === current?.ping);
  const waitingForReply = exhausted && current && hop.ping > current.ping && attempt &&
    !attempt.settled && !attempt.replied && attempt.replyDestination === null && !observation.sourceFinished;
  const restart = exhausted && !waitingForReply;
  const consumed = restart ? playback.hops.length : playback.index;
  let pending = playback.hops.slice(consumed);
  let skipped = playback.skipped;
  // Keep the active attempt and at most ONE newer attempt. Under overload,
  // replace that unstarted attempt with the newest, never a partial FIFO tail.
  const future = pending.find(h => h.ping !== current?.ping);
  if (current && hop.ping > current.ping && future && future.ping !== hop.ping) {
    if (hop.ping < future.ping) return { ...playback, skipped: skipped + 1 };
    const kept = pending.filter(h => h.ping === current.ping);
    skipped += pending.length - kept.length;
    pending = kept;
  }
  // Discard queued presentation only; observation/replay and Packet Inspector
  // remain independent. Never accumulate an unbounded queue while paused.
  if (pending.length >= MAX_GUIDED_QUEUE && hop.ping === current?.ping) {
    const kept = pending.filter(h => h.ping === current.ping);
    skipped += pending.length - kept.length;
    pending = kept;
  }
  if (pending.length >= MAX_GUIDED_QUEUE) return { ...playback, skipped: skipped + 1 };
  return { ...playback, skipped, hops: [...pending, hop].sort((a, b) => a.ping - b.ping || (a.visualStep ?? 0) - (b.visualStep ?? 0)), index: 0, progress: restart ? 0 : playback.progress,
    status: playback.status === 'paused' ? 'paused' : 'playing' };
}

export function observeGuidedPacket(state: GuidedPacketState, transfer: WireTransfer, context: WireFrameContext,
  trace: WireVisualTrace | undefined, destination: boolean): GuidedPacketState {
  const o = state.observation, p = context.frame.payload;
  if (!o.session || o.status === 'incomplete') return state;
  if (p.kind === 'arp') {
    const origin = trace?.arpPing;
    if (!origin || origin.deviceId !== o.session.deviceId || origin.icmpId !== o.session.icmpId || !o.attempts.some(a => a.seq === origin.seq)) return state;
    const parent = o.observed.find(h => h.id === trace?.parentTransferId && h.arp === p.op && h.ping === origin.seq);
    const request = o.observed.find(h => h.id === trace?.arpRequestTransferId && h.arp === 'request' && h.ping === origin.seq);
    if (trace?.parentTransferId !== undefined ? !parent : p.op === 'reply' && !request) return state;
    return recordHop(state, { ...transfer, ...(parent ? { parentTransferId: parent.id } : {}),
      fromDeviceName: context.fromDeviceName, toDeviceName: context.toDeviceName,
      fromInterface: context.fromInterface, toInterface: context.toInterface,
      ping: origin.seq, direction: origin.direction, arp: p.op }, parent?.id ?? request?.id);
  }
  if (p.l4.kind !== 'icmp') return state;
  const msg = p.l4.msg;
  if ((msg.type !== 'echo-request' && msg.type !== 'echo-reply') || msg.id !== o.session.icmpId) return state;
  const attempts = o.attempts.map((a) => ({ ...a }));
  const attempt = attempts.find((a) => a.seq === msg.seq);
  if (!attempt) return state;
  const direction = msg.type === 'echo-request' ? 'request' : 'reply';
  const root = trace?.parentTransferId === undefined;
  const parent = o.observed.find((hop) => hop.id === trace?.parentTransferId);
  if (root && direction === 'request') {
    if (transfer.fromDeviceId !== o.session.deviceId || attempt.requestRoot !== null) return state;
    attempt.requestRoot = transfer.id;
  } else if (root && direction === 'reply') {
    const request = o.observed.find((hop) => hop.id === trace?.echoRequestTransferId && hop.direction === 'request');
    if (attempt.replyRoot !== null || request?.ping !== msg.seq) return state;
    attempt.replyRoot = transfer.id; attempt.requestDestination = request.id;
  } else if (!parent || parent.direction !== direction || parent.ping !== msg.seq) return state;
  if (o.observed.length >= MAX_GUIDED_HOPS) return { ...state, observation: { ...o, truncated: true } };
  if (destination) {
    if (direction === 'request') attempt.requestDestination = transfer.id;
    else if (transfer.toDeviceId === o.session.deviceId) attempt.replyDestination = transfer.id;
  }
  const hop: GuidedHop = { ...transfer, ...(trace?.parentTransferId === undefined ? {} : { parentTransferId: trace.parentTransferId }),
    fromDeviceName: context.fromDeviceName, toDeviceName: context.toDeviceName,
    fromInterface: context.fromInterface, toInterface: context.toInterface, ping: msg.seq, direction };
  return recordHop({ ...state, observation: { ...o, attempts } }, hop, parent?.id ?? trace?.echoRequestTransferId);
}

function recordHop(state: GuidedPacketState, hop: GuidedHop, predecessor?: number): GuidedPacketState {
  const o = state.observation;
  if (o.observed.some(h => h.id === hop.id)) return state;
  if (o.observed.length >= MAX_GUIDED_HOPS) return { ...state, observation: { ...o, truncated: true } };
  const before = o.observed.filter(h => h.ping === hop.ping && (h.id === predecessor ||
    // These are already identified transfers of this exact attempt/direction,
    // not inferred IP/time matches: ARP gates sending at a device, and an
    // intermediate router may resolve ARP after receiving its ICMP packet.
    h.direction === hop.direction && h.toDeviceId === hop.fromDeviceId &&
    (hop.arp === 'request' ? h.kind === 'icmp' : hop.kind === 'icmp' && h.arp === 'reply')));
  hop = { ...hop, visualStep: before.length ? Math.max(...before.map(h => h.visualStep ?? 0)) + 1 : 0 };
  return { observation: { ...o, observed: [...o.observed, hop], message: `Following ${hop.arp ? 'ARP for ' : ''}ping ${hop.ping}.` },
    playback: enqueueHop(state.playback, hop, o) };
}

function sameVisualStep(a: GuidedHop, b: GuidedHop): boolean {
  return a.ping === b.ping && a.visualStep !== undefined && a.visualStep === b.visualStep;
}

/** Parallel physical branches of the current stage, each on its actual link. */
export function visibleGuidedHops(p: GuidedPlayback): readonly GuidedHop[] {
  const current = p.hops[p.index];
  return !current || p.progress >= 1 ? [] : p.hops.filter((h, i) => i === p.index || sameVisualStep(h, current));
}

function observedPath(observed: readonly GuidedHop[], root: number | null, destination: number | null): GuidedHop[] {
  if (root === null) return [];
  const target = observed.find((hop) => hop.id === destination);
  if (target) {
    const path: GuidedHop[] = [];
    let hop: GuidedHop | undefined = target;
    while (hop) { path.unshift(hop); hop = observed.find((candidate) => candidate.id === hop!.parentTransferId); }
    return path;
  }
  const path: GuidedHop[] = [];
  let hop = observed.find((item) => item.id === root);
  while (hop) {
    path.push(hop);
    const children = observed.filter((item) => item.parentTransferId === hop!.id);
    hop = children.length === 1 ? children[0] : undefined;
  }
  return path;
}
export function guidedReplayHops(o: GuidedObservation): GuidedHop[] {
  return o.attempts.slice(-GUIDED_PING_COUNT).flatMap(a => {
    const path = new Set([...observedPath(o.observed, a.requestRoot, a.requestDestination),
      ...observedPath(o.observed, a.replyRoot, a.replyDestination)].map(h => h.id));
    return o.observed.filter(h => h.ping === a.seq && (h.arp !== undefined || path.has(h.id)));
  });
}

// Updates observation outcomes only. It never starts or gates animation/replay.
export function updateGuidedObservation(state: GuidedPacketState, now: number): GuidedPacketState {
  const o = state.observation;
  if (!o.session || o.status === 'incomplete') return state;
  const attempts = o.attempts.map((a) => {
    const replied = o.observed.some((hop) => hop.id === a.replyDestination && hop.end <= now);
    return replied === a.replied ? a : { ...a, replied };
  });
  const active = state.playback.hops[state.playback.index]?.ping;
  const inFlight = o.observed.some((hop) => hop.end > now && (!o.cancelled || hop.ping === active));
  const complete = o.sourceFinished && !inFlight;
  const status = complete ? 'complete' : 'observing';
  const message = complete ? !o.observed.some(h => h.kind === 'icmp')
    ? attempts.length && attempts.every((a) => a.local)
      ? 'Local ping: no packets crossed a link; there is no path to replay. Ready for the next command.'
      : `No ICMP link transmission was observed for this selection.${o.observed.length ? ' Observed ARP resolution can be replayed.' : ''} Check the terminal, ARP and routes. Ready for the next command.`
    : `Command ended. ${attempts.filter(a => a.replied).length}/${attempts.length} complete reply paths in the replay window. A new ping takes focus automatically.` : o.message;
  if (status === o.status && message === o.message && attempts.every((a, i) => a === o.attempts[i])) return state;
  return { ...state, observation: { ...o, status, message, attempts },
    playback: complete && state.playback.status === 'waiting' && state.playback.hops.length &&
      state.playback.index === state.playback.hops.length - 1 && state.playback.progress === 1
      ? { ...state.playback, status: 'finished' } : state.playback };
}

export function advanceGuidedPacket(state: GuidedPacketState, elapsed: number, duration: number): GuidedPacketState {
  const p = state.playback;
  if ((p.status !== 'playing' && p.status !== 'waiting') || !p.hops.length || elapsed <= 0) return state;
  let remaining = p.progress + elapsed / duration;
  let index = p.index;
  while (remaining >= 1) {
    let next = index + 1;
    while (next < p.hops.length && sameVisualStep(p.hops[index], p.hops[next])) next++;
    if (next >= p.hops.length) return { ...state, playback: { ...p, index: p.hops.length - 1, progress: 1,
      status: p.kind === 'replay' || state.observation.status === 'complete' ? 'finished' : 'waiting' } };
    if (p.kind === 'follow' && p.hops[index].ping !== p.hops[next].ping) {
      // Finish a request/reply (or its real timeout) before the next attempt.
      // Only the presentation waits; the Scheduler keeps running.
      const previous = state.observation.attempts.find(a => a.seq === p.hops[index].ping);
      if (previous && !previous.settled && !previous.replied && previous.replyDestination === null && !state.observation.sourceFinished) {
        return { ...state, playback: { ...p, index, progress: 1, status: 'waiting' } };
      }
    }
    remaining -= 1;
    index = next;
  }
  return { ...state, playback: { ...p, index, progress: remaining, status: 'playing' } };
}
export function toggleGuidedPlayback(state: GuidedPacketState): GuidedPacketState {
  const p = state.playback;
  if (!p.hops.length || p.status !== 'playing' && p.status !== 'paused') return state;
  return { ...state, playback: { ...p, status: p.status === 'playing' ? 'paused' : 'playing' } };
}
export function stepGuidedPacket(state: GuidedPacketState): GuidedPacketState {
  const p = state.playback;
  if (!p.hops.length || p.status === 'finished') return state;
  return { ...state, playback: p.index + 1 < p.hops.length ? { ...p, index: p.index + 1, progress: 0, status: 'paused' }
    : { ...p, progress: 1, status: p.kind === 'replay' ? 'finished' : 'paused' } };
}
export function replayGuidedPacket(state: GuidedPacketState): GuidedPacketState {
  const hops = guidedReplayHops(state.observation).sort((a,b)=>a.ping-b.ping || (a.visualStep??0)-(b.visualStep??0));
  return hops.length ? { ...state, playback: { ...emptyPlayback(), kind: 'replay', status: 'playing', hops } } : state;
}
export function followGuidedPacket(state: GuidedPacketState): GuidedPacketState {
  // Only subsequently observed transmissions are followed; Replay never emits packets.
  return { ...state, playback: emptyPlayback() };
}
export function validateGuidedPacket(state: GuidedPacketState, valid: (hop: GuidedHop) => boolean): GuidedPacketState {
  if (state.observation.observed.every(valid) && state.playback.hops.every(valid)) return state;
  // Retain identity so old attempts cannot reselect this invalidated session.
  return { observation: { ...state.observation, status: 'incomplete', observed: [], attempts: [],
    message: 'Path removed or reconnected. Waiting for a new ping command.' }, playback: emptyPlayback() };
}
