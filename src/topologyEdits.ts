import type { Device, Link } from './engine/device';
import { Network } from './engine/network';
import { IpDevice } from './engine/ipdevice';
import { ApDevice, SwitchDevice } from './engine/switch';
import { restoreDevice, serializeNetwork } from './engine/serialize';
import { sameInterfaceIp, sameServicePorts, type CreatedDevice, type HistoryLink, type InspectorOperation, type Point } from './topologyHistory';

export function applyAccessVlan(device: SwitchDevice, port: string, vlan: number): void {
  if (device.vlanOf(port) === vlan) return;
  if (vlan === 1) device.vlans.delete(port); else device.vlans.set(port, vlan);
  // Entries learned on the moved port no longer describe its broadcast domain.
  // Keep unrelated learning; never restore historical MAC-table snapshots.
  const iface = device.getInterface(port);
  for (const [key, learnedPort] of device.macTable) if (learnedPort === iface) device.macTable.delete(key);
}

export function applyInspectorEdit(net: Network, operation: InspectorOperation, direction: 'undo' | 'redo'): boolean {
  const device = net.devices.get(operation.deviceId);
  if (!device || device.disposed) return false;
  const from = direction === 'undo' ? 'after' : 'before', to = direction === 'undo' ? 'before' : 'after';
  if (operation.type === 'rename-device') {
    if (device.name !== operation[from]) return false;
    device.name = operation[to];
  } else if (operation.type === 'set-nameserver') {
    if (!(device instanceof IpDevice) || device.nameserver !== operation[from]) return false;
    device.nameserver = operation[to];
  } else if (operation.type === 'set-services') {
    if (!(device instanceof IpDevice) || !sameServicePorts(device.services[operation.proto], operation[from])) return false;
    device.services[operation.proto] = new Set(operation[to]);
  } else if (operation.type === 'set-ssid') {
    if (!(device instanceof ApDevice) || device.ssid !== operation[from]) return false;
    device.ssid = operation[to];
  } else if (operation.type === 'set-port-vlan') {
    if (!(device instanceof SwitchDevice) || !device.getInterface(operation.port) || device.vlanOf(operation.port) !== operation[from]) return false;
    applyAccessVlan(device, operation.port, operation[to]);
  } else {
    const iface = device.getInterface(operation.ifaceName);
    if (!iface) return false;
    if (operation.type === 'set-iface-ip') {
      if (!(device instanceof IpDevice) || !sameInterfaceIp(iface.ip, operation[from])) return false;
      const value = operation[to];
      iface.ip = value ? { ...value } : null;
    } else {
      if (iface.up !== operation[from]) return false;
      iface.up = operation[to];
    }
  }
  return true;
}

export const captureLink = (link: Link): HistoryLink => ({
  id: link.id, a: [link.a.device.id, link.a.name], b: [link.b.device.id, link.b.name], latency: link.latency,
});

export function captureCreation(net: Network, device: Device, position: Point, index: number): CreatedDevice {
  return {
    saved: serializeNetwork(net, { [device.id]: position }).devices.find((d) => d.id === device.id)!,
    macs: Object.fromEntries(device.interfaces.map((iface) => [iface.name, iface.mac])), index,
  };
}

export function restoreCreation(net: Network, creation: CreatedDevice): Device {
  const device = restoreDevice(net, structuredClone(creation.saved));
  for (const iface of device.interfaces) iface.mac = creation.macs[iface.name];
  return device;
}

// Preflight the whole edit before touching the engine: occupied ports and stale
// IDs must never produce a partial replay or silently choose another interface.
export function canApplyLinkEdit(net: Network, links: HistoryLink[], add: boolean, staged = new Map<string, Device>()): boolean {
  const ids = new Set<string>(), ports = new Set<string>();
  for (const link of links) {
    if (ids.has(link.id)) return false;
    ids.add(link.id);
    if (!add) {
      const current = net.links.get(link.id);
      if (!current || JSON.stringify(captureLink(current)) !== JSON.stringify(link)) return false;
      continue;
    }
    if (net.links.has(link.id) || link.a[0] === link.b[0] || !Number.isFinite(link.latency) || link.latency < 0) return false;
    for (const [id, name] of [link.a, link.b]) {
      const device = staged.get(id) ?? net.devices.get(id), iface = device?.getInterface(name);
      const key = JSON.stringify([id, name]);
      if (!device || device.disposed || !iface || iface.link || ports.has(key)) return false;
      ports.add(key);
    }
  }
  return true;
}

export function applyLinkEdit(net: Network, links: HistoryLink[], add: boolean): boolean {
  if (!canApplyLinkEdit(net, links, add)) return false;
  for (const link of links) {
    if (add) net.connect(link.a[0], link.b[0], { id: link.id, aIface: link.a[1], bIface: link.b[1] }).latency = link.latency;
    else net.disconnect(link.id);
  }
  return true;
}

// Prepare only the removed devices, not a snapshot of the live network. No
// registration, callbacks or RIP traffic can reach the live engine before all
// configurations, identities and endpoints have passed validation.
export function restoreDeletedDevices(net: Network, snapshots: CreatedDevice[], links: HistoryLink[]): boolean {
  const staging = new Network(), staged = new Map<string, Device>();
  const macs = new Set([...net.devices.values()].flatMap((d) => d.interfaces.map((i) => i.mac.toLowerCase())));
  try {
    for (const snapshot of snapshots) {
      const { saved } = snapshot;
      if (net.devices.has(saved.id) || staged.has(saved.id) || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return false;
      const device = restoreCreation(staging, snapshot);
      if (Object.keys(snapshot.macs).length !== device.interfaces.length) return false;
      for (const iface of device.interfaces) {
        if (typeof iface.mac !== 'string' || !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(iface.mac) || macs.has(iface.mac.toLowerCase())) return false;
        macs.add(iface.mac.toLowerCase());
      }
      const expected = { ...saved };
      delete expected.ripEnabled; // RIP starts only after the real cabling commit.
      if (JSON.stringify(captureCreation(staging, device, { x: saved.x, y: saved.y }, snapshot.index).saved) !== JSON.stringify(expected)) return false;
      staged.set(device.id, device);
    }
    if (!canApplyLinkEdit(net, links, true, staged)) return false;
  } catch {
    return false;
  }
  // Synchronous commit: everything below uses already validated objects/ports.
  // Original MACs were allocated by this same Network before their deletion.
  for (const device of staged.values()) { device.network = net; net.register(device); }
  applyLinkEdit(net, links, true);
  for (const { saved } of snapshots) {
    const device = staged.get(saved.id);
    if (saved.ripEnabled && device instanceof IpDevice) device.enableRip(true);
  }
  return true;
}
