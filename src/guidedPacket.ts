import type { PingProgress, WireFrameContext, WireTransfer, WireVisualTrace } from './engine/network';

export type PacketVisualizationMode = 'live' | 'guided';
export const GUIDED_PING_COUNT = 4;
export const MAX_GUIDED_HOPS = 256;
export const GUIDED_COLLECTION_MS = 10_000;
export const GUIDED_REPLY_WAIT_MS = 5_000;

// Only presentation metadata, never protocol objects or engine instances.
export interface GuidedHop extends WireTransfer {
  parentTransferId?: number;
  fromDeviceName: string;
  toDeviceName: string;
  fromInterface: string;
  toInterface: string;
  ping: number;
  direction: 'request' | 'reply';
}
export interface GuidedAttempt {
  seq: number;
  requestRoot: number;
  requestDestination: number | null;
  replyRoot: number | null;
  replyDestination: number | null;
  deadline: number;
  replied: boolean;
  settled?: boolean;
}
export interface GuidedPacketState {
  status: 'idle' | 'waiting' | 'collecting' | 'playing' | 'paused' | 'finished' | 'incomplete';
  observed: readonly GuidedHop[];
  hops: readonly GuidedHop[];
  session: { deviceId: string; icmpId: number; firstSeq: number } | null;
  attempts: readonly GuidedAttempt[];
  sourceFinished: boolean;
  deadline: number;
  index: number;
  progress: number;
  message: string;
}
export const emptyGuidedPacket = (): GuidedPacketState => ({
  status: 'idle', observed: [], hops: [], session: null, attempts: [], sourceFinished: false, deadline: 0, index: 0, progress: 0,
  message: 'Choose Observe next ping, then run ping or ping -c 4.',
});
export const waitForGuidedPacket = (now = 0): GuidedPacketState => ({ ...emptyGuidedPacket(), status: 'waiting',
  deadline: now + GUIDED_COLLECTION_MS, message: 'Waiting for the next ping. The network must be running.' });
export const endIncompleteGuidedPacket = (message: string): GuidedPacketState => ({ ...emptyGuidedPacket(), status: 'incomplete', message });

export function observeGuidedPacket(state: GuidedPacketState, transfer: WireTransfer, context: WireFrameContext,
  trace: WireVisualTrace | undefined, destination: boolean): GuidedPacketState {
  if (state.status !== 'waiting' && state.status !== 'collecting') return state;
  const p = context.frame.payload;
  if (p.kind !== 'ipv4' || p.l4.kind !== 'icmp') return state;
  const msg = p.l4.msg;
  if (msg.type !== 'echo-request' && msg.type !== 'echo-reply') return state;
  const root = trace?.parentTransferId === undefined;
  if (state.status === 'waiting') {
    if (!root || msg.type !== 'echo-request') return state;
    state = { ...state, status: 'collecting', session: { deviceId: transfer.fromDeviceId, icmpId: msg.id, firstSeq: msg.seq },
      deadline: transfer.start + GUIDED_COLLECTION_MS, message: 'Observing up to four requests and their real replies…' };
  }
  const session = state.session!;
  if (msg.id !== session.icmpId || msg.seq < session.firstSeq || msg.seq >= session.firstSeq + GUIDED_PING_COUNT) return state;
  if (transfer.start >= state.deadline && root && msg.type === 'echo-request') return finishGuidedCollection(state, transfer.start);
  const attempts = state.attempts.map((attempt) => ({ ...attempt }));
  let attempt = attempts.find((item) => item.seq === msg.seq);
  const parent = state.observed.find((hop) => hop.id === trace?.parentTransferId);
  const direction = msg.type === 'echo-request' ? 'request' : 'reply';
  if (root && direction === 'request') {
    if (transfer.fromDeviceId !== session.deviceId || attempt) return state;
    attempt = { seq: msg.seq, requestRoot: transfer.id, requestDestination: null, replyRoot: null, replyDestination: null,
      deadline: transfer.start + GUIDED_REPLY_WAIT_MS, replied: false };
    attempts.push(attempt); attempts.sort((a, b) => a.seq - b.seq);
  } else if (root && direction === 'reply') {
    // Exact generating-request arrival identity, plus ICMP session ID and sequence.
    // Addresses/time alone cannot distinguish simultaneous sessions behind NAT.
    const request = state.observed.find((hop) => hop.id === trace?.echoRequestTransferId && hop.direction === 'request');
    if (!attempt || attempt.replyRoot !== null || request?.ping !== msg.seq - session.firstSeq + 1) return state;
    attempt.replyRoot = transfer.id;
    attempt.requestDestination = request.id;
  } else if (!attempt || !parent || parent.direction !== direction || parent.ping !== msg.seq - session.firstSeq + 1) return state;
  if (state.observed.length >= MAX_GUIDED_HOPS) return endIncompleteGuidedPacket('Sequence incomplete: observation limit reached. Choose Observe next ping.');
  if (destination) {
    if (direction === 'request') attempt.requestDestination = transfer.id;
    else if (transfer.toDeviceId === session.deviceId) attempt.replyDestination = transfer.id;
  }
  const hop: GuidedHop = { ...transfer, ...(trace?.parentTransferId === undefined ? {} : { parentTransferId: trace.parentTransferId }),
    fromDeviceName: context.fromDeviceName, toDeviceName: context.toDeviceName,
    fromInterface: context.fromInterface, toInterface: context.toInterface, ping: msg.seq - session.firstSeq + 1, direction };
  return { ...state, attempts, observed: [...state.observed, hop] };
}

