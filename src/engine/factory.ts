import type { Network } from './network';
import type { Device, DeviceKind } from './device';
import { FirewallDevice, Host, RouterDevice, ServerDevice } from './ipdevice';
import { ApDevice, SwitchDevice } from './switch';

export function createDevice(
  net: Network,
  kind: DeviceKind,
  opts: { id?: string; name?: string } = {},
): Device {
  const id = opts.id ?? net.allocId('dev-');
  const name = opts.name ?? net.allocName(kind);
  let d: Device;
  if (kind === 'host') d = new Host(net, id, name);
  else if (kind === 'server') d = new ServerDevice(net, id, name);
  else if (kind === 'router') d = new RouterDevice(net, id, name);
  else if (kind === 'firewall') d = new FirewallDevice(net, id, name);
  else if (kind === 'ap') d = new ApDevice(net, id, name);
  else d = new SwitchDevice(net, id, name);
  net.register(d);
  return d;
}
