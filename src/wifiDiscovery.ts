import type { IpDevice } from './engine/ipdevice';
import { ApDevice } from './engine/switch';
import { wirelessError } from './engine/wirelessRange';

// Discovery is a read-only view of the same SSID/range/admin rules as links.
// An Ethernet uplink is not required: the AP can still bridge wireless peers.
export function availableAccessPoints(client: IpDevice): ApDevice[] {
  const net = client.network, wlan = client.getInterface('wlan0');
  if (net.devices.get(client.id) !== client || client.disposed || !wlan?.up || wlan.medium !== 'wireless') return [];
  return [...net.devices.values()].filter((ap): ap is ApDevice =>
    ap instanceof ApDevice && !ap.disposed &&
    ap.getInterface(`wifi-${client.id}`)?.up !== false &&
    wirelessError(ap, client, ap.ssid) === null);
}
