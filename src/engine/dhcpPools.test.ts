import { expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice, RouterDevice } from './ipdevice';
import { parseIp } from './ip';
import { runDhclient, releaseDhcp } from '../commands/dhclient';
import { applyDhcpConfiguration, dhcpConfiguration, validateDhcpPool, legacyPoolInterface } from './dhcpPools';
import { restoreNetwork, serializeNetwork } from './serialize';
import { applyInspectorEdit, captureCreation, captureLink, restoreDeletedDevices } from '../topologyEdits';
const ip=(s:string)=>parseIp(s)!;
it.each(['router','firewall','server'] as const)('%s derives DHCP availability from valid interface pools, not from a shadowed legacy pool',kind=>{
  const net=new Network(),d=createDevice(net,kind) as IpDevice,h=createDevice(net,'host') as IpDevice;
  d.addIp('eth0',ip('192.168.1.1'),24);net.connect(d.id,h.id);
  const cfg={enabled:true,rangeStart:ip('192.168.1.100'),rangeEnd:ip('192.168.1.150'),router:ip('192.168.1.1'),dns:null,leases:new Map<string,number>()};
  d.dhcpPools.set('eth0',cfg);expect(d.dhcpServer).toBeNull();expect(d.dhcpServiceEnabled).toBe(true);
  renew(net,h,'eth0');expect(h.interfaces[0].ip!.addr).toBe(cfg.rangeStart);
  d.dhcpServer={...cfg,enabled:false};expect(d.dhcpServiceEnabled).toBe(true);
  cfg.enabled=false;d.dhcpServer.enabled=true; // Shadowed legacy pool is not a second master switch.
  expect(d.dhcpServiceEnabled).toBe(false);
  d.dhcpPools.clear();d.dhcpServer.interfaceName='missing';expect(d.dhcpServiceEnabled).toBe(false);
  d.dhcpServer.interfaceName='eth0';expect(d.dhcpServiceEnabled).toBe(true);
  d.interfaces[0].ip={addr:ip('10.0.0.1'),prefix:24};expect(d.dhcpServiceEnabled).toBe(false);
});
function lab(kind:'router'|'firewall'='router') {
  const net=new Network(),r=createDevice(net,kind) as RouterDevice;
  r.addIp('eth0',ip('192.168.1.1'),24);r.addIp('eth1',ip('192.168.2.1'),24);
  for(let n=0;n<2;n++)r.dhcpPools.set(`eth${n}`,{enabled:true,rangeStart:ip(`192.168.${n+1}.100`),rangeEnd:ip(`192.168.${n+1}.110`),router:ip(`192.168.${n+1}.1`),dns:ip(`192.168.${n+1}.1`),leases:new Map()});
  const h=createDevice(net,'host') as IpDevice,sw=createDevice(net,'switch'),ap=createDevice(net,'ap');
  const nb=createDevice(net,'notebook') as IpDevice,phone=createDevice(net,'smartphone') as IpDevice;
  net.connect(r.id,h.id,{aIface:'eth0'});net.connect(r.id,sw.id,{aIface:'eth1'});net.connect(sw.id,ap.id);
  net.associate(nb.id,ap.id);net.associate(phone.id,ap.id);
  return {net,r,h,nb,phone};
}
function renew(net:Network,d:IpDevice,name:string) {runDhclient(d,[name],()=>{},()=>{});net.scheduler.advanceTo(net.now+10000);}
it.each(['router','firewall'] as const)('%s chooses pools by ingress through Ethernet, Switch and AP',kind=>{
  const {net,r,h,nb,phone}=lab(kind);renew(net,h,'eth0');renew(net,nb,'wlan0');renew(net,phone,'wlan0');
  expect(h.interfaces[0].ip!.addr).toBe(ip('192.168.1.100'));
  expect(nb.getInterface('wlan0')!.ip!.addr).toBe(ip('192.168.2.100'));expect(phone.interfaces[0].ip!.addr).toBe(ip('192.168.2.101'));
  expect(phone.interfaces[0].gateway).toBe(ip('192.168.2.1'));expect(phone.nameserver).toBe(ip('192.168.2.1'));
  expect(r.dhcpPools.get('eth0')!.leases.size).toBe(1);expect(r.dhcpPools.get('eth1')!.leases.size).toBe(2);
  let reply=false;phone.onIcmp(17,e=>{if(e.type==='reply')reply=true});phone.sendEcho(h.interfaces[0].ip!.addr,17,1);net.scheduler.advanceTo(net.now+3000);expect(reply).toBe(true);
});
it('disables one pool independently and renews/releases leases from the correct pool',()=>{
  const {net,r,h,nb}=lab();renew(net,h,'eth0');renew(net,nb,'wlan0');
  const before=dhcpConfiguration(r),after=structuredClone(before);after.pools.eth0.enabled=false;
  const leases=r.dhcpPools.get('eth1')!.leases;
  const edit={type:'set-dhcp-configuration' as const,label:'DHCP',deviceId:r.id,before,after};
  expect(applyInspectorEdit(net,edit,'redo')).toBe(true);expect(r.dhcpPools.get('eth1')!.leases).toBe(leases);
  const address=h.interfaces[0].ip!.addr;renew(net,h,'eth0');expect(h.interfaces[0].ip!.addr).toBe(address);expect(r.dhcpPools.get('eth0')!.leases.size).toBe(1);renew(net,nb,'wlan0');expect(nb.getInterface('wlan0')!.ip!.addr).toBe(ip('192.168.2.100'));
  releaseDhcp(nb,'wlan0');net.scheduler.advanceTo(net.now+2000);expect(leases.size).toBe(0);
  expect(applyInspectorEdit(net,edit,'undo')).toBe(true);renew(net,h,'eth0');expect(h.interfaces[0].ip).not.toBeNull();
});
it('rejects invalid subnets, own addresses, bad options and conflicting enabled pools',()=>{
  const {r}=lab(),c=r.dhcpPools.get('eth0')!;
  for(const changes of [{rangeStart:ip('192.168.2.100')},{rangeEnd:ip('192.168.1.255')},{rangeStart:ip('192.168.1.1')},{rangeStart:ip('192.168.1.200')},{router:ip('10.0.0.1')},{dns:ip('127.0.0.1')},{dns:ip('192.168.1.105')}])expect(validateDhcpPool(r,'eth0',{...c,...changes})).not.toBeNull();
  expect(validateDhcpPool(r,'eth2',c)).toContain('IPv4');
  r.getInterface('eth1')!.ip={addr:ip('192.168.1.2'),prefix:24};r.dhcpPools.set('eth1',{...c,rangeStart:ip('192.168.1.120'),rangeEnd:ip('192.168.1.130'),leases:new Map()});
  expect(validateDhcpPool(r,'eth0',c)).toContain('Konflikt');
  r.dhcpPools.get('eth1')!.enabled=false;expect(validateDhcpPool(r,'eth0',c)).toBeNull();
});
it('stops a pool when its interface IPv4 becomes incompatible without losing configuration',()=>{
  const {net,r,h}=lab();const cfg=r.dhcpPools.get('eth0')!;r.getInterface('eth0')!.ip={addr:ip('10.10.0.1'),prefix:24};renew(net,h,'eth0');expect(h.interfaces[0].ip).toBeNull();expect(r.dhcpPools.get('eth0')).toBe(cfg);
});
it('migrates a safe legacy pool and preserves ambiguous old configurations without serving them',()=>{
  const {net,r,h}=lab();r.dhcpServer=r.dhcpPools.get('eth0')!;r.dhcpPools.clear();
  expect(legacyPoolInterface(r)).toBe('eth0');renew(net,h,'eth0');expect(h.interfaces[0].ip).not.toBeNull();
  const saved=serializeNetwork(net,{}),restored=restoreNetwork(saved);const loaded=restored.devices.get(r.id) as IpDevice;
  expect(loaded.dhcpServer!.interfaceName).toBe('eth0');expect(loaded.dhcpPool('eth1')).toBeNull();
  r.getInterface('eth1')!.ip={addr:ip('192.168.1.2'),prefix:24};expect(legacyPoolInterface(r)).toBeNull();expect(r.dhcpPool('eth0')).toBeNull();expect(r.dhcpServer!.leases.size).toBe(1);
});
it('round-trips multiple configs and restores deleted devices before links, without persisting runtime leases',()=>{
  const {net,r,h}=lab();renew(net,h,'eth0');const save=serializeNetwork(net,{}),copy=restoreNetwork(JSON.parse(JSON.stringify(save)));
  const loaded=copy.devices.get(r.id) as IpDevice;expect(loaded.dhcpPools.size).toBe(2);expect(loaded.dhcpPools.get('eth0')!.leases.size).toBe(0);
  const snapshot=captureCreation(net,r,{x:0,y:0},0),links=[...net.links.values()].filter(l=>l.a.device===r||l.b.device===r).map(captureLink);
  net.removeDevice(r.id);expect(restoreDeletedDevices(net,[snapshot],links)).toBe(true);
  renew(net,h,'eth0');expect(h.interfaces[0].ip).not.toBeNull();
  const config=dhcpConfiguration(loaded),leases=loaded.dhcpPools.get('eth0')!.leases;applyDhcpConfiguration(loaded,config);expect(loaded.dhcpPools.get('eth0')!.leases).toBe(leases);
});
it('does not relay DHCP into an unconfigured segment or answer for a disabled pool',()=>{
  const {net,r,h}=lab();
  const third=createDevice(net,'host') as IpDevice;
  r.addIp('eth2',ip('192.168.3.1'),24);net.connect(r.id,third.id,{aIface:'eth2'});
  renew(net,third,'eth0');expect(third.interfaces[0].ip).toBeNull();
  r.dhcpPools.get('eth0')!.enabled=false;
  renew(net,h,'eth0');expect(h.interfaces[0].ip).toBeNull();
  expect(r.dhcpPools.get('eth1')!.enabled).toBe(true);
});
