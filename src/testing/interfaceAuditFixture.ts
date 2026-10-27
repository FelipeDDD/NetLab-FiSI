import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { IpDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { parseIp } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';
import type { AppearanceSaveFile } from '../terminalAppearance';

/** Disposable fixture only. The control variant is constructed correctly from
 * scratch; no user topology is inspected, repaired or reconfigured. */
export function interfaceAuditFixture(control = false) {
  const net = new Network();
  const make = (kind: Parameters<typeof createDevice>[1], id: string, x: number, y: number) => {
    const d = createDevice(net, kind, { id, name: id }); d.position = { x, y }; return d;
  };
  const router = make('router', 'r1', 360, 90) as IpDevice;
  const sw = make('switch', 'sw1', 90, 260) as SwitchDevice;
  const ap = make('ap', 'ap1', 650, 240);
  const client = make('host', 'pc1', 80, 450) as IpDevice;
  const staticClient = make('host', 'pc2', 290, 450) as IpDevice;
  const wireless = make('host', 'pc3', 650, 350) as IpDevice;
  router.addIp('eth0', parseIp('192.168.1.1')!, 24);
  router.addIp('eth3', parseIp('192.168.2.1')!, 24);
  staticClient.addIp('eth0', parseIp('192.168.1.10')!, 24);
  for (const [name, subnet] of [['eth0', 1], ['eth3', 2]] as const) router.dhcpPools.set(name, {
    enabled: true, rangeStart: parseIp(`192.168.${subnet}.100`)!, rangeEnd: parseIp(`192.168.${subnet}.110`)!,
    router: parseIp(`192.168.${subnet}.1`)!, dns: null, leases: new Map(),
  });
  net.connect(router.id, sw.id, { id: 'lan', aIface: 'eth0', bIface: 'eth0' });
  net.connect(sw.id, client.id, { id: 'client', aIface: 'eth1', bIface: 'eth0' });
  net.connect(sw.id, staticClient.id, { id: 'static', aIface: 'eth2', bIface: 'eth0' });
  net.connect(router.id, ap.id, { id: 'ap-uplink', aIface: control ? 'eth3' : 'eth2', bIface: 'eth0' });
  for (const name of ['eth0', 'eth1', 'eth2']) sw.vlans.set(name, 7);
  net.enableWireless(wireless.id); net.associate(wireless.id, ap.id, { id: 'wlan-client' });
  return { net, router, sw, ap, client, staticClient, wireless };
}

export function interfaceAuditDocument(control = false): AppearanceSaveFile {
  const { net } = interfaceAuditFixture(control);
  return { ...serializeNetwork(net, Object.fromEntries([...net.devices].map(([id, d]) => [id, d.position]))),
    ui: { cableColors: { 'ap-uplink': { mode: 'manual', color: '#f472b6' } } } };
}
