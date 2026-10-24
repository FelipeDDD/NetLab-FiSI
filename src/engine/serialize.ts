import { legacyPoolInterface } from './dhcpPools';
import { normalizeWifiRange } from './wirelessRange';
import { NetInterface } from './device';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, IpDevice } from './ipdevice';
import type { HostOs } from '../hostOs';
import { ApDevice, SwitchDevice, CUSTOM_SWITCH_PORTS } from './switch';
import type { DeviceKind } from './device';
import { validIpv4, type Ipv4Mode } from './ipv4Config';
import { cidrToString, ipToString, networkOf, parseCidr, parseIp } from './ip';
import { firewallFromJSON, firewallToJSON, type FirewallJSON } from './firewall';
import type { LabDef, LabProgress } from '../labs/types';

export interface SavedIface {
  medium?: 'wireless';
  ipv4Mode?: Ipv4Mode;
  gateway?: string | null;
  dns?: string | null;
  name: string;
  mac?: string;
  ip: string | null; // CIDR, e.g. "192.168.1.10/24"
  up: boolean;
}

export interface SavedRoute {
  dest: string; // CIDR ("0.0.0.0/0" for default)
  via: string | null;
  dev: string;
}

export interface SavedDevice {
  os?: HostOs;
  id: string;
  kind: DeviceKind;
  name: string;
  x: number;
  y: number;
  forwarding: boolean;
  ifaces: SavedIface[];
  routes: SavedRoute[];
  services?: { tcp: number[]; udp: number[] };
  firewall?: FirewallJSON;
  nameserver?: string | null;
  dhcpPools?: Record<string, NonNullable<SavedDevice['dhcpServer']>>;
  dhcpServer?: {
    interfaceName?: string;
    enabled: boolean;
    rangeStart: string;
    rangeEnd: string;
    router: string | null;
    dns: string | null;
  };
  dnsServer?: { enabled: boolean; records: [string, string][] };
  httpServer?: { enabled: boolean; port: number; body: string };
  ripEnabled?: boolean;
  vlans?: Record<string, number>;
  ssid?: string;
  rangeMeters?: number;
}

export interface SavedLink {
  medium?: 'wireless';
  ssid?: string;
  apMac?: string;
  apUp?: boolean;
  apVlan?: number;
  id: string;
  latency?: number;
  a: [deviceId: string, ifaceName: string];
  b: [deviceId: string, ifaceName: string];
}

export interface SaveFile {
  app: 'netsim';
  version: 1;
  devices: SavedDevice[];
  links: SavedLink[];
  // Present when the file is a lab (or a student's attempt at one).
  lab?: LabDef;
  labProgress?: LabProgress;
}

