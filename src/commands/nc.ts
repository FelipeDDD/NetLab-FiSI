import type { IpDevice } from '../engine/ipdevice';
import type { Running } from './shell';
import { resolveHost } from './resolve';

const DEFAULT_TIMEOUT_S = 3;

export function runNc(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
): Running | null {
  let listen = false;
  let udp = false;
  let timeoutS = DEFAULT_TIMEOUT_S;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-l') listen = true;
    else if (a === '-u') udp = true;
    else if (a === '-z' || a === '-v' || a === '-k') {
      // -z zero-I/O is our only client mode; -v/-k accepted for muscle memory
    } else if (a === '-w') {
      timeoutS = Number(args[++i]);
      if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
        write('nc: invalid timeout\n');
        done();
        return null;
      }
    } else if (a === '-p') {
      positional.push(args[++i] ?? '');
    } else if (a.startsWith('-')) {
      write(`nc: netsim supports only: nc [-u] [-z] [-w secs] <ip> <port>  |  nc -l [-u] <port>  (got "${a}")\n`);
      done();
      return null;
    } else {
      positional.push(a);
    }
  }

  const proto = udp ? 'udp' : 'tcp';

  if (listen) {
    const port = Number(positional[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      write('usage: nc -l [-u] <port>\n');
      done();
      return null;
    }
    const registry = udp ? device.ncUdp : device.ncTcp;
    if (registry.has(port) || (udp ? device.services.udp : device.services.tcp).has(port)) {
      write(`nc: Address already in use\n`);
      done();
      return null;
    }
    registry.set(port, (msg) => write(msg + '\n'));
    write(`Listening on 0.0.0.0 ${port} (${proto})\n`);
    return {
      cancel: () => {
        registry.delete(port);
        done();
      },
    };
  }

  const host = positional[0];
  const port = Number(positional[1]);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    write('usage: nc [-u] [-z] [-w secs] <host> <port>\n');
    done();
    return null;
  }

  let cancelled = false;
  const report = (r: 'open' | 'refused' | 'timeout' | 'unreachable') => {
    if (cancelled) return;
    switch (r) {
      case 'open':
        write(`Connection to ${host} ${port} port [${proto}/*] succeeded!\n`);
        break;
      case 'refused':
        write(`nc: connect to ${host} port ${port} (${proto}) failed: Connection refused\n`);
        break;
      case 'timeout':
        write(`nc: connect to ${host} port ${port} (${proto}) failed: Operation timed out\n`);
        break;
      case 'unreachable':
        write(`nc: connect to ${host} port ${port} (${proto}) failed: No route to host\n`);
        break;
    }
    done();
  };

  const resolver = resolveHost(device, host, (res) => {
    if (cancelled) return;
    if ('error' in res) {
      write(`nc: getaddrinfo for host "${host}" port ${port}: Name or service not known\n`);
      done();
      return;
    }
    const err = udp
      ? device.probeUdp(res.ip, port, timeoutS * 1000, report)
      : device.connectTcp(res.ip, port, timeoutS * 1000, report);
    if (err) {
      write(`nc: connect to ${host} port ${port} (${proto}) failed: ${err}\n`);
      done();
    }
  });
  return {
    cancel: () => {
      cancelled = true;
      resolver.cancel();
      done();
    },
  };
}
