import { expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, ServerDevice } from './ipdevice';
import { ApDevice } from './switch';
import { parseCidr, parseIp } from './ip';
import { restoreNetwork, serializeNetwork } from './serialize';
import { applyInspectorEdit, applyLinkEdit, captureLink, captureCreation, restoreDeletedDevices } from '../topologyEdits';
import { runDhclient } from '../commands/dhclient';

function fixture() {
  const net = new Network();
  const host = createDevice(net, 'host') as Host;
  const ap = createDevice(net, 'ap') as ApDevice;
  const sw = createDevice(net, 'switch');
  const server = createDevice(net, 'server') as ServerDevice;
  net.connect(ap.id, sw.id); net.connect(sw.id, server.id);
  server.getInterface('eth0')!.ip = parseCidr('10.0.0.1/24');
  const wlan = net.enableWireless(host.id);
  wlan.ip = parseCidr('10.0.0.2/24');
  const link = net.associate(host.id, ap.id);
  return { net, host, ap, sw, server, wlan, link };
}
function ping(net: Network, host: Host) {
  let reply = false;
  const id = host.allocIcmpId(); host.onIcmp(id, e => { if (e.type === 'reply') reply = true; });
  host.sendEcho(parseIp('10.0.0.1')!, id, 1);
  net.scheduler.advanceTo(net.now + 5000); host.offIcmp(id); return reply;
}
it('bridges WLAN to Ethernet without using any RJ45 and blocks disconnected traffic', () => {
  const {net, host, ap, link} = fixture();
  expect(ap.interfaces.filter(i => i.medium === 'ethernet')).toHaveLength(8);
  expect(ap.interfaces.filter(i => i.medium === 'ethernet' && i.link)).toHaveLength(1);
  expect(ping(net, host)).toBe(true);
  net.disconnect(link.id); expect(ping(net, host)).toBe(false);
  expect(ap.interfaces).toHaveLength(8);
  net.associate(host.id, ap.id); expect(ping(net, host)).toBe(true);
});
it('blocks mismatched SSID and DOWN interfaces, including in-flight frames', () => {
  const {net, host, ap, wlan} = fixture();
  host.sendEcho(parseIp('10.0.0.1')!, 1, 1); ap.ssid = 'changed';
  expect(ping(net, host)).toBe(false);
  net.disconnect(wlan.link!.id); net.associate(host.id, ap.id);
  expect(ping(net, host)).toBe(true);
  wlan.link!.b.up = false; expect(ping(net, host)).toBe(false);
  wlan.link!.b.up = true; net.removeDevice(ap.id); expect(wlan.link).toBeNull();
});
it('uses the existing DHCP client and server across the wireless bridge', () => {
  const {net, host, server, wlan} = fixture();
  server.dhcpServer = {enabled:true, rangeStart:parseIp('10.0.0.100')!, rangeEnd:parseIp('10.0.0.110')!, router:parseIp('10.0.0.1'), dns:parseIp('10.0.0.1'), leases:new Map()};
  runDhclient(host, ['wlan0'], () => {}, () => {});
  net.scheduler.advanceTo(10000);
  expect(wlan.dhcpLease).not.toBeNull(); expect(wlan.gateway).toBe(parseIp('10.0.0.1'));
  expect(wlan.dns).toBe(parseIp('10.0.0.1')); expect(ping(net, host)).toBe(true);
});
it('round-trips association, stable MACs, WLAN IPv4 and history removal/replay', () => {
  const {net, host, wlan, link} = fixture();
  const saved = serializeNetwork(net, {}), restored = restoreNetwork(saved);
  expect(restored.devices.get(host.id)!.getInterface('wlan0')!.mac).toBe(wlan.mac);
  expect(ping(restored, restored.devices.get(host.id) as Host)).toBe(true);
  const record = captureLink(link);
  expect(applyLinkEdit(net, [record], false)).toBe(true);
  expect(applyLinkEdit(net, [record], true)).toBe(true);
  expect(captureLink(net.links.get(link.id)!)).toEqual(record);
  expect(ping(net, host)).toBe(true);
});
it('retains old Ethernet saves and rejects mixed Ethernet/WLAN attachment', () => {
  const {net, host, ap, link, sw} = fixture();
  expect(() => net.connect(host.id, sw.id)).toThrow();
  net.disconnect(link.id); net.connect(host.id, sw.id);
  expect(() => net.associate(host.id, ap.id)).toThrow();
  const old = serializeNetwork(net, {}); old.devices.forEach(d => d.ifaces = d.ifaces.filter(i => !i.medium));
  const restored = restoreNetwork(old); expect(restored.devices.get(host.id)!.interfaces).toHaveLength(1);
  expect(ping(restored, restored.devices.get(host.id) as Host)).toBe(false); // eth0 deliberately has no IP
});
it('replays WLAN creation and SSID edits without changing existing Ethernet MACs', () => {
  const net = new Network(), host = createDevice(net, 'host'), ap = createDevice(net, 'ap') as ApDevice;
  const ethernetMac = host.interfaces[0].mac;
  const edit = {type:'enable-wireless' as const, label:'WLAN', deviceId:host.id, mac:net.nextMac()};
  expect(applyInspectorEdit(net, edit, 'redo')).toBe(true);
  expect(applyInspectorEdit(net, edit, 'undo')).toBe(true);
  expect(applyInspectorEdit(net, edit, 'redo')).toBe(true);
  expect(host.interfaces[0].mac).toBe(ethernetMac);
  const link = net.associate(host.id, ap.id);
  const ssid = {type:'set-ssid' as const, label:'SSID', deviceId:ap.id, before:ap.ssid, after:'new'};
  expect(applyInspectorEdit(net, ssid, 'redo')).toBe(true); expect(link.operational).toBe(false);
  expect(applyInspectorEdit(net, ssid, 'undo')).toBe(true); expect(link.operational).toBe(true);
});
it('restores deleted APs with their wireless and wired links and supports many clients', () => {
  const {net, ap, host} = fixture();
  for (let i = 0; i < 12; i++) { const h = createDevice(net, 'host'); net.enableWireless(h.id); net.associate(h.id, ap.id); }
  expect(ap.interfaces.filter(i => i.medium === 'ethernet')).toHaveLength(8);
  const creation = captureCreation(net, ap, {x:10,y:20}, 0);
  const links = [...net.links.values()].filter(l => l.a.device === ap || l.b.device === ap).map(captureLink);
  net.removeDevice(ap.id);
  expect(restoreDeletedDevices(net, [creation], links)).toBe(true);
  expect(ping(net, host)).toBe(true);
});