export function serializeNetwork(
  net: Network,
  positions: Record<string, { x: number; y: number }>,
): SaveFile {
  const devices: SavedDevice[] = [...net.devices.values()].map((d) => {
    const pos = positions[d.id] ?? { x: 0, y: 0 };
    const ipd = d instanceof IpDevice ? d : null;
    const saved: SavedDevice = {
      id: d.id,
      kind: d.kind,
      name: d.name,
      x: pos.x,
      y: pos.y,
      forwarding: ipd?.forwarding ?? false,
      ifaces: d.interfaces.map((i) => ({
        name: i.name,
        ...(i.medium === 'wireless' ? { medium: 'wireless' as const } : {}),
        mac: i.mac,
        ip: i.ip ? cidrToString(i.ip.addr, i.ip.prefix) : null,
        up: i.up,
        ...(ipd ? { ipv4Mode: i.ipv4Mode, gateway: i.gateway === null ? null : ipToString(i.gateway), dns: i.dns === null ? null : ipToString(i.dns) } : {}),
      })),
      routes: (ipd?.staticRoutes ?? []).map((r) => ({
        dest: cidrToString(r.dest, r.prefix),
        via: r.via !== null ? ipToString(r.via) : null,
        dev: r.ifaceName,
      })),
    };
    if (d instanceof Host) saved.os = d.os;
    if (ipd) {
      if (ipd.services.tcp.size || ipd.services.udp.size) {
        saved.services = { tcp: [...ipd.services.tcp].sort((a, b) => a - b), udp: [...ipd.services.udp].sort((a, b) => a - b) };
      }
      const fwj = firewallToJSON(ipd.fw);
      if (fwj) saved.firewall = fwj;
      if (ipd.manualNameserver !== null) saved.nameserver = ipToString(ipd.manualNameserver);
      if (ipd.dhcpServer) {
        saved.dhcpServer = {
          ...(legacyPoolInterface(ipd) ? {interfaceName:legacyPoolInterface(ipd)!} : {}),
          enabled: ipd.dhcpServer.enabled,
          rangeStart: ipToString(ipd.dhcpServer.rangeStart),
          rangeEnd: ipToString(ipd.dhcpServer.rangeEnd),
          router: ipd.dhcpServer.router !== null ? ipToString(ipd.dhcpServer.router) : null,
          dns: ipd.dhcpServer.dns !== null ? ipToString(ipd.dhcpServer.dns) : null,
        };
      }
      if (ipd.dhcpPools.size) saved.dhcpPools = Object.fromEntries([...ipd.dhcpPools].map(([name,c])=>[name,{enabled:c.enabled,rangeStart:ipToString(c.rangeStart),rangeEnd:ipToString(c.rangeEnd),router:c.router===null?null:ipToString(c.router),dns:c.dns===null?null:ipToString(c.dns)}]));
      if (ipd.dnsServer) {
        saved.dnsServer = {
          enabled: ipd.dnsServer.enabled,
          records: [...ipd.dnsServer.records.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([n, a]) => [n, ipToString(a)]),
        };
      }
      if (ipd.httpServer) {
        saved.httpServer = {
          enabled: ipd.httpServer.enabled,
          port: ipd.httpServer.port,
          body: ipd.httpServer.body,
        };
      }
      if (ipd.ripEnabled) saved.ripEnabled = true;
    }
    if (d instanceof SwitchDevice) {
      const vlans: Record<string, number> = {};
      for (const [port, vlan] of d.vlans) if (vlan !== 1) vlans[port] = vlan;
      if (Object.keys(vlans).length) saved.vlans = vlans;
      if (d instanceof ApDevice) { saved.ssid = d.ssid; saved.rangeMeters = d.rangeMeters; }
    }
    return saved;
  });
  const links: SavedLink[] = [...net.links.values()].map((l) => ({
    id: l.id,
    ...(l.medium === 'wireless' ? { medium: 'wireless' as const, ssid: l.ssid, apMac: l.b.mac, apUp: l.b.up, apVlan: (l.b.device as ApDevice).vlanOf(l.b.name) } : {}),
    latency: l.latency,
    a: [l.a.device.id, l.a.name],
    b: [l.b.device.id, l.b.name],
  }));
  return { app: 'netsim', version: 1, devices, links };
}

function savedSwitchPortCount(sd: SavedDevice): number | undefined {
  if (sd.kind !== 'switch') return undefined;
  if (!Array.isArray(sd.ifaces)) throw new Error('Invalid switch port layout: ' + sd.id);
  // Early v1 templates used [] for the factory's eight default ports. Only
  // that exact shorthand is legacy; nonempty lists describe the full capacity.
  const count = sd.ifaces.length === 0 ? CUSTOM_SWITCH_PORTS.default : sd.ifaces.length;
  if (count < CUSTOM_SWITCH_PORTS.min || count > CUSTOM_SWITCH_PORTS.max ||
      Array.from(sd.ifaces).some((iface, index) => iface?.name !== `eth${index}`)) {
    throw new Error('Invalid switch port layout: ' + sd.id);
  }
  const ports = new Set(Array.from({ length: count }, (_, index) => `eth${index}`));
  if (Object.keys(sd.vlans ?? {}).some(port => !ports.has(port))) {
    throw new Error('Invalid switch port layout: ' + sd.id + ' has VLANs on nonexistent ports');
  }
  return count;
}

