import { expect, it } from 'vitest';
import { createDevice } from './factory';
import { Network } from './network';
import { Host, IpDevice, NotebookDevice, SmartphoneDevice, ServerDevice } from './ipdevice';
import { parseIp } from './ip';
import { runDhclient } from '../commands/dhclient';
import { restoreNetwork, serializeNetwork } from './serialize';
import { captureLink, applyLinkEdit, captureCreation, restoreDeletedDevices, applyInspectorEdit } from '../topologyEdits';
import { Shell } from '../commands/shell';
import { hasTerminalKind } from './device';
const ip = (s:string) => parseIp(s)!;
function fixture() {
  const net = new Network(), sw = createDevice(net,'switch'), ap = createDevice(net,'ap');
  const server = createDevice(net,'server') as ServerDevice;
  server.addIp('eth0',ip('10.0.0.1'),24);
  server.dhcpServer={enabled:true,rangeStart:ip('10.0.0.100'),rangeEnd:ip('10.0.0.120'),router:ip('10.0.0.1'),dns:ip('10.0.0.1'),leases:new Map()};
  server.dnsServer={enabled:true,records:new Map([['srv.test',ip('10.0.0.1')]])};
  net.connect(ap.id,sw.id);net.connect(server.id,sw.id);
  const nb=createDevice(net,'notebook',{os:'windows'}) as NotebookDevice;
  return {net,sw,ap,server,nb};
}
function dhcp(net:Network,d:IpDevice,iface:string) {runDhclient(d,[iface],()=>{},()=>{});net.scheduler.advanceTo(net.now+10000);expect(d.getInterface(iface)!.dhcpLease).not.toBeNull();}
function ping(net:Network,d:IpDevice) {let result=false;const id=d.allocIcmpId();d.onIcmp(id,e=>{if(e.type==='reply')result=true});d.sendEcho(ip('10.0.0.1'),id,1);net.scheduler.advanceTo(net.now+4000);d.offIcmp(id);return result;}
it('creates correct independent interfaces and keeps old Hosts unchanged',()=>{
  const {net,nb}=fixture();expect(nb).toBeInstanceOf(Host);expect(new Shell(nb).os).toBe('windows');
  expect(nb.interfaces.map(i=>i.name)).toEqual(['eth0','wlan0']);expect(nb.interfaces[0].mac).not.toBe(nb.interfaces[1].mac);
  const old=createDevice(net,'host');expect(old.interfaces.map(i=>i.name)).toEqual(['eth0']);
  const phone=createDevice(net,'smartphone');expect(phone).toBeInstanceOf(SmartphoneDevice);expect(phone.interfaces.map(i=>i.name)).toEqual(['wlan0']);expect(hasTerminalKind(phone.kind)).toBe(false);
});
it('switches Notebook Ethernet/WLAN with DHCP, preserves both configs and selects current DNS',()=>{
  const {net,sw,ap,nb}=fixture();const cable=net.connect(nb.id,sw.id);
  dhcp(net,nb,'eth0');expect(ping(net,nb)).toBe(true);expect(nb.arpTable.size).toBeGreaterThan(0);
  expect(()=>net.associate(nb.id,ap.id)).toThrow();const old={...nb.interfaces[0].ipv4};
  net.disconnect(cable.id);expect(nb.arpTable.size).toBe(0);expect(nb.nameserver).toBeNull();
  const wifi=net.associate(nb.id,ap.id);dhcp(net,nb,'wlan0');expect(ping(net,nb)).toBe(true);
  expect(nb.interfaces[0].ipv4).toEqual(old);nb.interfaces[0].dns=ip('192.0.2.99');
  expect(nb.nameserver).toBe(ip('10.0.0.1'));expect(()=>net.connect(nb.id,sw.id)).toThrow();
  const wireless={...nb.interfaces[1].ipv4};net.disconnect(wifi.id);net.connect(nb.id,sw.id);
  expect(nb.interfaces[1].ipv4).toEqual(wireless);expect(nb.nameserver).toBe(ip('192.0.2.99'));expect(ping(net,nb)).toBe(true);
});
it('runs two wireless clients, phone DHCP/DNS/ping and blocks out-of-range or mismatched SSID',()=>{
  const {net,ap,nb}=fixture();const phone=createDevice(net,'smartphone') as SmartphoneDevice;
  net.associate(nb.id,ap.id);const link=net.associate(phone.id,ap.id);dhcp(net,nb,'wlan0');dhcp(net,phone,'wlan0');
  expect(ping(net,phone)).toBe(true);expect(ping(net,nb)).toBe(true);
  let resolved:unknown;phone.resolveDns('srv.test',phone.nameserver!,r=>{resolved=r});net.scheduler.advanceTo(net.now+3000);expect(resolved).toBe(ip('10.0.0.1'));
  phone.position.x=600;expect(ping(net,phone)).toBe(false);expect(link.operational).toBe(false);
  phone.position.x=0;expect(ping(net,phone)).toBe(true);link.ssid='wrong';expect(ping(net,phone)).toBe(false);
  expect(()=>net.connect(phone.id,ap.id)).toThrow();
});
it('round-trips mobile types, OS, configs, associations and deletion/link history',()=>{
  const {net,ap,nb}=fixture();const phone=createDevice(net,'smartphone') as SmartphoneDevice;
  net.associate(nb.id,ap.id);const link=net.associate(phone.id,ap.id);dhcp(net,nb,'wlan0');dhcp(net,phone,'wlan0');
  const save=serializeNetwork(net,{}),r=restoreNetwork(JSON.parse(JSON.stringify(save)));
  expect((r.devices.get(nb.id) as NotebookDevice).os).toBe('windows');expect(ping(r,r.devices.get(phone.id) as IpDevice)).toBe(true);
  const record=captureLink(link);expect(applyLinkEdit(net,[record],false)).toBe(true);expect(applyLinkEdit(net,[record],true)).toBe(true);
  const snapshot=captureCreation(net,phone,{x:0,y:0},0);net.removeDevice(phone.id);
  expect(restoreDeletedDevices(net,[snapshot],[record])).toBe(true);expect(ping(net,net.devices.get(phone.id) as IpDevice)).toBe(true);
  expect((r.devices.get(phone.id) as IpDevice).interfaces[0].mac).toBe(phone.interfaces[0].mac);
});
it('supports static per-interface IPv4 and replays configuration edits independently',()=>{
  const {net,nb,sw}=fixture();net.connect(nb.id,sw.id);
  const before=nb.interfaces[0].ipv4;
  const after={mode:'static' as const,ip:{addr:ip('10.0.0.20'),prefix:24},gateway:ip('10.0.0.1'),dns:ip('10.0.0.1')};
  const edit={type:'set-interface-ipv4' as const,label:'IPv4',deviceId:nb.id,ifaceName:'eth0',before,after};
  expect(applyInspectorEdit(net,edit,'redo')).toBe(true);expect(ping(net,nb)).toBe(true);
  expect(nb.interfaces[1].ipv4Mode).toBe('unconfigured');
  expect(applyInspectorEdit(net,edit,'undo')).toBe(true);expect(nb.interfaces[0].ip).toBeNull();
  expect(applyInspectorEdit(net,edit,'redo')).toBe(true);expect(nb.nameserver).toBe(ip('10.0.0.1'));
});
