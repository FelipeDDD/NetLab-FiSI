import { maskOf, parseIp, sameSubnet } from './ip';

export type Ipv4Mode = 'static' | 'dhcp' | 'unconfigured';
// Configuration only: a historical address is not proof of an active lease.
export interface InterfaceIpv4 {
  mode: Ipv4Mode;
  ip: { addr: number; prefix: number } | null;
  gateway: number | null;
  dns: number | null;
}
export const emptyIpv4 = (mode: Ipv4Mode): InterfaceIpv4 => ({ mode, ip: null, gateway: null, dns: null });
export const sameIpv4 = (a: InterfaceIpv4, b: InterfaceIpv4) => a.mode === b.mode && a.gateway === b.gateway && a.dns === b.dns
  && (a.ip === b.ip || (!!a.ip && !!b.ip && a.ip.addr === b.ip.addr && a.ip.prefix === b.ip.prefix));
export function validIpv4(c: InterfaceIpv4): boolean {
  const address = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 0xffffffff);
  return ['static', 'dhcp', 'unconfigured'].includes(c.mode) && address(c.gateway) && address(c.dns)
    && (!c.ip || (c.ip.addr !== null && address(c.ip.addr) && Number.isInteger(c.ip.prefix) && c.ip.prefix >= 0 && c.ip.prefix <= 32))
    && (c.mode !== 'unconfigured' || (!c.ip && c.gateway === null && c.dns === null))
    && (c.mode !== 'static' || c.gateway === null || (!!c.ip && sameSubnet(c.gateway, c.ip.addr, c.ip.prefix)));
}
export function parseStaticIpv4(ip: string, mask: string, gateway: string, dns: string): InterfaceIpv4 | null {
  const addr = parseIp(ip), decimalMask = parseIp(mask);
  const prefix = /^\/?\d{1,2}$/.test(mask.trim()) ? Number(mask.trim().replace('/', ''))
    : decimalMask === null ? -1 : Array.from({ length: 33 }, (_, i) => i).find((i) => maskOf(i) === decimalMask) ?? -1;
  const gw = gateway.trim() ? parseIp(gateway) : null, ns = dns.trim() ? parseIp(dns) : null;
  if (addr === null || (gateway.trim() && gw === null) || (dns.trim() && ns === null)) return null;
  const config: InterfaceIpv4 = { mode: 'static', ip: { addr, prefix }, gateway: gw, dns: ns };
  return validIpv4(config) ? config : null;
}