// Restore one fresh device into an existing network, without replacing survivors.
export function restoreDevice(net: Network, sd: SavedDevice) {
  if (net.devices.has(sd.id)) throw new Error('device ID already exists');
  const switchPorts = savedSwitchPortCount(sd);
  const d = createDevice(net, sd.kind, { id: sd.id, name: sd.name, os: sd.os, switchPorts });
  d.position = { x: sd.x, y: sd.y };
  for (const si of sd.ifaces) {
    let iface = d.getInterface(si.name);
    if (!iface && si.medium === 'wireless') {
      if (d instanceof Host && si.name === 'wlan0') iface = net.enableWireless(d.id, si.mac);
      else if (d instanceof ApDevice && si.name.startsWith('wifi-')) { iface = new NetInterface(d, si.name, si.mac ?? net.nextMac()); iface.medium = 'wireless'; d.interfaces.push(iface); }
    }
    if (!iface) continue;
    if (typeof si.mac === 'string' && /^([\da-f]{2}:){5}[\da-f]{2}$/i.test(si.mac)) iface.mac = si.mac;
    iface.up = si.up;
    if (si.ip) {
      const cidr = parseCidr(si.ip);
      if (cidr) iface.ip = cidr;
    }
    if (d instanceof IpDevice && si.ipv4Mode) {
      const config = { mode: si.ipv4Mode, ip: iface.ip, gateway: si.gateway ? parseIp(si.gateway) : null, dns: si.dns ? parseIp(si.dns) : null };
      if (validIpv4(config)) iface.configureIpv4(config);
    }
  }
  if (d instanceof IpDevice) {
    d.forwarding = sd.forwarding;
    if (sd.services) {
      d.services.tcp = new Set(sd.services.tcp);
      d.services.udp = new Set(sd.services.udp);
    }
    if (sd.firewall) firewallFromJSON(d.fw, sd.firewall);
    if (sd.nameserver) d.nameserver = parseIp(sd.nameserver);
    if (sd.dhcpServer) {
      const start = parseIp(sd.dhcpServer.rangeStart);
      const end = parseIp(sd.dhcpServer.rangeEnd);
      if (start !== null && end !== null) {
        d.dhcpServer = {
          ...(sd.dhcpServer.interfaceName ? {interfaceName:sd.dhcpServer.interfaceName} : {}),
          enabled: sd.dhcpServer.enabled,
          rangeStart: start,
          rangeEnd: end,
          router: sd.dhcpServer.router !== null ? parseIp(sd.dhcpServer.router) : null,
          dns: sd.dhcpServer.dns !== null ? parseIp(sd.dhcpServer.dns) : null,
          leases: new Map(),
        };
      }
    }
    if (sd.dhcpPools) for (const [name,c] of Object.entries(sd.dhcpPools)) {
      const start=parseIp(c.rangeStart),end=parseIp(c.rangeEnd);
      if(start!==null && end!==null) d.dhcpPools.set(name,{enabled:c.enabled,rangeStart:start,rangeEnd:end,router:c.router===null?null:parseIp(c.router),dns:c.dns===null?null:parseIp(c.dns),leases:new Map()});
    }
    if (d.dhcpServer && !d.dhcpServer.interfaceName) {
      const name=legacyPoolInterface(d); if(name) d.dhcpServer.interfaceName=name;
    }
    if (sd.dnsServer) {
      const records = new Map<string, number>();
      for (const [name, addr] of sd.dnsServer.records) {
        const ip = parseIp(addr);
        if (ip !== null) records.set(name.toLowerCase(), ip);
      }
      d.dnsServer = { enabled: sd.dnsServer.enabled, records };
    }
    if (sd.httpServer) d.httpServer = { ...sd.httpServer };
    for (const sr of sd.routes) {
      const dest = parseCidr(sr.dest);
      const via = sr.via !== null ? parseIp(sr.via) : null;
      if (!dest || !d.getInterface(sr.dev)) continue;
      d.staticRoutes.push({
        dest: networkOf(dest.addr, dest.prefix),
        prefix: dest.prefix,
        via,
        ifaceName: sr.dev,
        kind: 'static',
      });
    }
  }
  if (d instanceof SwitchDevice) {
    if (sd.vlans) for (const [port, vlan] of Object.entries(sd.vlans)) d.vlans.set(port, vlan);
    if (d instanceof ApDevice) { if (typeof sd.ssid === 'string') d.ssid = sd.ssid; d.rangeMeters = normalizeWifiRange(sd.rangeMeters); }
  }
  return d;
}

export function restoreNetwork(data: SaveFile): Network {
  if (data.app !== 'netsim' || data.version !== 1) throw new Error('not a NetSim v1 topology file');
  const net = new Network();
  for (const sd of data.devices) restoreDevice(net, sd);
  const switches = new Set(data.devices.filter(sd => sd.kind === 'switch').map(sd => sd.id));
  for (const sl of data.links) {
    // A nonexistent physical switch port is a layout error, not a cable to
    // silently skip or a reason to guess a larger switch capacity.
    if (switches.size) {
      for (const endpoint of [sl?.a, sl?.b]) {
        if (!Array.isArray(endpoint)) continue;
        const [id, port] = endpoint;
        if (switches.has(id) && !net.devices.get(id)!.getInterface(port)) {
          throw new Error('Invalid switch port layout: ' + id + ' references nonexistent port ' + port);
        }
      }
    }
    try {
      const link = sl.medium === 'wireless'
        ? net.associate(sl.a[0], sl.b[0], { id: sl.id, ssid: sl.ssid, apPort: sl.b[1], apMac: sl.apMac, apUp: sl.apUp, apVlan: sl.apVlan, restore: true })
        : net.connect(sl.a[0], sl.b[0], { id: sl.id, aIface: sl.a[1], bIface: sl.b[1] });
      if (typeof sl.latency === 'number' && Number.isFinite(sl.latency) && sl.latency >= 0) link.latency = sl.latency;
    } catch {
      // Skip malformed links rather than failing the whole import.
    }
  }
  // RIP starts after cabling so the first advertisement actually goes somewhere.
  for (const sd of data.devices) {
    if (!sd.ripEnabled) continue;
    const d = net.devices.get(sd.id);
    if (d instanceof IpDevice) d.enableRip(true);
  }
  return net;
}
