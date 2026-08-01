import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import type { DeviceKind } from './device';
import { cidrToString, ipToString, networkOf, parseCidr, parseIp } from './ip';

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
}

export function serializeNetwork(
  net: Network,
  positions: Record<string, { x: number; y: number }>,
): SaveFile {
  const devices: SavedDevice[] = [...net.devices.values()].map((d) => {
    const pos = positions[d.id] ?? { x: 0, y: 0 };
    const ipd = d instanceof IpDevice ? d : null;
    return {
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
  }
  for (const sl of data.links) {
    try {
      net.connect(sl.a[0], sl.b[0], { id: sl.id, aIface: sl.a[1], bIface: sl.b[1] });
    } catch {
      // Skip malformed links rather than failing the whole import.
    }
  }
  return net;
}
