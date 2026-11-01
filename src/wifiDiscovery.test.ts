import { expect, it } from 'vitest';
import { availableAccessPoints } from './wifiDiscovery';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { Host } from './engine/ipdevice';
import { ApDevice } from './engine/switch';
import { restoreNetwork, serializeNetwork } from './engine/serialize';

it('distinguishes an adapter from available APs and uses current SSID, range and identity', () => {
  const net = new Network(), pc = createDevice(net, 'host') as Host;
  expect(availableAccessPoints(pc)).toEqual([]);
  const wlan = net.enableWireless(pc.id);
  expect(availableAccessPoints(pc)).toEqual([]);
  const ap = createDevice(net, 'ap') as ApDevice;
  expect(availableAccessPoints(pc)).toEqual([ap]);
  ap.position.x = 1000; expect(availableAccessPoints(pc)).toEqual([]);
  ap.position.x = 0; ap.ssid = ' '; expect(availableAccessPoints(pc)).toEqual([]);
  ap.ssid = 'Local'; wlan.up = false; expect(availableAccessPoints(pc)).toEqual([]);
  wlan.up = true; expect(availableAccessPoints(pc)).toEqual([ap]);
  // A wired uplink is not radio availability. Wireless peers still work.
  for (const i of ap.interfaces) i.up = false;
  expect(availableAccessPoints(pc)).toEqual([ap]);
  net.removeDevice(ap.id); expect(availableAccessPoints(pc)).toEqual([]);
  const replacement = createDevice(net, 'ap', {id: ap.id}) as ApDevice;
  expect(availableAccessPoints(pc)).toEqual([replacement]);
  net.removeDevice(pc.id); expect(availableAccessPoints(pc)).toEqual([]);
});
it('follows the actual wireless range boundary and AP/client administrative state', () => {
  const net = new Network(), pc = createDevice(net, 'host') as Host, ap = createDevice(net, 'ap') as ApDevice;
  const wlan = net.enableWireless(pc.id); pc.position = {x:180,y:9};
  expect(availableAccessPoints(pc)).toEqual([ap]);
  pc.position.x += 0.01; expect(availableAccessPoints(pc)).toEqual([]);
  ap.rangeMeters = 500; expect(availableAccessPoints(pc)).toEqual([ap]);
  const link = net.associate(pc.id, ap.id); link.b.up = false;
  expect(availableAccessPoints(pc)).toEqual([]); link.b.up = true;
  expect(availableAccessPoints(pc)).toEqual([ap]);
  wlan.up = false; expect(availableAccessPoints(pc)).toEqual([]);
});
it.each(['netsim-wifi', 'Büro 🌐', 'NetLab-WiFi'])('keeps saved SSID %s, links and MACs while new APs use NetLab-WiFi', ssid => {
  const net = new Network(), pc = createDevice(net, 'host') as Host, ap = createDevice(net, 'ap') as ApDevice;
  expect(ap.ssid).toBe('NetLab-WiFi'); ap.ssid = ssid;
  net.enableWireless(pc.id); const link = net.associate(pc.id, ap.id);
  const saved = serializeNetwork(net, {}), restored = restoreNetwork(saved);
  expect((restored.devices.get(ap.id) as ApDevice).ssid).toBe(ssid);
  expect(restored.links.get(link.id)?.ssid).toBe(ssid);
  expect(restored.links.get(link.id)?.operational).toBe(true);
  expect(serializeNetwork(restored, {})).toEqual(saved);
});

it('restores the historical default for old documents which omitted SSID', () => {
  const net = new Network(), pc = createDevice(net, 'host') as Host, ap = createDevice(net, 'ap') as ApDevice;
  ap.ssid = 'netsim-wifi'; net.enableWireless(pc.id); const link = net.associate(pc.id, ap.id);
  const saved = serializeNetwork(net, {}); delete saved.devices.find(d => d.id === ap.id)!.ssid;
  const restored = restoreNetwork(saved);
  expect((restored.devices.get(ap.id) as ApDevice).ssid).toBe('netsim-wifi');
  expect(restored.links.get(link.id)?.operational).toBe(true);
  expect((createDevice(restored, 'ap') as ApDevice).ssid).toBe('NetLab-WiFi');
});
