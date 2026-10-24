import { expect, it } from 'vitest';
import { Network } from './network';
import { Host, type IcmpEvent } from './ipdevice';
import { parseIp } from './ip';
import { restoreDevice, restoreNetwork, serializeNetwork, type SavedDevice, type SaveFile } from './serialize';
import { SwitchDevice } from './switch';

function legacySwitch(): SavedDevice {
  return { id: 'sw1', name: 'sw1', kind: 'switch', x: 300, y: 120, forwarding: false, ifaces: [], routes: [] };
}
function legacyFile(): SaveFile {
  return { app: 'netsim', version: 1, devices: [legacySwitch(), ...['pc1', 'pc2'].map((id, index): SavedDevice => ({
    id, name: id, kind: 'host', x: index * 120, y: 240, forwarding: false,
    ifaces: [{ name: 'eth0', ip: '192.0.2.' + (index + 1) + '/24', up: true }], routes: [],
  }))], links: [
    { id: 'left', a: ['pc1', 'eth0'], b: ['sw1', 'eth0'] },
    { id: 'right', a: ['sw1', 'eth7'], b: ['pc2', 'eth0'] },
  ] };
}

it('restores the legacy empty v1 list as eight real ports before cabling and normalizes the next save', () => {
  const file = legacyFile(); file.devices[0].vlans = { eth0: 20, eth7: 20 };
  const original = structuredClone(file), net = restoreNetwork(file);
  const sw = net.devices.get('sw1') as SwitchDevice;
  expect(sw.interfaces.map(iface => iface.name)).toEqual(Array.from({ length: 8 }, (_, i) => 'eth' + i));
  expect(sw.getInterface('eth7')!.link).toBe(net.links.get('right'));
  expect(sw.vlanOf('eth7')).toBe(20);
  const macs = [...net.devices.values()].flatMap(device => device.interfaces.map(iface => iface.mac));
  expect(new Set(macs).size).toBe(macs.length);
  const pc = net.devices.get('pc1') as Host, events: IcmpEvent[] = [], id = pc.allocIcmpId();
  pc.onIcmp(id, event => events.push(event));
  expect(pc.sendEcho(parseIp('192.0.2.2')!, id, 1)).toBeNull();
  net.scheduler.advanceTo(5000);
  expect(events.some(event => event.type === 'reply')).toBe(true);
  expect(sw.macTable.get('20|' + pc.interfaces[0].mac)).toBe(sw.interfaces[0]);
  sw.interfaces[7].up = false;
  const saved = serializeNetwork(net, {});
  expect(saved.devices[0].ifaces).toHaveLength(8);
  const restored = restoreNetwork(JSON.parse(JSON.stringify(saved)));
  expect(serializeNetwork(restored, {})).toEqual(saved);
  expect(restored.devices.get('sw1')!.interfaces[7].up).toBe(false);
  expect(file).toEqual(original);
});

it('also recognizes an empty legacy switch when restoring a single device', () => {
  const net = new Network();
  const sw = restoreDevice(net, legacySwitch());
  expect(sw.interfaces).toHaveLength(8);
});

it.each([
  undefined, null, {},
  [{ name: 'eth1', ip: null, up: true }],
  [{ name: 'eth0', ip: null, up: true }, { name: 'eth0', ip: null, up: true }],
  [{ name: 'eth0', ip: null, up: true }, { name: 'eth2', ip: null, up: true }],
  [null], Array(2),
  Array.from({ length: 25 }, (_, i) => ({ name: 'eth' + i, ip: null, up: true })),
])('rejects a malformed or incomplete explicit port list instead of guessing capacity (%#)', ifaces => {
  const file = legacyFile(); file.devices[0].ifaces = ifaces as SavedDevice['ifaces'];
  expect(() => restoreNetwork(file)).toThrow('Invalid switch port layout');
});

it.each(['eth8', 'eth23', 'eth01', 'wlan0'])('does not expand or silently drop a legacy link to %s', port => {
  const file = legacyFile(); file.links[1].a[1] = port;
  expect(() => restoreNetwork(file)).toThrow('Invalid switch port layout');
});

it.each(['eth8', 'eth23', 'eth01'])('rejects legacy VLAN configuration on nonexistent port %s', port => {
  const saved = legacySwitch(); saved.vlans = { [port]: 20 };
  expect(() => restoreDevice(new Network(), saved)).toThrow('Invalid switch port layout');
});

it.each([1, 7, 8, 9, 24])('also rejects nonexistent cable/VLAN ports on an explicit %i-port switch', count => {
  const file = legacyFile();
  file.devices[0].ifaces = Array.from({ length: count }, (_, i) => ({ name: 'eth' + i, ip: null, up: true }));
  file.links = [file.links[0]];
  file.links[0].b[1] = 'eth' + count;
  expect(() => restoreNetwork(file)).toThrow('references nonexistent port eth' + count);
  file.links = [];
  file.devices[0].vlans = { ['eth' + count]: 20 };
  expect(() => restoreNetwork(file)).toThrow('has VLANs on nonexistent ports');
});
