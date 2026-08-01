import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import { ApDevice, SwitchDevice } from './switch';
import type { DeviceKind } from './device';
import { cidrToString, ipToString, networkOf, parseCidr, parseIp } from './ip';
import { firewallFromJSON, firewallToJSON, type FirewallJSON } from './firewall';
import type { LabDef, LabProgress } from '../labs/types';

export interface SavedIface {
  name: string;
  ip: string | null; // CIDR, e.g. "192.168.1.10/24"
  up: boolean;
}

export interface SavedRoute {
  dest: string; // CIDR ("0.0.0.0/0" for default)
  via: string | null;
  dev: string;
}

export interface SavedDevice {
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
  dhcpServer?: {
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
}

export interface SavedLink {
  id: string;
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
        ip: i.ip ? cidrToString(i.ip.addr, i.ip.prefix) : null,
        up: i.up,
      })),
      routes: (ipd?.staticRoutes ?? []).map((r) => ({
        dest: cidrToString(r.dest, r.prefix),
        via: r.via !== null ? ipToString(r.via) : null,
        dev: r.ifaceName,
      })),
    };
    if (ipd) {
      if (ipd.services.tcp.size || ipd.services.udp.size) {
        saved.services = { tcp: [...ipd.services.tcp], udp: [...ipd.services.udp] };
      }
      const fwj = firewallToJSON(ipd.fw);
      if (fwj) saved.firewall = fwj;
      if (ipd.nameserver !== null) saved.nameserver = ipToString(ipd.nameserver);
      if (ipd.dhcpServer) {
        saved.dhcpServer = {
          enabled: ipd.dhcpServer.enabled,
          rangeStart: ipToString(ipd.dhcpServer.rangeStart),
          rangeEnd: ipToString(ipd.dhcpServer.rangeEnd),
          router: ipd.dhcpServer.router !== null ? ipToString(ipd.dhcpServer.router) : null,
          dns: ipd.dhcpServer.dns !== null ? ipToString(ipd.dhcpServer.dns) : null,
        };
      }
      if (ipd.dnsServer) {
        saved.dnsServer = {
          enabled: ipd.dnsServer.enabled,
          records: [...ipd.dnsServer.records.entries()].map(([n, a]) => [n, ipToString(a)]),
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
      if (d instanceof ApDevice) saved.ssid = d.ssid;
    }
    return saved;
  });
  const links: SavedLink[] = [...net.links.values()].map((l) => ({
    id: l.id,
    a: [l.a.device.id, l.a.name],
    b: [l.b.device.id, l.b.name],
  }));
  return { app: 'netsim', version: 1, devices, links };
}

export function restoreNetwork(data: SaveFile): Network {
  if (data.app !== 'netsim' || data.version !== 1) throw new Error('not a NetSim v1 topology file');
  const net = new Network();
  for (const sd of data.devices) {
    const d = createDevice(net, sd.kind, { id: sd.id, name: sd.name });
    for (const si of sd.ifaces) {
      const iface = d.getInterface(si.name);
      if (!iface) continue;
      iface.up = si.up;
      if (si.ip) {
        const cidr = parseCidr(si.ip);
        if (cidr) iface.ip = cidr;
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
            enabled: sd.dhcpServer.enabled,
            rangeStart: start,
            rangeEnd: end,
            router: sd.dhcpServer.router !== null ? parseIp(sd.dhcpServer.router) : null,
            dns: sd.dhcpServer.dns !== null ? parseIp(sd.dhcpServer.dns) : null,
            leases: new Map(),
          };
        }
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
      if (d instanceof ApDevice && sd.ssid) d.ssid = sd.ssid;
    }
  }
  for (const sl of data.links) {
    try {
      net.connect(sl.a[0], sl.b[0], { id: sl.id, aIface: sl.a[1], bIface: sl.b[1] });
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
