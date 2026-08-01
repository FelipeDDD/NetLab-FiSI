import type { IpDevice } from '../engine/ipdevice';
import { ipToString, parseIp } from '../engine/ip';
import type { Running } from './shell';

export function runDig(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
): Running | null {
  let server: number | null = null;
  let short = false;
  let name: string | null = null;
  for (const a of args) {
    if (a.startsWith('@')) {
      server = parseIp(a.slice(1));
      if (server === null) {
        write(`dig: couldn't get address for '${a.slice(1)}': not found\n`);
        done();
        return null;
      }
    } else if (a === '+short') {
      short = true;
    } else if (a.startsWith('+') || a.startsWith('-')) {
      write(`dig: netsim supports only: dig [@server] <name> [+short]  (got "${a}")\n`);
      done();
      return null;
    } else {
      name = a;
    }
  }
  if (!name) {
    write('usage: dig [@server] <name> [+short]\n');
    done();
    return null;
  }
  const ns = server ?? device.nameserver;
  if (ns === null) {
    write(';; error: no nameserver configured — use dig @<server> <name> or set DNS in the inspector\n');
    done();
    return null;
  }

  const sched = device.network.scheduler;
  const started = sched.now;
  let cancelled = false;
  device.resolveDns(name, ns, (r) => {
    if (cancelled) return;
    const elapsed = Math.round(sched.now - started);
    if (typeof r === 'number') {
      if (short) {
        write(ipToString(r) + '\n');
      } else {
        write(`; <<>> NetSim dig <<>> ${name}\n`);
        write(`;; ->>HEADER<<- opcode: QUERY, status: NOERROR\n\n`);
        write(`;; QUESTION SECTION:\n;${name}.\t\t\tIN\tA\n\n`);
        write(`;; ANSWER SECTION:\n${name}.\t\t0\tIN\tA\t${ipToString(r)}\n\n`);
        write(`;; Query time: ${elapsed} msec\n;; SERVER: ${ipToString(ns)}#53\n`);
      }
    } else if (r === null) {
      if (short) {
        // dig +short prints nothing on NXDOMAIN, like the real tool.
      } else {
        write(`; <<>> NetSim dig <<>> ${name}\n`);
        write(`;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n\n`);
        write(`;; QUESTION SECTION:\n;${name}.\t\t\tIN\tA\n\n`);
        write(`;; Query time: ${elapsed} msec\n;; SERVER: ${ipToString(ns)}#53\n`);
      }
    } else if (r === 'refused') {
      write(`;; communications error to ${ipToString(ns)}#53: connection refused\n`);
    } else {
      write(';; connection timed out; no servers could be reached\n');
    }
    done();
  });
  return {
    cancel: () => {
      cancelled = true;
      done();
    },
  };
}
