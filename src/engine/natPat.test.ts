import { expect,it } from 'vitest';
import { ConnTrack } from './conntrack';
import { Network } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import { parseCidr,parseIp } from './ip';
import { disposeNetwork } from './networkLifecycle';
import { Shell } from '../commands/shell';
import { serializeNetwork,restoreNetwork } from './serialize';
import type { Ipv4Packet } from './types';
import type { IcmpEvent } from './ipdevice';
const ip=(s:string)=>parseIp(s)!;
function fixture(nat=true){
 const net=new Network(),a=createDevice(net,'host') as IpDevice,b=createDevice(net,'host') as IpDevice,r=createDevice(net,'router') as IpDevice,isp=createDevice(net,'router') as IpDevice,s=createDevice(net,'server') as IpDevice,sw=createDevice(net,'switch');
 net.connect(a.id,sw.id);net.connect(b.id,sw.id);net.connect(r.id,sw.id,{aIface:'eth0'});net.connect(r.id,isp.id,{aIface:'eth1',bIface:'eth0'});net.connect(isp.id,s.id,{aIface:'eth1',bIface:'eth0'});
 for(const [d,name,cidr]of [[a,'eth0','192.168.10.10/24'],[b,'eth0','192.168.10.20/24'],[r,'eth0','192.168.10.1/24'],[r,'eth1','192.0.2.2/30'],[isp,'eth0','192.0.2.1/30'],[isp,'eth1','198.51.100.1/24'],[s,'eth0','198.51.100.10/24']] as const)d.getInterface(name)!.ip=parseCidr(cidr);
 for(const d of [a,b])d.addRoute(0,0,ip('192.168.10.1'));r.addRoute(0,0,ip('192.0.2.1'));s.addRoute(0,0,ip('198.51.100.1'));
 if(nat){r.fw.ensureIptablesTable('nat');r.fw.addNatRule('postrouting',{oif:'eth1'},{type:'masquerade'});}
 s.httpServer={enabled:true,port:80,body:'PAT OK'};s.dnsServer={enabled:true,records:new Map([['pat.test',ip('198.51.100.10')]])};
 const run=(d:IpDevice,line:string)=>{let out='';new Shell(d).exec(line,{write:t=>{out+=t;}},()=>{});return()=>out;};
 return {net,a,b,r,isp,s,run};
}
it.each(['tcp','udp','icmp'] as const)('routes concurrent %s replies to the correct LAN clients with equal ports/IDs',proto=>{
 const f=fixture();try{
 let one:()=>string,two:()=>string;
 if(proto==='tcp'){one=f.run(f.a,'curl http://198.51.100.10/');two=f.run(f.b,'curl http://198.51.100.10/');}
 else if(proto==='udp'){f.a.nameserver=f.b.nameserver=ip('198.51.100.10');one=f.run(f.a,'dig pat.test');two=f.run(f.b,'dig pat.test');}
 else {one=f.run(f.a,'ping -c 2 198.51.100.10');two=f.run(f.b,'ping -c 2 198.51.100.10');}
 f.net.scheduler.advanceTo(20000);for(const out of [one(),two()])expect(out).toContain(proto==='tcp'?'PAT OK':proto==='udp'?'198.51.100.10':'2 received');
 const entries=f.r.ct.list(f.net.now).filter(e=>e.orig.proto===proto&&e.trans.srcIp===ip('192.0.2.2'));
 expect(entries).toHaveLength(2);expect(entries[0].orig.srcPort).toBe(entries[1].orig.srcPort);expect(entries[0].trans.srcPort).not.toBe(entries[1].trans.srcPort);
 if(proto==='icmp')expect(entries[0].trans.srcPort).toBe(entries[0].trans.dstPort);
 }finally{disposeNetwork(f.net);}
});
it('fails without NAT and succeeds without NAT when return routing is explicitly provided',()=>{const f=fixture(false);try{
 const failed=f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(10000);expect(failed()).toContain('0 received');
 f.isp.addRoute(ip('192.168.10.0'),24,ip('192.0.2.2'));const success=f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(20000);expect(success()).toContain('1 received');
 }finally{disposeNetwork(f.net);}});
