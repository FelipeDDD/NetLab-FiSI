import { parseCidr, parseIp } from './ip';
import type { SaveFile } from './serialize';

const kinds = new Set(['host', 'notebook', 'smartphone', 'switch', 'router', 'firewall', 'server', 'ap']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const address = (value: unknown) => typeof value === 'string' && parseIp(value) !== null;
const port = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
const vlan = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4094;

function validateDeviceOptions(d: Record<string, unknown>): void {
  const fail = (field: string): never => { throw new Error('Invalid ' + field + ': ' + d.id); };
  if (d.nameserver !== undefined && d.nameserver !== null && !address(d.nameserver)) fail('nameserver');
  if (d.os !== undefined && d.os !== 'linux' && d.os !== 'windows') fail('OS profile');
  if (d.ripEnabled !== undefined && typeof d.ripEnabled !== 'boolean') fail('RIP configuration');
  if (d.ssid !== undefined && typeof d.ssid !== 'string') fail('SSID');
  if (d.rangeMeters !== undefined && !finite(d.rangeMeters)) fail('Wi-Fi range');
  if (d.vlans !== undefined && (!object(d.vlans) || !Object.values(d.vlans).every(vlan))) fail('VLAN configuration');
  if (d.services !== undefined) {
    const services = d.services;
    if (!object(services)) return fail('service ports');
    for (const name of ['tcp', 'udp']) {
      const ports = services[name];
      if (!Array.isArray(ports) || !ports.every(port)) fail('service ports');
    }
  }
  const pool = (value: unknown) => {
    if (!object(value) || typeof value.enabled !== 'boolean' || !address(value.rangeStart) || !address(value.rangeEnd) || (value.router !== null && !address(value.router)) || (value.dns !== null && !address(value.dns)) || (value.interfaceName !== undefined && !text(value.interfaceName))) fail('DHCP configuration');
    // Validate representation only. Disabled/ambiguous legacy pools must retain
    // their configuration; subnet/service eligibility belongs to the engine.
  };
  if (d.dhcpServer !== undefined) pool(d.dhcpServer);
  if (d.dhcpPools !== undefined) {
    const pools = d.dhcpPools;
    if (!object(pools)) return fail('DHCP pools');
    for (const value of Object.values(pools)) pool(value);
  }
  if (d.dnsServer !== undefined) {
    const dns = d.dnsServer;
    if (!object(dns) || typeof dns.enabled !== 'boolean' || !Array.isArray(dns.records) || dns.records.some(r => !Array.isArray(r) || r.length !== 2 || !text(r[0]) || !address(r[1]))) fail('DNS server');
  }
  if (d.httpServer !== undefined) {
    const http = d.httpServer;
    if (!object(http) || typeof http.enabled !== 'boolean' || !port(http.port) || typeof http.body !== 'string') fail('HTTP server');
  }
  if (d.firewall !== undefined) validateFirewall(d.firewall, fail);
}

function validateFirewall(value: unknown, fail: (field: string) => never): void {
  if (!object(value)) fail('firewall');
  if (value.tables !== undefined && (!object(value.tables) || typeof value.tables.filter !== 'boolean' || typeof value.tables.nat !== 'boolean')) fail('firewall tables');
  for (const family of ['filter', 'nat']) {
    const chains = value[family];
    if (chains === undefined) continue; // Known legacy defaults.
    if (!object(chains)) fail('firewall chains');
    for (const [hook, chain] of Object.entries(chains)) {
      if (!(family === 'filter' ? ['input', 'forward', 'output'] : ['prerouting', 'postrouting']).includes(hook) || !object(chain) || typeof chain.name !== 'string' || !Array.isArray(chain.rules)) fail('firewall chain');
      if (family === 'filter' && chain.policy !== 'accept' && chain.policy !== 'drop') fail('firewall policy');
      for (const rule of chain.rules) {
        if (!object(rule) || !object(rule.match)) fail('firewall rule');
        const match = rule.match;
        for (const field of ['src', 'dst']) if (match[field] !== undefined && (typeof match[field] !== 'string' || !parseCidr(match[field] as string))) fail('firewall address');
        if (match.proto !== undefined && !['tcp', 'udp', 'icmp'].includes(match.proto as string)) fail('firewall protocol');
        if (match.icmpType !== undefined && !['echo-request', 'echo-reply'].includes(match.icmpType as string)) fail('ICMP match');
        if (match.ct !== undefined && (!Array.isArray(match.ct) || !match.ct.every(s => ['new', 'established', 'related', 'invalid'].includes(s)))) fail('conntrack match');
        for (const field of ['iif', 'oif']) if (match[field] !== undefined && typeof match[field] !== 'string') fail('firewall interface');
        for (const field of ['sport', 'dport']) {
          const range = match[field];
          if (range !== undefined && (!Array.isArray(range) || range.length !== 2 || !range.every(port) || range[0] > range[1])) fail('firewall port range');
        }
        if (family === 'filter') {
          if (!['accept', 'drop', 'reject'].includes(rule.verdict as string)) fail('firewall verdict');
        } else {
          const action = rule.action;
          if (!object(action) || !['masquerade', 'snat', 'dnat'].includes(action.type as string)) fail('NAT action');
          if (action.type !== 'masquerade' && !address(action.addr)) fail('NAT address');
          if (action.port !== undefined && !port(action.port)) fail('NAT port');
        }
      }
    }
  }
}

/** Validate the v1 boundary before any live resources are touched. Known legacy
 * defaults are still interpreted by restoreDevice and the presentation readers. */
export function validateSave(data: unknown): asserts data is SaveFile {
  if (!object(data) || data.app !== 'netsim' || data.version !== 1) throw new Error('Not a supported NetSim v1 topology file');
  if (!Array.isArray(data.devices) || !Array.isArray(data.links)) throw new Error('Invalid topology: devices and links must be arrays');
  const ids = new Set<string>();
  for (const d of data.devices) {
    if (!object(d) || !text(d.id) || ids.has(d.id)) throw new Error('Invalid or duplicate device ID');
    ids.add(d.id);
    if (!kinds.has(d.kind as string)) throw new Error('Unknown device type: ' + String(d.kind));
    if (typeof d.name !== 'string' || !finite(d.x) || !finite(d.y) || typeof d.forwarding !== 'boolean') throw new Error('Invalid device configuration: ' + d.id);
    // Preserve the established switch-specific diagnostics and [] shorthand.
    if (!Array.isArray(d.ifaces)) throw new Error((d.kind === 'switch' ? 'Invalid switch port layout: ' : 'Invalid interfaces: ') + d.id);
    const names = new Set<string>();
    for (const i of d.ifaces) {
      if (!object(i) || !text(i.name) || names.has(i.name) || typeof i.up !== 'boolean') throw new Error((d.kind === 'switch' ? 'Invalid switch port layout: ' : 'Invalid interface: ') + d.id);
      names.add(i.name);
      if (i.ip !== null && (typeof i.ip !== 'string' || !parseCidr(i.ip))) throw new Error('Invalid IPv4 address: ' + d.id + ':' + i.name);
      if (i.mac !== undefined && (typeof i.mac !== 'string' || !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(i.mac))) throw new Error('Invalid MAC: ' + d.id + ':' + i.name);
      if (i.medium !== undefined && i.medium !== 'wireless') throw new Error('Invalid interface medium: ' + d.id + ':' + i.name);
      if (i.ipv4Mode !== undefined && !['static', 'dhcp', 'unconfigured'].includes(i.ipv4Mode as string)) throw new Error('Invalid IPv4 mode: ' + d.id + ':' + i.name);
      for (const field of ['gateway', 'dns']) if (i[field] !== undefined && i[field] !== null && (typeof i[field] !== 'string' || parseIp(i[field] as string) === null)) throw new Error('Invalid ' + field + ': ' + d.id + ':' + i.name);
    }
    if (!Array.isArray(d.routes)) throw new Error('Invalid routes: ' + d.id);
    for (const r of d.routes) if (!object(r) || typeof r.dest !== 'string' || !parseCidr(r.dest) || !text(r.dev) || (r.via !== null && (typeof r.via !== 'string' || parseIp(r.via) === null))) throw new Error('Invalid route: ' + d.id);
    validateDeviceOptions(d);
  }
  const linkIds = new Set<string>();
  for (const l of data.links) {
    if (!object(l) || !text(l.id) || linkIds.has(l.id) || ids.has(l.id)) throw new Error('Invalid or duplicate link ID');
    linkIds.add(l.id);
    if (l.medium !== undefined && l.medium !== 'wireless') throw new Error('Invalid link medium: ' + l.id);
    if (l.latency !== undefined && (!finite(l.latency) || l.latency < 0)) throw new Error('Invalid link latency: ' + l.id);
    if ((l.ssid !== undefined && typeof l.ssid !== 'string') || (l.apMac !== undefined && (typeof l.apMac !== 'string' || !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(l.apMac))) || (l.apUp !== undefined && typeof l.apUp !== 'boolean') || (l.apVlan !== undefined && !vlan(l.apVlan))) throw new Error('Invalid wireless link configuration: ' + l.id);
    for (const end of ['a', 'b']) {
      const endpoint = l[end];
      if (!Array.isArray(endpoint) || endpoint.length !== 2 || !text(endpoint[0]) || !text(endpoint[1]) || !ids.has(endpoint[0])) throw new Error('Invalid link endpoint: ' + l.id + ':' + end);
    }
  }
}
