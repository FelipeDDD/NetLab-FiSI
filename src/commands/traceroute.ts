import type { IpDevice } from '../engine/ipdevice';
import { ipToString, type U32 } from '../engine/ip';
import type { Running } from './shell';
import { resolveHost } from './resolve';

const PROBES_PER_HOP = 3;
const PROBE_TIMEOUT_MS = 1500;

export function runTraceroute(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
): Running | null {
  let maxHops = 30;
  let target: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-m') {
      maxHops = Number(args[++i]);
      if (!Number.isInteger(maxHops) || maxHops <= 0) {
        write('traceroute: invalid max hops\n');
        done();
        return null;
      }
    } else if (a.startsWith('-')) {
      write(`traceroute: netsim supports only: traceroute [-m max_hops] <host>  (got "${a}")\n`);
      done();
      return null;
    } else {
      target = a;
    }
  }
  if (!target) {
    write('usage: traceroute [-m max_hops] <destination>\n');
    done();
    return null;
  }

  let cancelFn: (() => void) | undefined;
  const resolver = resolveHost(device, target, (res) => {
    if ('error' in res) {
      write(`traceroute: ${res.error}\n`);
      done();
      return;
    }
    cancelFn = start(res.ip);
  });
  if (!cancelFn) {
    cancelFn = () => {
      resolver.cancel();
      done();
    };
  }
  return { cancel: () => cancelFn!() };

  function start(ip: U32): () => void {
  const sched = device.network.scheduler;
  const id = device.allocIcmpId();
  let finished = false;
  let ttl = 1;
  let probe = 0;
  let seqCounter = 0;
  let pendingSeq: number | null = null;
  let pendingTimer: ReturnType<typeof sched.schedule> | null = null;
  let hopFrom: number | null = null;
  let hopRtts: (number | null)[] = [];
  let hopReached = false;
  let sendTime = 0;

  write(`traceroute to ${target} (${ipToString(ip)}), ${maxHops} hops max, 60 byte packets\n`);

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (pendingTimer) sched.cancel(pendingTimer);
    device.offIcmp(id);
    done();
  };

  const flushHopLine = () => {
    const fromStr = hopFrom !== null ? ipToString(hopFrom) : '*';
    const rttStr = hopRtts.map((r) => (r === null ? '*' : `${r.toFixed(1)} ms`)).join('  ');
    write(`${String(ttl).padStart(2)}  ${fromStr}  ${rttStr}\n`);
  };

  const nextStep = () => {
    if (finished) return;
    if (probe < PROBES_PER_HOP) {
      sendProbe();
      return;
    }
    flushHopLine();
    if (hopReached || ttl >= maxHops) {
      cleanup();
      return;
    }
    ttl++;
    probe = 0;
    hopFrom = null;
    hopRtts = [];
    sendProbe();
  };

  const onProbeResult = (from: number | null, rtt: number | null, reached: boolean) => {
    if (pendingTimer) sched.cancel(pendingTimer);
    pendingTimer = null;
    pendingSeq = null;
    if (from !== null) hopFrom = from;
    hopRtts.push(rtt);
    if (reached) hopReached = true;
    probe++;
    nextStep();
  };

  device.onIcmp(id, (ev) => {
    if (finished) return;
    const seq =
      ev.type === 'reply' || ev.type === 'time-exceeded' || ev.type === 'unreachable' || ev.type === 'send-error'
        ? ev.seq
        : null;
    if (seq === null || seq !== pendingSeq) return;
    const rtt = sched.now - sendTime;
    switch (ev.type) {
      case 'reply':
        onProbeResult(ev.from, rtt, true);
        break;
      case 'time-exceeded':
        onProbeResult(ev.from, rtt, false);
        break;
      case 'unreachable':
        onProbeResult(ev.from, rtt, true);
        break;
      case 'send-error':
        onProbeResult(null, null, false);
        break;
    }
  });

  const sendProbe = () => {
    if (finished) return;
    const seq = ++seqCounter;
    pendingSeq = seq;
    sendTime = sched.now;
    const err = device.sendEcho(ip, id, seq, ttl);
    if (err) {
      write(`connect: ${err}\n`);
      cleanup();
      return;
    }
    pendingTimer = sched.schedule(PROBE_TIMEOUT_MS, () => {
      pendingTimer = null;
      pendingSeq = null;
      hopRtts.push(null);
      probe++;
      nextStep();
    });
  };

  sendProbe();
  return cleanup;
  }
}