it('keeps stable mappings, separates protocols/WANs, refuses exhaustion and releases expired or removed entries',()=>{
 const c=new ConnTrack({min:1024,max:1024});const original={proto:'udp' as const,srcIp:1,srcPort:1024,dstIp:9,dstPort:53};const trans={...original,srcIp:2};
 expect(c.confirm(original,trans,0)).toEqual(trans);const second={...original,srcIp:3};expect(c.confirm(second,trans,1)).toBeNull();expect(c.list(1)).toHaveLength(1);
 expect(c.confirm(original,{...trans,srcPort:9999},2)).toEqual(trans);expect(c.confirm({...original,proto:'tcp'},{...trans,proto:'tcp'},3)).not.toBeNull();expect(c.confirm({...original,srcIp:4},{...trans,srcIp:5},3)).not.toBeNull();
 expect(c.list(120004)).toEqual([]);expect(c.confirm(second,trans,120005)).toEqual(trans);c.remove(c.list(120005)[0]);expect(c.confirm(original,trans,120006)).toEqual(trans);
});
it.each(['tcp','udp','icmp'] as const)('reverses translated %s ICMP error quotes and destination without consuming the mapping',proto=>{
 const c=new ConnTrack(),o={proto,srcIp:1,srcPort:40000,dstIp:9,dstPort:proto==='icmp'?40000:80},translated={...o,srcIp:2,srcPort:1024,dstPort:proto==='icmp'?1024:80};c.confirm(o,translated,0);
 const original={src:2,dst:9,proto,icmpId:proto==='icmp'?1024:null,icmpSeq:null,srcPort:proto==='icmp'?null:1024,dstPort:proto==='icmp'?null:80};
 for(const type of ['time-exceeded','dest-unreachable'] as const){const pkt:Ipv4Packet={kind:'ipv4',src:8,dst:2,ttl:64,l4:{kind:'icmp',msg:type==='time-exceeded'?{type,original}:{type,code:'host',original}}};const result=c.process(pkt,1);expect(result.state).toBe('related');expect(result.pkt.dst).toBe(1);if(result.pkt.l4.kind==='icmp'&&'original' in result.pkt.l4.msg)expect(result.pkt.l4.msg.original).toMatchObject({src:1,dst:9,...(proto==='icmp'?{icmpId:40000}:{srcPort:40000,dstPort:80})});expect(c.list(1)).toHaveLength(1);}
});
it('preserves NAT rules across Save/Load but not transient mappings',()=>{const f=fixture();try{f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(10000);const restored=restoreNetwork(serializeNetwork(f.net,{}));try{const r=restored.devices.get(f.r.id) as IpDevice;expect(r.ct.list(0)).toEqual([]);expect(r.fw.nat.postrouting.rules).toEqual(f.r.fw.nat.postrouting.rules);}finally{disposeNetwork(restored);}}finally{disposeNetwork(f.net);}});
it('returns real time-exceeded and unreachable errors to both clients with colliding IDs',()=>{const f=fixture();try{
 const received:IcmpEvent[][]=[[],[]];for(const [index,d] of [f.a,f.b].entries()){d.onIcmp(77,event=>received[index].push(event));d.sendIcmp(ip('198.51.100.10'),{type:'echo-request',id:77,seq:1},{ttl:2});}
 f.net.scheduler.advanceTo(10000);for(const events of received)expect(events.some(e=>e.type==='time-exceeded')).toBe(true);
 for(const d of [f.a,f.b])d.sendEcho(ip('203.0.113.10'),77,2);f.net.scheduler.advanceTo(20000);for(const events of received)expect(events.some(e=>e.type==='unreachable')).toBe(true);
}finally{disposeNetwork(f.net);}});
it('invalidates masquerade after WAN address changes and preserves established translations when NAT rules change',()=>{const f=fixture();try{
 f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(10000);const entry=f.r.ct.list(f.net.now).find(e=>e.orig.srcIp===ip('192.168.10.10'))!;expect(entry.masquerade).toEqual({iface:'eth1',address:ip('192.0.2.2')});
 f.r.fw.nat.postrouting.rules=[];const preserved=f.r.ct.process({kind:'ipv4',src:entry.orig.srcIp,dst:entry.orig.dstIp,ttl:64,l4:{kind:'icmp',msg:{type:'echo-request',id:entry.orig.srcPort,seq:2}}},f.net.now);expect(preserved.pkt.src).toBe(ip('192.0.2.2'));
 f.r.interfaces[1].ip=null;f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(20000);expect(f.r.ct.list(f.net.now)).not.toContain(entry);
}finally{disposeNetwork(f.net);}});
it('does not bypass FORWARD policy or reserve translations for blocked packets',()=>{const f=fixture();try{
 f.r.fw.ensureIptablesTable('filter');f.r.fw.filter.forward.policy='drop';const out=f.run(f.a,'curl http://198.51.100.10/');f.net.scheduler.advanceTo(20000);expect(out()).not.toContain('PAT OK');expect(f.r.ct.list(f.net.now)).toEqual([]);
}finally{disposeNetwork(f.net);}});
it('releases mappings using virtual Scheduler time',()=>{const f=fixture();try{
 f.run(f.a,'ping -c 1 198.51.100.10');f.net.scheduler.advanceTo(10000);expect(f.r.ct.list(f.net.now).length).toBeGreaterThan(0);f.net.scheduler.advanceTo(140000);expect(f.r.ct.list(f.net.now)).toEqual([]);
}finally{disposeNetwork(f.net);}});
it('never overwrites a plain/DNAT reverse association and translates a DNAT error back to its public destination',()=>{
 const c=new ConnTrack(),orig={proto:'tcp' as const,srcIp:1,srcPort:40000,dstIp:2,dstPort:80},trans={...orig,dstIp:3,dstPort:8080};expect(c.confirm(orig,trans,0)).toEqual(trans);
 expect(c.confirm({...orig,dstIp:4},trans,1)).toBeNull();const reply=c.process({kind:'ipv4',src:3,dst:1,ttl:64,l4:{kind:'tcp',srcPort:8080,dstPort:40000,syn:true,ack:true,rst:false,fin:false}},2);expect(reply.pkt.src).toBe(2);if(reply.pkt.l4.kind==='tcp')expect(reply.pkt.l4.srcPort).toBe(80);
 const result=c.process({kind:'ipv4',src:3,dst:1,ttl:64,l4:{kind:'icmp',msg:{type:'dest-unreachable',code:'port',original:{src:1,dst:3,proto:'tcp',srcPort:40000,dstPort:8080,icmpId:null,icmpSeq:null}}}},3);expect(result.pkt.src).toBe(2);expect(result.state).toBe('related');
});
it('bounds ports and handles complete ICMP identifier exhaustion without overwriting live entries',()=>{
 const c=new ConnTrack();for(let id=0;id<=65535;id++){const o={proto:'icmp' as const,srcIp:1,srcPort:id,dstIp:9,dstPort:id};expect(c.confirm(o,{...o,srcIp:2},0)).not.toBeNull();}
 const extra={proto:'icmp' as const,srcIp:3,srcPort:1,dstIp:9,dstPort:1};expect(c.confirm(extra,{...extra,srcIp:2},1)).toBeNull();expect(c.list(1)).toHaveLength(65536);
 expect(c.confirm(extra,{...extra,srcIp:2},120001)).not.toBeNull();
 const udp={proto:'udp' as const,srcIp:4,srcPort:65536,dstIp:9,dstPort:53};expect(c.confirm(udp,{...udp,srcIp:2},0)).toBeNull();
});
it('supports explicit SNAT and stateful return filtering with simultaneous clients',()=>{const f=fixture();try{
 f.r.fw.nat.postrouting.rules[0].action={type:'snat',addr:ip('192.0.2.2')};
 f.r.fw.ensureIptablesTable('filter');f.r.fw.filter.forward.policy='drop';
 f.r.fw.addFilterRule('forward',{iif:'eth0',oif:'eth1',ctStates:['new','established']},'accept');
 f.r.fw.addFilterRule('forward',{iif:'eth1',oif:'eth0',ctStates:['established','related']},'accept');
 const a=f.run(f.a,'curl http://198.51.100.10/'),b=f.run(f.b,'curl http://198.51.100.10/');f.net.scheduler.advanceTo(10000);expect(a()).toContain('PAT OK');expect(b()).toContain('PAT OK');
 expect(f.r.ct.list(f.net.now).filter(e=>e.orig.proto==='tcp')).toHaveLength(2);
}finally{disposeNetwork(f.net);}});
