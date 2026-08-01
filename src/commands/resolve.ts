import type { IpDevice } from '../engine/ipdevice';
import { parseIp, type U32 } from '../engine/ip';

// Shared hostname resolution for ping/traceroute/nc/curl: literal addresses
// pass straight through, names go to the device's configured nameserver.
export function resolveHost(
  device: IpDevice,
  target: string,
  cb: (res: { ip: U32 } | { error: string }) => void,
): { cancel(): void } {
  const literal = parseIp(target);
  if (literal !== null) {
    cb({ ip: literal });
    return { cancel: () => {} };
  }
  if (device.nameserver === null) {
    cb({ error: `${target}: Temporary failure in name resolution` });
    return { cancel: () => {} };
  }
  let cancelled = false;
  device.resolveDns(target, device.nameserver, (r) => {
    if (cancelled) return;
    if (typeof r === 'number') cb({ ip: r });
    else if (r === null) cb({ error: `${target}: Name or service not known` });
    else cb({ error: `${target}: Temporary failure in name resolution` });
  });
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
