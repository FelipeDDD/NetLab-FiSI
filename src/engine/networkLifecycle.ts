import type { Network } from './network';

/** Release an abandoned/prepared network without running any more virtual time. */
export function disposeNetwork(net: Network): void {
  net.onWireTransfer = null;
  net.onFwDrop = null;
  net.onPingProgress = null;
  net.onClientConfiguration = null;
  for (const device of net.devices.values()) device.dispose();
  net.scheduler.clear();
}
