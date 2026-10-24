import type { Network } from './network';
import type { Device, DeviceKind } from './device';
import { FirewallDevice, NotebookDevice, SmartphoneDevice, Host, RouterDevice, ServerDevice } from './ipdevice';
import { ApDevice, SwitchDevice } from './switch';
import { normalizeHostOs, type HostOs } from '../hostOs';

export function createDevice(
  net: Network,
  kind: DeviceKind,
  opts: { id?: string; name?: string; os?: HostOs; switchPorts?: number } = {},
): Device {
  const id = opts.id ?? net.allocId('dev-');
  const name = opts.name ?? net.allocName(kind);
  let d: Device;
  if (kind === 'host') d = new Host(net, id, name);
  else if (kind === 'notebook') d = new NotebookDevice(net, id, name);
  else if (kind === 'smartphone') d = new SmartphoneDevice(net, id, name);
  else if (kind === 'server') d = new ServerDevice(net, id, name);
  else if (kind === 'router') d = new RouterDevice(net, id, name);
  else if (kind === 'firewall') d = new FirewallDevice(net, id, name);
  else if (kind === 'ap') d = new ApDevice(net, id, name);
  else d = new SwitchDevice(net, id, name, 'switch', opts.switchPorts);
  if (d instanceof Host) d.os = normalizeHostOs(opts.os);
  net.register(d);
  return d;
}
