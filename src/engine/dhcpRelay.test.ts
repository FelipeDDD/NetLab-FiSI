import { expect,it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import { parseCidr,parseIp } from './ip';
import { Shell } from '../commands/shell';
import { disposeNetwork } from './networkLifecycle';
import { dhcpConfiguration,applyDhcpConfiguration } from './dhcpPools';
import { serializeNetwork,restoreNetwork } from './serialize';
const ip=(s:string)=>parseIp(s)!;
function fixture(){
 const net=new Network(),pc=createDevice(net,'host') as IpDevice,r=createDevice(net,'router') as IpDevice,s=createDevice(net,'server') as IpDevice;
 net.connect(pc.id,r.id,{aIface:'eth0',bIface:'eth0'});net.connect(r.id,s.id,{aIface:'eth1',bIface:'eth0'});
 r.interfaces[0].ip=parseCidr('192.168.10.1/24');r.interfaces[1].ip=parseCidr('192.168.20.1/24');s.interfaces[0].ip=parseCidr('192.168.20.10/24');s.addRoute(0,0,ip('192.168.20.1'));
 r.dhcpRelays.set('eth0',{enabled:true,server:ip('192.168.20.10')});s.dhcpRemotePools.set('lan10',{enabled:true,network:ip('192.168.10.0'),prefix:24,rangeStart:ip('192.168.10.100'),rangeEnd:ip('192.168.10.150'),router:ip('192.168.10.1'),dns:ip('192.168.20.10'),leases:new Map()});
 const packets:{op:string;src:number;dst:number;sp:number;dp:number;giaddr:number|undefined;hops:number|undefined}[]=[];
 net.onWireTransfer=(_,c)=>{const p=c.frame.payload;if(p.kind==='ipv4'&&p.l4.kind==='udp'&&p.l4.app?.kind==='dhcp')packets.push({op:p.l4.app.op,src:p.src,dst:p.dst,sp:p.l4.srcPort,dp:p.l4.dstPort,giaddr:p.l4.app.giaddr,hops:p.l4.app.hops});};
 const run=(d:IpDevice,line:string)=>{let out='';new Shell(d).exec(line,{write:s=>{out+=s;}},()=>{});net.scheduler.advanceTo(net.now+20000);return out;};return{net,pc,r,s,packets,run};
}
it('negotiates DORA over real routed packets and returns remote mask/gateway/DNS',()=>{const f=fixture();try{
 expect(f.run(f.pc,'dhclient eth0')).toContain('bound to 192.168.10.100');expect(f.pc.interfaces[0].ip).toEqual(parseCidr('192.168.10.100/24'));expect(f.pc.interfaces[0].gateway).toBe(ip('192.168.10.1'));expect(f.pc.nameserver).toBe(ip('192.168.20.10'));
 for(const op of ['discover','request'])expect(f.packets.some(p=>p.op===op&&p.sp===67&&p.dp===67&&p.giaddr===ip('192.168.10.1')&&p.hops===1&&p.dst===ip('192.168.20.10'))).toBe(true);
 for(const op of ['offer','ack'])expect(f.packets.some(p=>p.op===op&&p.dst===ip('192.168.10.1')&&p.dp===67)).toBe(true);
 expect(f.run(f.pc,'ping -c 1 192.168.20.10')).toContain('1 received');
}finally{disposeNetwork(f.net);}});
it('serializes only configuration and restores DHCP Relay/pools in v1',()=>{const f=fixture();try{
 f.run(f.pc,'dhclient eth0');const saved=serializeNetwork(f.net,{});const restored=restoreNetwork(JSON.parse(JSON.stringify(saved)));try{
 expect(dhcpConfiguration(restored.devices.get(f.r.id) as IpDevice)).toEqual(dhcpConfiguration(f.r));expect(dhcpConfiguration(restored.devices.get(f.s.id) as IpDevice)).toEqual(dhcpConfiguration(f.s));expect((restored.devices.get(f.s.id) as IpDevice).dhcpRemotePools.get('lan10')!.leases.size).toBe(0);
 }finally{disposeNetwork(restored);}
}finally{disposeNetwork(f.net);}});
it.each(['disabled','no pool','no return route','no address','disconnected','unreachable','invalid target'])('does not allocate artificially: %s',mode=>{const f=fixture();try{
 if(mode==='disabled')f.r.dhcpRelays.get('eth0')!.enabled=false;if(mode==='no pool')f.s.dhcpRemotePools.clear();if(mode==='no return route')f.s.staticRoutes=[];if(mode==='no address')f.r.interfaces[0].ip=null;if(mode==='disconnected')f.r.interfaces[1].up=false;if(mode==='unreachable')f.r.dhcpRelays.get('eth0')!.server=ip('203.0.113.10');if(mode==='invalid target')f.r.dhcpRelays.get('eth0')!.server=0;
 expect(f.run(f.pc,'dhclient eth0')).toContain('No DHCPOFFERS');expect(f.pc.interfaces[0].ip).toBeNull();expect([...f.s.dhcpRemotePools.values()].every(c=>!c.leases.size)).toBe(true);
}finally{disposeNetwork(f.net);}});
it('isolates two client subnets and keeps server HTTP/DNS independent',()=>{const f=fixture();try{
 const pc2=createDevice(f.net,'host') as IpDevice;f.net.connect(pc2.id,f.r.id,{aIface:'eth0',bIface:'eth2'});f.r.interfaces[2].ip=parseCidr('192.168.30.1/24');f.r.dhcpRelays.set('eth2',{enabled:true,server:ip('192.168.20.10')});
 f.s.dhcpRemotePools.set('lan30',{...f.s.dhcpRemotePools.get('lan10')!,network:ip('192.168.30.0'),rangeStart:ip('192.168.30.100'),rangeEnd:ip('192.168.30.150'),router:ip('192.168.30.1'),leases:new Map()});
 f.s.httpServer={enabled:true,port:80,body:'relay-test'};f.s.dnsServer={enabled:true,records:new Map([['test.local',ip('192.168.20.10')]])};
 new Shell(f.pc).exec('dhclient eth0',{write:()=>{}},()=>{});expect(f.run(pc2,'dhclient eth0')).toContain('bound to 192.168.30.100');expect(f.pc.interfaces[0].ip?.addr).toBe(ip('192.168.10.100'));
 expect(f.run(f.pc,'curl http://192.168.20.10/')).toContain('relay-test');expect(f.run(pc2,'dig test.local')).toContain('192.168.20.10');
 const before=dhcpConfiguration(f.r);applyDhcpConfiguration(f.r,{legacy:null,pools:{}});expect(f.r.dhcpRelays.size).toBe(0);applyDhcpConfiguration(f.r,before);expect(dhcpConfiguration(f.r)).toEqual(before);
}finally{disposeNetwork(f.net);}});
it('reserves distinct addresses for simultaneous clients in one LAN',()=>{const f=fixture();try{
 const sw=createDevice(f.net,'switch'),pc2=createDevice(f.net,'host') as IpDevice;f.net.disconnect(f.pc.interfaces[0].link!.id);f.net.connect(f.pc.id,sw.id);f.net.connect(pc2.id,sw.id);f.net.connect(f.r.id,sw.id,{aIface:'eth0'});
 new Shell(f.pc).exec('dhclient eth0',{write:()=>{}},()=>{});f.run(pc2,'dhclient eth0');expect(new Set([f.pc.interfaces[0].ip?.addr,pc2.interfaces[0].ip?.addr])).toEqual(new Set([ip('192.168.10.100'),ip('192.168.10.101')]));expect(f.s.dhcpRemotePools.get('lan10')!.leases.size).toBe(2);
}finally{disposeNetwork(f.net);}});
it('drops excessive DHCP hops without relaying them',()=>{const f=fixture();try{
 f.pc.sendDhcpClient(f.pc.interfaces[0],{kind:'dhcp',op:'discover',clientMac:f.pc.interfaces[0].mac,xid:123,hops:17});f.net.scheduler.advanceTo(20000);expect(f.packets.filter(p=>p.sp===67)).toEqual([]);
}finally{disposeNetwork(f.net);}});
