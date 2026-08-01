// IPv4 addresses are stored as unsigned 32-bit numbers so subnet math is
// plain bit arithmetic. Strings only appear at the parse/format boundary.
export type U32 = number;

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
export const BROADCAST_IP: U32 = 0xffffffff;

export function parseIp(s: string): U32 | null {
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function ipToString(ip: U32): string {
  return [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.');
}

export function parseCidr(s: string): { addr: U32; prefix: number } | null {
  const i = s.indexOf('/');
  if (i < 0) return null;
  const addr = parseIp(s.slice(0, i));
  const prefixStr = s.slice(i + 1);
  const prefix = Number(prefixStr);
  if (addr === null || prefixStr === '' || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { addr, prefix };
}

export function maskOf(prefix: number): U32 {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function networkOf(addr: U32, prefix: number): U32 {
  return (addr & maskOf(prefix)) >>> 0;
}

export function sameSubnet(a: U32, b: U32, prefix: number): boolean {
  return networkOf(a, prefix) === networkOf(b, prefix);
}

export function broadcastOf(addr: U32, prefix: number): U32 {
  return (networkOf(addr, prefix) | (~maskOf(prefix) >>> 0)) >>> 0;
}

export function cidrToString(addr: U32, prefix: number): string {
  return `${ipToString(addr)}/${prefix}`;
}
