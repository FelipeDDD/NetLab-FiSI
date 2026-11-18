import { expect,it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import { SwitchDevice } from './switch';
import { parseCidr,parseIp } from './ip';
import { Shell } from '../commands/shell';
import { serializeNetwork,restoreNetwork } from './serialize';
import { disposeNetwork } from './networkLifecycle';
import { hasTerminalKind } from './device';
import type { EthernetFrame } from './types';
const ip=(s:string)=>parseIp(s)!;
function setup(){const net=new Network(),r=createDevice(net,'router') as IpDevice,p=createDevice(net,'router') as IpDevice,m=createDevice(net,'modem') as SwitchDevice,s=createDevice(net,'server') as IpDevice,a=createDevice(net,'host') as IpDevice,b=createDevice(net,'host') as IpDevice,sw=createDevice(net,'switch');
 net.connect(r.id,m.id,{aIface:'eth1',bIface:'eth0'});net.connect(m.id,p.id,{aIface:'eth1',bIface:'eth0'});net.connect(p.id,s.id,{aIface:'eth1'});net.connect(r.id,sw.id,{aIface:'eth0'});net.connect(a.id,sw.id);net.connect(b.id,sw.id);
 for(const [d,n,c]of [[r,'eth1','192.0.2.2/30'],[p,'eth0','192.0.2.1/30'],[p,'eth1','198.51.100.1/24'],[s,'eth0','198.51.100.10/24'],[r,'eth0','192.168.10.1/24'],[a,'eth0','192.168.10.10/24'],[b,'eth0','192.168.10.20/24']] as const)d.getInterface(n)!.ip=parseCidr(c);
 r.addRoute(0,0,ip('192.0.2.1'));s.addRoute(0,0,ip('198.51.100.1'));for(const d of [a,b])d.addRoute(0,0,ip('192.168.10.1'));r.fw.ensureIptablesTable('nat');r.fw.addNatRule('postrouting',{oif:'eth1'},{type:'masquerade'});s.httpServer={enabled:true,port:80,body:'MODEM OK'};s.dnsServer={enabled:true,records:new Map([['modem.test',ip('198.51.100.10')]])};a.nameserver=b.nameserver=ip('198.51.100.10');
 const run=(d:IpDevice,line:string)=>{let out='';new Shell(d).exec(line,{write:t=>{out+=t;}},()=>{});return()=>out;};return{net,r,p,m,s,a,b,run};}
it('transports ARP and IPv4 frames unchanged in both directions with exactly two symmetric Ethernet ports',()=>{const f=setup();try{
 const incoming:EthernetFrame[]=[],outgoing:EthernetFrame[]=[];f.net.onWireTransfer=(t,c)=>{if(t.toDeviceId===f.m.id)incoming.push(c.frame);if(t.fromDeviceId===f.m.id)outgoing.push(c.frame);};const result=f.run(f.r,'ping -c 1 192.0.2.1');f.net.scheduler.advanceTo(10000);expect(result()).toContain('1 received');expect(outgoing.length).toBeGreaterThan(2);for(const frame of outgoing)expect(incoming).toContain(frame);expect(outgoing.some(f=>f.payload.kind==='arp')).toBe(true);expect(outgoing.some(f=>f.payload.kind==='ipv4')).toBe(true);
 expect(f.m.interfaces.map(i=>i.name)).toEqual(['eth0','eth1']);expect(f.m.interfaces.every(i=>i.ip===null)).toBe(true);expect(f.m).not.toBeInstanceOf(IpDevice);expect(f.m.macTable.size).toBe(0);expect(hasTerminalKind('modem')).toBe(false);expect(()=>f.net.connect(f.m.id,f.s.id)).toThrow();expect(f.m.portChangeError(1)).not.toBeNull();
 const saved=serializeNetwork(f.net,{}),restored=restoreNetwork(saved);try{expect(serializeNetwork(restored,{})).toEqual(saved);}finally{disposeNetwork(restored);}const malformed=structuredClone(saved);malformed.devices.find(d=>d.id===f.m.id)!.ifaces.push({...malformed.devices.find(d=>d.id===f.m.id)!.ifaces[0],name:'eth2'});expect(()=>restoreNetwork(malformed)).toThrow();
}finally{disposeNetwork(f.net);}});
it('carries simultaneous HTTP/DNS through bridge and NAT/PAT',()=>{const f=setup();try{for(const command of ['curl http://198.51.100.10/','dig modem.test']){const a=f.run(f.a,command),b=f.run(f.b,command);f.net.scheduler.advanceTo(f.net.now+10000);for(const out of [a(),b()])expect(out).toContain(command.startsWith('curl')?'MODEM OK':'198.51.100.10');}}finally{disposeNetwork(f.net);}});
it.each(['disconnect','down','no route'])('stops forwarding with %s without changing the other physical link',failure=>{const f=setup();try{if(failure==='disconnect')f.net.disconnect(f.m.interfaces[1].link!.id);if(failure==='down')f.m.interfaces[1].up=false;if(failure==='no route')f.r.staticRoutes=[];const a=f.run(f.a,'curl http://198.51.100.10/');f.net.scheduler.advanceTo(20000);expect(a()).not.toContain('MODEM OK');expect(f.r.interfaces[1].up).toBe(true);expect(f.r.interfaces[1].link?.operational).toBe(true);}finally{disposeNetwork(f.net);}});
