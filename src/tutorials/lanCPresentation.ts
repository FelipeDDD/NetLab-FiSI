import type { Network } from '../engine/network';
import type { TopologyHistory } from '../topologyHistory';
import { Host } from '../engine/ipdevice';

/** Require creation provenance, not just a name that resembles pc1. */
export function canNameLanC(net: Network, history: TopologyHistory, pc: { id: string; mac: string }) {
  const device = net.devices.get(pc.id);
  if (!(device instanceof Host) || device.kind !== 'host' || device.getInterface('eth0')?.mac !== pc.mac || !/^pc[1-9]\d*$/.test(device.name)) return false;
  if ([...net.devices.values()].some(d => d.id !== pc.id && d.name.trim().toLowerCase() === 'pc c')) return false;
  const operations = [...history.past, ...history.future];
  if (operations.some(op => op.type === 'rename-device' && op.deviceId === pc.id)) return false;
  return history.past.some(op => op.type === 'create-device' && op.device.saved.id === pc.id && op.device.saved.kind === 'host' &&
    op.device.saved.name === device.name && op.device.macs.eth0 === pc.mac);
}
