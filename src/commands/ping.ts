import type { IpDevice } from '../engine/ipdevice';
import { ipToString, type U32 } from '../engine/ip';
import type { Running } from './shell';
import { resolveHost } from './resolve';
import type { ScheduledEvent } from '../engine/scheduler';

const INTERVAL_MS = 1000;
const TIMEOUT_MS = 2000;

export function runPing(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
  windows = false,
): Running | null {
  let count: number | null = windows ? 4 : null;
  let target: string | null = null;
  let countOption = false;
  for (let i = 0; i < args.length; i++) {
    const a = windows ? args[i].toLowerCase() : args[i];
    if (windows && (a === '-n' || a === '-t')) {
      if (countOption) { write('Use either -n count or -t, once.\n'); done(); return null; }
      countOption = true;
    }
    if (a === (windows ? '-n' : '-c')) {
      count = Number(args[++i]);
      if (!Number.isInteger(count) || count <= 0 || (windows && (!/^\d+$/.test(args[i] ?? '') || !Number.isSafeInteger(count)))) {
        write(windows ? 'Bad value for option -n.\n' : 'ping: invalid count\n');
        done();
        return null;
      }
    } else if (windows && a === '-t') {
      count = null;
    } else if (a.startsWith('-') || (windows && a.startsWith('/'))) {
      write(windows ? `Invalid option ${a}. Usage: ping [-n count | -t] <host>\n` : `ping: netsim supports only: ping [-c count] <host>  (got "${a}")\n`);
      done();
      return null;
    } else {
      if (windows && target) { write('Bad parameter. Usage: ping [-n count | -t] <host>\n'); done(); return null; }
      target = args[i];
    }
  }
  if (!target) {
    write(windows ? 'Usage: ping [-n count | -t] <destination>\n' : 'usage: ping [-c count] <destination>\n');
    done();
    return null;
  }

  // Command identity is allocated before resolution so Guided can focus the
  // newest command immediately, even while DNS or ARP is pending.
  const id = device.allocIcmpId();
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    device.network.emitPingProgress({ type: 'finished', deviceId: device.id, icmpId: id });
    done();
  };
  device.network.emitPingProgress({ type: 'started', deviceId: device.id, icmpId: id });
  // Resolution may complete synchronously (literal IP) or after DNS traffic.
  let cancelFn: (() => void) | undefined;
  const resolver = resolveHost(device, target, (res) => {
    if ('error' in res) {
      write(windows ? `Ping request could not find host ${target}. Please check the name and try again.\n` : `ping: ${res.error}\n`);
      complete();
      return;
    }
    cancelFn = start(res.ip);
  });
  if (!cancelFn) {
    cancelFn = () => {
      resolver.cancel();
      complete();
    };
  }
  return { needsScheduler: true, cancel: () => cancelFn!() };

  function start(ip: U32): () => void {
  const sched = device.network.scheduler;
  const startedAt = sched.now;
  const sendTimes = new Map<number, number>();
  const answered = new Set<number>();
  const rtts: number[] = [];
  let sent = 0;
  let received = 0;
  let finished = false;
  const timers = new Set<ScheduledEvent>();
  const schedule = (delay: number, fn: () => void) => {
    const timer = device.schedule(delay, () => {
      timers.delete(timer);
      fn();
    });
    timers.add(timer);
  };

  // ICMP payload lengths are not represented by this simulator.
  write(windows ? `\nPinging ${target === ipToString(ip) ? target : `${target} [${ipToString(ip)}]`}:\n`
    : `PING ${target} (${ipToString(ip)}) 56(84) bytes of data.\n`);

  const finish = () => {
    if (finished) return;
    finished = true;
    for (const timer of timers) sched.cancel(timer);
    timers.clear();
    device.offIcmp(id);
    const loss = sent ? Math.round(((sent - received) / sent) * 100) : 0;
    if (windows) {
      write(`\nPing statistics for ${ipToString(ip)}:\n    Packets: Sent = ${sent}, Received = ${received}, Lost = ${sent - received} (${loss}% loss),\n`);
    } else {
      write(`\n--- ${target} ping statistics ---\n`);
      write(
        `${sent} packets transmitted, ${received} received, ${loss}% packet loss, time ${Math.round(
          sched.now - startedAt,
        )}ms\n`,
      );
    }
    if (rtts.length) {
      const min = Math.min(...rtts);
      const max = Math.max(...rtts);
      const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
      write(windows ? `Approximate round trip times in milli-seconds:\n    Minimum = ${min.toFixed(1)}ms, Maximum = ${max.toFixed(1)}ms, Average = ${avg.toFixed(1)}ms\n`
        : `rtt min/avg/max = ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)} ms\n`);
    }
    complete();
  };

  const maybeFinish = (seq: number) => {
    device.network.emitPingProgress({ type: 'settled', deviceId: device.id, icmpId: id, seq });
    if (count !== null && (windows ? sent >= count && answered.size >= sent : seq >= count)) finish();
  };

  device.onIcmp(id, (ev) => {
    if (finished) return;
    switch (ev.type) {
      case 'reply': {
        if (answered.has(ev.seq)) break;
        answered.add(ev.seq);
        received++;
        const rtt = sched.now - (sendTimes.get(ev.seq) ?? sched.now);
        rtts.push(rtt);
        write(
          windows ? `Reply from ${ipToString(ev.from)}: time=${rtt.toFixed(1)}ms TTL=${ev.ttl}\n`
            : `64 bytes from ${ipToString(ev.from)}: icmp_seq=${ev.seq} ttl=${ev.ttl} time=${rtt.toFixed(1)} ms\n`,
        );
        maybeFinish(ev.seq);
        break;
      }
      case 'time-exceeded': {
        const seq = ev.seq ?? 0;
        answered.add(seq);
        write(windows ? `Reply from ${ipToString(ev.from)}: TTL expired in transit.\n` : `From ${ipToString(ev.from)} icmp_seq=${seq} Time to live exceeded\n`);
        maybeFinish(seq);
        break;
      }
      case 'unreachable': {
        const seq = ev.seq ?? 0;
        answered.add(seq);
        const what = ev.code === 'net' ? 'Net' : ev.code === 'host' ? 'Host' : 'Port';
        write(windows ? `Reply from ${ipToString(ev.from)}: Destination ${what.toLowerCase()} unreachable.\n` : `From ${ipToString(ev.from)} icmp_seq=${seq} Destination ${what} Unreachable\n`);
        maybeFinish(seq);
        break;
      }
      case 'send-error': {
        const seq = ev.seq ?? 0;
        answered.add(seq);
        write(windows ? `PING: transmit failed. ${ev.message}\n` : `From ${device.name} icmp_seq=${seq} ${ev.message}\n`);
        maybeFinish(seq);
        break;
      }
    }
  });

  const sendOne = () => {
    if (finished) return;
    const seq = ++sent;
    sendTimes.set(seq, sched.now);
    device.network.emitPingProgress({ type: 'attempt', deviceId: device.id, icmpId: id,
      seq, local: device.hasIp(ip), deadline: sched.now + TIMEOUT_MS });
    const err = device.sendEcho(ip, id, seq);
    if (err) {
      if (windows) {
        answered.add(seq);
        write(`PING: transmit failed. ${err}\n`);
        maybeFinish(seq);
        if (!finished && (count === null || sent < count)) schedule(INTERVAL_MS, sendOne);
        return;
      }
      sent--;
      // EPERM (an OUTPUT-chain drop) reads differently from a routing failure.
      if (err === 'Operation not permitted') write(`ping: sendmsg: ${err}\n`);
      else write(`ping: connect: ${err}\n`);
      finish();
      return;
    }
    if (finished) return;
    schedule(TIMEOUT_MS, () => {
      if (finished || answered.has(seq)) return;
      answered.add(seq);
      // Matches real `ping -O` behaviour; silent gaps teach nothing.
      write(windows ? 'Request timed out.\n' : `no answer yet for icmp_seq=${seq}\n`);
      maybeFinish(seq);
    });
    if (count === null || sent < count) schedule(INTERVAL_MS, sendOne);
  };

  sendOne();
  return finish;
  }
}