function observedPath(observed: readonly GuidedHop[], root: number | null, destination: number | null): GuidedHop[] {
  if (root === null) return [];
  const target = observed.find((hop) => hop.id === destination);
  if (target) {
    const hops: GuidedHop[] = [];
    let hop: GuidedHop | undefined = target;
    while (hop) {
      hops.unshift(hop);
      hop = observed.find((candidate) => candidate.id === hop!.parentTransferId);
    }
    return hops;
  }
  // For failed delivery show only the unambiguous observed prefix, never guess a flooded branch.
  const hops: GuidedHop[] = [];
  let hop = observed.find((item) => item.id === root);
  while (hop) {
    hops.push(hop);
    const children = observed.filter((item) => item.parentTransferId === hop!.id);
    hop = children.length === 1 ? children[0] : undefined;
  }
  return hops;
}

export function observeGuidedPingProgress(state: GuidedPacketState, event: PingProgress, now: number): GuidedPacketState {
  if (state.status !== 'collecting' || event.deviceId !== state.session?.deviceId || event.icmpId !== state.session.icmpId) return state;
  if (event.type === 'finished') return finishGuidedCollection({ ...state, sourceFinished: true }, now);
  if (!state.attempts.some((attempt) => attempt.seq === event.seq && !attempt.settled)) return state;
  return finishGuidedCollection({ ...state, attempts: state.attempts.map((attempt) => attempt.seq === event.seq ? { ...attempt, settled: true } : attempt) }, now);
}

export function finishGuidedCollection(state: GuidedPacketState, simulatedTime: number): GuidedPacketState {
  if (state.status === 'waiting' && simulatedTime >= state.deadline) {
    return endIncompleteGuidedPacket('No ICMP request observed. Check ARP/routes or choose Observe next ping.');
  }
  if (state.status !== 'collecting') return state;
  const received = (attempt: GuidedAttempt) => state.observed.some((hop) => hop.id === attempt.replyDestination && hop.end <= simulatedTime);
  const settled = (state.attempts.length === GUIDED_PING_COUNT || state.sourceFinished) &&
    state.attempts.every((attempt) => received(attempt) || attempt.settled || simulatedTime >= attempt.deadline);
  // A real timeout/finished command must not discard already observed transmissions still in flight.
  if (state.observed.some((hop) => hop.end > simulatedTime) || (!settled && simulatedTime < state.deadline)) return state;
  const attempts = state.attempts.map((attempt) => ({ ...attempt, replied: received(attempt) }));
  const hops = attempts.flatMap((attempt) => [
    ...observedPath(state.observed, attempt.requestRoot, attempt.requestDestination),
    ...observedPath(state.observed, attempt.replyRoot, attempt.replyDestination),
  ]);
  const replies = attempts.filter((attempt) => attempt.replied).length;
  return { ...state, observed: [], hops, attempts, status: 'playing',
    message: `${attempts.length}/4 requests observed · ${replies} complete reply paths · ${attempts.length - replies} without a complete reply path.${attempts.length < 4 ? ' Remaining requests were not observed.' : ''}` };
}

export function advanceGuidedPacket(state: GuidedPacketState, elapsed: number, duration: number): GuidedPacketState {
  if (state.status !== 'playing' || !state.hops.length || elapsed <= 0) return state;
  const position = state.index + state.progress + elapsed / duration;
  if (position >= state.hops.length) return { ...state, index: state.hops.length - 1, progress: 1, status: 'finished' };
  return { ...state, index: Math.floor(position), progress: position % 1 };
}
export function stepGuidedPacket(state: GuidedPacketState): GuidedPacketState {
  if (!state.hops.length || state.status === 'finished') return state;
  if (state.index + 1 === state.hops.length) return { ...state, progress: 1, status: 'finished' };
  return { ...state, index: state.index + 1, progress: 0, status: 'paused' };
}
export function replayGuidedPacket(state: GuidedPacketState): GuidedPacketState {
  return state.hops.length ? { ...state, index: 0, progress: 0, status: 'playing' } : state;
}

export function validateGuidedPacket(state: GuidedPacketState, valid: (hop: GuidedHop) => boolean): GuidedPacketState {
  return state.observed.every(valid) && state.hops.every(valid) ? state
    : endIncompleteGuidedPacket('Sequence unavailable: a device or link was removed or reconnected. Choose Observe next ping.');
}
