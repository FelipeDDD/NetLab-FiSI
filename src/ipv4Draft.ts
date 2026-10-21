import { ipToString, maskOf, parseIp } from './engine/ip';
import { emptyIpv4, parseStaticIpv4, sameIpv4, type InterfaceIpv4 } from './engine/ipv4Config';

export interface Ipv4Fields { ip: string; mask: string; gateway: string; dns: string }
export interface Ipv4Draft {
  source: InterfaceIpv4;
  fields: Ipv4Fields;
  dirty: boolean;
  stale: boolean;
}

function cidrInAddress(text: string): { address: string; prefix: number } | null {
  const match = text.trim().match(/^([^/]+)\/(\d{1,2})$/);
  if (!match || parseIp(match[1]) === null || Number(match[2]) > 32) return null;
  return { address: match[1], prefix: Number(match[2]) };
}

export function newIpv4Draft(config: InterfaceIpv4): Ipv4Draft {
  return { source: structuredClone(config), dirty: false, stale: false, fields: {
    ip: config.ip ? ipToString(config.ip.addr) : '',
    mask: config.ip ? ipToString(maskOf(config.ip.prefix)) : '',
    gateway: config.gateway === null ? '' : ipToString(config.gateway),
    dns: config.dns === null ? '' : ipToString(config.dns),
  } };
}

// Committed formatting is allowed to differ from the engine (e.g. /24). Only
// actual uncommitted edits should survive an external change as a stale draft.
export function syncIpv4Draft(draft: Ipv4Draft, config: InterfaceIpv4): Ipv4Draft {
  if (sameIpv4(draft.source, config)) return draft;
  if (!draft.dirty) return newIpv4Draft(config);
  return draft.stale ? draft : { ...draft, stale: true };
}

export function editIpv4Draft(draft: Ipv4Draft, field: keyof Ipv4Fields, text: string): Ipv4Draft {
  const fields = { ...draft.fields, [field]: text };
  if (field === 'ip') {
    const cidr = cidrInAddress(text);
    if (cidr) fields.mask = ipToString(maskOf(cidr.prefix));
  } else if (field === 'mask') {
    // The user is editing the mask now; an earlier CIDR suffix must not keep
    // overriding that field. The IP input isn't focused during this change.
    const cidr = cidrInAddress(fields.ip);
    if (cidr) fields.ip = cidr.address;
  }
  return { ...draft, fields, dirty: true };
}

export function parseIpv4Draft(fields: Ipv4Fields): InterfaceIpv4 | null {
  if (Object.values(fields).every((text) => !text.trim())) return emptyIpv4('unconfigured');
  const cidr = cidrInAddress(fields.ip);
  if (fields.ip.includes('/') && !cidr) return null;
  return parseStaticIpv4(cidr?.address ?? fields.ip, cidr ? String(cidr.prefix) : fields.mask, fields.gateway, fields.dns);
}
