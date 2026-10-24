import { expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, ServerDevice } from './ipdevice';
import { ApDevice } from './switch';
import { parseCidr, parseIp } from './ip';
import { restoreNetwork, serializeNetwork } from './serialize';
import { applyInspectorEdit } from '../topologyEdits';
import { runDhclient } from '../commands/dhclient';
import { wifiCenter, wifiRadius, normalizeWifiRange } from './wirelessRange';

function fixture() {
  const net = new Network(), host = createDevice(net, 'host') as Host;
  const ap = createDevice(net, 'ap') as ApDevice, sw = createDevice(net, 'switch');
  const server = createDevice(net, 'server') as ServerDevice;
  net.connect(ap.id, sw.id); net.connect(sw.id, server.id);
  server.interfaces[0].ip = parseCidr('10.0.0.1/24');
  host.position = {x:100,y:9};
  const wlan = net.enableWireless(host.id); wlan.ip = parseCidr('10.0.0.2/24');
  const link = net.associate(host.id, ap.id);
  return {net, host, ap, server, wlan, link};
}
function ping(net: Network, host: Host) {
  let reply = false; const id = host.allocIcmpId();
  host.onIcmp(id, e => { if(e.type === 'reply') reply = true; });
  host.sendEcho(parseIp('10.0.0.1')!, id, 1); net.scheduler.advanceTo(net.now+5000);
  host.offIcmp(id); return reply;
}
it('shares the same world scale and body centers for coverage and connectivity', () => {
  expect(wifiRadius(250)).toBe(180); expect(wifiCenter({x:0,y:0},'ap')).toEqual({x:62,y:48});
  expect(normalizeWifiRange(undefined)).toBe(250); expect(normalizeWifiRange(0)).toBe(50);
  expect(normalizeWifiRange(999)).toBe(500);
  const {host, link} = fixture(); host.position.x = 180; expect(link.operational).toBe(true);
  host.position.x = 180.01; expect(link.operational).toBe(false);
});
it('blocks traffic outside coverage and resumes automatically for client or AP movement', () => {
  const {net, host, ap, link} = fixture(); expect(ping(net,host)).toBe(true);
  host.position.x = 400; expect(link.wirelessError).toBe('Außer Reichweite'); expect(ping(net,host)).toBe(false);
  ap.position.x = 300; expect(ping(net,host)).toBe(true);
  ap.position.x = 0; host.position.x = 100; expect(ping(net,host)).toBe(true);
  ap.ssid = 'other'; expect(ping(net,host)).toBe(false);
});
it('updates range through history without affecting Ethernet or another AP', () => {
  const {net, host, ap, link} = fixture();
  const other = createDevice(net,'ap') as ApDevice, h = createDevice(net,'host');
  h.position = {x:100,y:9}; net.enableWireless(h.id); const l2 = net.associate(h.id,other.id);
  const edit = {type:'set-wifi-range' as const,label:'Range',deviceId:ap.id,before:250,after:50};
  expect(applyInspectorEdit(net,edit,'redo')).toBe(true); expect(link.operational).toBe(false);
  expect(l2.operational).toBe(true); expect(ap.interfaces[0].link!.operational).toBe(true);
  expect(applyInspectorEdit(net,edit,'undo')).toBe(true); expect(ping(net,host)).toBe(true);
});
it('rejects new out-of-range or empty-SSID associations and drops in-flight wireless frames', () => {
  const {net,host,ap,wlan,link} = fixture(); let delivered=0;
  const receive = ap.receiveFrame.bind(ap); ap.receiveFrame = (i,f) => { delivered++; receive(i,f); };
  host.sendEcho(parseIp('10.0.0.1')!,1,1); host.position.x = 400;
  net.scheduler.advanceTo(100); expect(delivered).toBe(0);
  net.disconnect(link.id); expect(() => net.associate(host.id,ap.id)).toThrow('Außer Reichweite');
  expect(wlan.link).toBeNull(); host.position.x=100; ap.ssid='  ';
  expect(() => net.associate(host.id,ap.id)).toThrow('SSID');
});
it('persists configured range, positions and inactive associations; old saves default to 250m', () => {
  const {net,host,ap} = fixture(); ap.rangeMeters=90;
  const positions=Object.fromEntries([...net.devices.values()].map(d=>[d.id,d.position]));
  const data=serializeNetwork(net,positions), restored=restoreNetwork(JSON.parse(JSON.stringify(data)));
  expect((restored.devices.get(ap.id) as ApDevice).rangeMeters).toBe(90);
  expect(restored.devices.get(host.id)!.getInterface('wlan0')!.link!.operational).toBe(false);
  data.devices.forEach(d=>delete d.rangeMeters);
  expect((restoreNetwork(data).devices.get(ap.id) as ApDevice).rangeMeters).toBe(250);
});
it('retains a DHCP configuration during an outage and resumes connectivity without a second association', () => {
  const {net,host,ap,server,wlan,link} = fixture();
  server.dhcpServer={enabled:true,rangeStart:parseIp('10.0.0.100')!,rangeEnd:parseIp('10.0.0.110')!,router:parseIp('10.0.0.1'),dns:parseIp('10.0.0.1'),leases:new Map()};
  runDhclient(host,['wlan0'],()=>{},()=>{}); net.scheduler.advanceTo(10000);
  const address=wlan.ip?.addr; expect(wlan.dhcpLease).not.toBeNull();
  ap.rangeMeters=50; expect(ping(net,host)).toBe(false); expect(wlan.ip?.addr).toBe(address);
  ap.rangeMeters=250; expect(ping(net,host)).toBe(true); expect(wlan.link).toBe(link);
});
