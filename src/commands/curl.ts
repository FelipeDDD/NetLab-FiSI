import type { IpDevice } from '../engine/ipdevice';
import { ipToString } from '../engine/ip';
import type { Running } from './shell';
import { resolveHost } from './resolve';

const TIMEOUT_MS = 4000;

function parseUrl(raw: string): { host: string; port: number; path: string } | { error: string } {
  let rest = raw;
  if (rest.startsWith('https://')) return { error: 'netsim: https is not simulated — use http://' };
  if (rest.startsWith('http://')) rest = rest.slice(7);
  if (!rest) return { error: 'curl: no URL specified!' };
  const slash = rest.indexOf('/');
  const hostPort = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? '/' : rest.slice(slash);
  const colon = hostPort.indexOf(':');
  const host = colon < 0 ? hostPort : hostPort.slice(0, colon);
  const port = colon < 0 ? 80 : Number(hostPort.slice(colon + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
    return { error: `curl: (3) URL rejected: ${raw}` };
  return { host, port, path };
}

export function runCurl(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
): Running | null {
  let verbose = false;
  let url: string | null = null;
  for (const a of args) {
    if (a === '-v' || a === '--verbose') verbose = true;
    else if (a.startsWith('-')) {
      write(`curl: netsim supports only: curl [-v] <url>  (got "${a}")\n`);
      done();
      return null;
    } else url = a;
  }
  if (!url) {
    write('curl: no URL specified!\n');
    done();
    return null;
  }
  const parsed = parseUrl(url);
  if ('error' in parsed) {
    write(parsed.error + '\n');
    done();
    return null;
  }
  const { host, port, path } = parsed;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };

  const resolver = resolveHost(device, host, (res) => {
    if (finished) return;
    if ('error' in res) {
      write(`curl: (6) Could not resolve host: ${host}\n`);
      finish();
      return;
    }
    const ip = res.ip;
    if (verbose) write(`*   Trying ${ipToString(ip)}:${port}...\n`);
    const err = device.httpGet(
      ip,
      port,
      path,
      host,
      TIMEOUT_MS,
      (r) => {
        if (finished) return;
        if (r.ok) {
          if (verbose) {
            write(`> GET ${path} HTTP/1.1\n> Host: ${host}\n>\n`);
            write(`< HTTP/1.1 ${r.status} ${r.reason}\n< Content-Length: ${r.body.length}\n<\n`);
          }
          write(r.body.endsWith('\n') ? r.body : r.body + '\n');
        } else if (r.error === 'refused') {
          write(`curl: (7) Failed to connect to ${host} port ${port}: Connection refused\n`);
        } else if (r.error === 'timeout') {
          write(`curl: (28) Failed to connect to ${host} port ${port}: Timeout was reached\n`);
        } else if (r.error === 'unreachable') {
          write(`curl: (7) Failed to connect to ${host} port ${port}: No route to host\n`);
        } else if (r.error === 'empty') {
          write('curl: (52) Empty reply from server\n');
        } else {
          write(`curl: (7) Failed to connect to ${host} port ${port}: ${r.error}\n`);
        }
        finish();
      },
      verbose ? () => write(`* Connected to ${host} (${ipToString(ip)}) port ${port}\n`) : undefined,
    );
    if (err) {
      write(`curl: (7) Failed to connect to ${host} port ${port}: ${err}\n`);
      finish();
    }
  });

  return {
    cancel: () => {
      resolver.cancel();
      finish();
    },
  };
}
