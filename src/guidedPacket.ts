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
    const attempts = [...o.attempts, { seq: event.seq, requestRoot: null, requestDestination: null, replyRoot: null,
      replyDestination: null, deadline: event.deadline, replied: false, local: event.local }].slice(-GUIDED_PING_COUNT);
    const kept = new Set(attempts.map((a) => a.seq));
    return { ...state, observation: { ...o, status: 'observing', attempts,
      observed: o.observed.filter((hop) => kept.has(hop.ping)),
      message: event.local ? 'Local ping: no packets cross a link.' : `Following ping ${event.seq}. Waiting for observed transmissions.` } };
  }
  const next = event.type === 'finished' ? { ...o, sourceFinished: true }
    : { ...o, attempts: o.attempts.map((a) => a.seq === event.seq ? { ...a, settled: true } : a) };
  return updateGuidedObservation({ ...state, observation: next }, now);
}

function enqueueHop(playback: GuidedPlayback, hop: GuidedHop): GuidedPlayback {
  if (playback.kind === 'replay') return playback; // Replay is an immutable view, not the observer.
  const exhausted = !playback.hops.length || playback.index === playback.hops.length - 1 && playback.progress === 1;
  const consumed = exhausted ? playback.hops.length : playback.index;
  const pending = playback.hops.slice(consumed);
  // Discard queued presentation only; observation/replay and Packet Inspector
  // remain independent. Never accumulate an unbounded queue while paused.
  if (pending.length >= MAX_GUIDED_QUEUE) return { ...playback, skipped: playback.skipped + 1 };
  return { ...playback, hops: [...pending, hop], index: 0, progress: exhausted ? 0 : playback.progress,
    status: playback.status === 'paused' ? 'paused' : 'playing' };
}

export function observeGuidedPacket(state: GuidedPacketState, transfer: WireTransfer, context: WireFrameContext,
  trace: WireVisualTrace | undefined, destination: boolean): GuidedPacketState {
  const o = state.observation, p = context.frame.payload;
  if (!o.session || o.status === 'incomplete' || p.kind !== 'ipv4' || p.l4.kind !== 'icmp') return state;
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
  return { observation: { ...o, attempts, observed: [...o.observed, hop], message: `Following ping ${msg.seq}.` },
    playback: enqueueHop(state.playback, hop) };
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
  return o.attempts.flatMap((a) => [...observedPath(o.observed, a.requestRoot, a.requestDestination),
    ...observedPath(o.observed, a.replyRoot, a.replyDestination)]);
}

// Updates observation outcomes only. It never starts or gates animation/replay.
export function updateGuidedObservation(state: GuidedPacketState, now: number): GuidedPacketState {
  const o = state.observation;
  if (!o.session || o.status === 'incomplete') return state;
  const attempts = o.attempts.map((a) => {
    const replied = o.observed.some((hop) => hop.id === a.replyDestination && hop.end <= now);
    return replied === a.replied ? a : { ...a, replied };
  });
  const inFlight = o.observed.some((hop) => hop.end > now);
  const complete = o.sourceFinished && !inFlight;
  const status = complete ? 'complete' : 'observing';
  const message = complete ? !o.observed.length
    ? attempts.length && attempts.every((a) => a.local)
      ? 'Local ping: no packets crossed a link; there is no path to replay. Ready for the next command.'
      : 'No ICMP link transmission was observed for this selection. Check the terminal, ARP and routes. Ready for the next command.'
    : `Command ended. ${attempts.filter(a => a.replied).length}/${attempts.length} complete reply paths in the replay window. A new ping takes focus automatically.` : o.message;
  if (status === o.status && message === o.message && attempts.every((a, i) => a === o.attempts[i])) return state;
  return { ...state, observation: { ...o, status, message, attempts },
    playback: complete && state.playback.status === 'waiting' && state.playback.hops.length
      ? { ...state.playback, status: 'finished' } : state.playback };
}

export function advanceGuidedPacket(state: GuidedPacketState, elapsed: number, duration: number): GuidedPacketState {
  const p = state.playback;
  if (p.status !== 'playing' || !p.hops.length || elapsed <= 0) return state;
  const position = p.index + p.progress + elapsed / duration;
  if (position >= p.hops.length) return { ...state, playback: { ...p, index: p.hops.length - 1, progress: 1,
    status: p.kind === 'replay' || state.observation.status === 'complete' ? 'finished' : 'waiting' } };
  return { ...state, playback: { ...p, index: Math.floor(position), progress: position % 1 } };
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
  const hops = guidedReplayHops(state.observation);
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
