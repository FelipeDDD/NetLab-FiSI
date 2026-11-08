import type { Network } from '../../engine/network';
import { IpDevice } from '../../engine/ipdevice';
import { ipToString, networkOf } from '../../engine/ip';
import { listRuleset } from '../../engine/firewall-fmt';
import { markingBounds, MARKING_COLORS, type AreaMarking } from '../../areaMarkings';
import type { VisualNode } from '../../deviceArtwork';
import { readCableColors, type CableAppearances } from '../../cableAppearance';
import type { AreaRect } from '../../markingGeometry';
import type { DeviceKind } from '../../engine/device';

export interface PrintInterface {
  name: string; address: string | null; prefix: number | null; gateway: string | null;
  mode: string; up: boolean; operational: boolean; peer: { deviceId: string; iface: string } | null;
}
export interface PrintRoute { destination: string; prefix: number; via: string | null; iface: string; origin: 'connected' | 'static' | 'interface'; }
export interface PrintDevice {
  id: string; name: string; kind: DeviceKind; x: number; y: number;
  interfaces: PrintInterface[]; routes: PrintRoute[]; ipCapable: boolean; ripEnabled: boolean;
  services: { key: 'forwarding' | 'dhcp' | 'dns' | 'http' | 'tcp' | 'udp'; value: string }[];
  firewall: string | null;
}
export interface PrintSnapshot {
  capturedAt: string; devices: PrintDevice[];
  links: { id: string; a: [string, string]; b: [string, string]; medium: 'ethernet' | 'wireless'; color: string }[];
  areas: { id: string; name: string; color: string; intensity: number; rects: AreaRect[]; title: { x: number; y: number }; textSize: number }[];
}
export interface PrintVisualSource { nodes: readonly VisualNode[]; cableColors?: CableAppearances; areaMarkings?: readonly AreaMarking[]; }

/** One synchronous, owned snapshot. No engine restoration, scheduler, route lookup,
 * or routes() call (the latter ages RIP caches). Only permanent route configuration
 * plus connected networks is documented; learned RIP/cache entries are excluded. */
export function capturePrintSnapshot(net: Network, visual: PrintVisualSource, capturedAt = new Date().toISOString()): PrintSnapshot {
  const positions = new Map(visual.nodes.map(node => [node.id, node.position]));
  const devices = [...net.devices.values()].map((device, index): PrintDevice => {
    const d = device instanceof IpDevice ? device : null, position = positions.get(device.id);
    const interfaces = device.interfaces.map((iface): PrintInterface => {
      const peer = iface.link?.other(iface);
      return { name: iface.name, address: iface.ip ? ipToString(iface.ip.addr) : null, prefix: iface.ip?.prefix ?? null,
        gateway: iface.gateway === null ? null : ipToString(iface.gateway), mode: iface.ipv4Mode,
        up: iface.up, operational: !!iface.link?.operational,
        peer: peer ? { deviceId: peer.device.id, iface: peer.name } : null };
    });
    const routes: PrintRoute[] = d ? device.interfaces.filter(i => i.up && i.ip).map(i => ({
      destination: ipToString(networkOf(i.ip!.addr, i.ip!.prefix)), prefix: i.ip!.prefix, via: null, iface: i.name, origin: 'connected',
    })) : [];
    if (d) {
      routes.push(...d.staticRoutes.map(route => ({ destination: ipToString(route.dest), prefix: route.prefix,
        via: route.via === null ? null : ipToString(route.via), iface: route.ifaceName, origin: 'static' as const })));
      for (const iface of device.interfaces) if (iface.up && iface.ip && iface.gateway !== null && !routes.some(route => route.prefix === 0 && route.iface === iface.name && route.via === ipToString(iface.gateway!))) {
        routes.push({ destination: '0.0.0.0', prefix: 0, via: ipToString(iface.gateway), iface: iface.name, origin: 'interface' });
      }
    }
    const services: PrintDevice['services'] = [];
    if (d) {
      if (d.forwarding) services.push({ key: 'forwarding', value: 'IPv4' });
      const pools = d.configuredDhcpPools();
      const configs = pools.length ? pools : d.dhcpServer ? [[d.dhcpServer.interfaceName ?? '—', d.dhcpServer] as const] : [];
      for (const [name, pool] of configs) services.push({ key: 'dhcp', value: `${name} · ${d.dhcpServerEnabled && pool.enabled ? 'ON' : 'OFF'} · ${ipToString(pool.rangeStart)}–${ipToString(pool.rangeEnd)} · Gateway ${pool.router === null ? '—' : ipToString(pool.router)} · DNS ${pool.dns === null ? '—' : ipToString(pool.dns)}` });
      if (d.dnsServer) services.push({ key: 'dns', value: `${d.dnsServer.enabled ? 'ON' : 'OFF'}\n${[...d.dnsServer.records].map(([name, addr]) => `${ipToString(addr)} ${name}`).join('\n')}` });
      if (d.httpServer) services.push({ key: 'http', value: `${d.httpServer.enabled ? 'ON' : 'OFF'} · :${d.httpServer.port}` });
      for (const protocol of ['tcp', 'udp'] as const) if (d.services[protocol].size) services.push({ key: protocol, value: [...d.services[protocol]].sort((a, b) => a - b).join(', ') });
    }
    return { id: device.id, name: device.name, kind: device.kind, x: position?.x ?? (index % 4) * 260, y: position?.y ?? Math.floor(index / 4) * 220,
      interfaces, routes, ipCapable: !!d, ripEnabled: d?.ripEnabled ?? false, services, firewall: d?.fw.active() ? listRuleset(d.fw) : null };
  });
  const colors = readCableColors(visual.cableColors, net.links.keys());
  const links = [...net.links.values()].map(link => ({ id: link.id, a: [link.a.device.id, link.a.name] as [string, string],
    b: [link.b.device.id, link.b.name] as [string, string], medium: link.medium, color: colors[link.id]?.color ?? '#64748b' }));
  const areas = (visual.areaMarkings ?? []).flatMap(marking => {
    // Nominal geometry only, independent of zoom-dependent DOM measurements.
    const base = markingBounds(marking, visual.nodes.map(({ id, position, data }) => ({ id, position, data })));
    return base ? [{ id: marking.id, name: marking.name, color: MARKING_COLORS[marking.color].value, intensity: marking.intensity,
      rects: [base, ...(marking.extensions ?? []).map(({ x, y, width, height }) => ({ x, y, width, height }))],
      title: { x: base.x + 12 + (marking.textOffset?.x ?? 0), y: base.y + 18 + (marking.textOffset?.y ?? 0) }, textSize: marking.textSize ?? 12 }] : [];
  });
  return structuredClone({ capturedAt, devices, links, areas });
}
