import {expect,it} from 'vitest';
import {Network} from '../engine/network';
import {createDevice} from '../engine/factory';
import {Host,RouterDevice,ServerDevice} from '../engine/ipdevice';
import {parseCidr,parseIp} from '../engine/ip';
import {serializeNetwork} from '../engine/serialize';
import {PacketCapture} from '../packetCapture';
import {requestPage,simulatedUrl,type BrowserResult} from './request';
import {browserMessages} from './messages';

const ip=(s:string)=>parseIp(s)!;
function lab(routed=false) {
  const net=new Network(),pc=createDevice(net,'host') as Host,server=createDevice(net,'server') as ServerDevice;
  let router:RouterDevice|undefined;
  pc.interfaces[0].ip=parseCidr('192.168.1.10/24');
  server.interfaces[0].ip=parseCidr(routed?'192.168.2.10/24':'192.168.1.20/24');
  if(routed){
    router=createDevice(net,'router') as RouterDevice;
    net.connect(pc.id,router.id);net.connect(router.id,server.id);
    router.interfaces[0].ip=parseCidr('192.168.1.1/24');router.interfaces[1].ip=parseCidr('192.168.2.1/24');
    pc.addRoute(0,0,ip('192.168.1.1'));server.addRoute(0,0,ip('192.168.2.1'));
  }else net.connect(pc.id,server.id);
  const address=routed?'192.168.2.10':'192.168.1.20';
  server.httpServer={enabled:true,port:80,body:'<h1>Serviceportal</h1><p>Simuliert</p><a href="/index.html">Start</a>'};
  server.dnsServer={enabled:true,records:new Map([['server.lab',ip(address)]])};pc.nameserver=ip(address);
  const capture=new PacketCapture(()=>{});capture.start();
  net.onWireTransfer=(t,c)=>capture.observe(t,c);
  const request=(url='http://'+address,options={})=>{
    let result:BrowserResult|undefined;requestPage(pc,simulatedUrl(url)!,r=>{result=r;},options);
    net.scheduler.advanceTo(net.now+7000);capture.stop();return result;
  };
  return {net,pc,server,router,address,capture,request};
}
it.each([false,true])('performs HTTP over real simulated ARP/TCP%s and preserves configuration',routed=>{
  const l=lab(routed),before=serializeNetwork(l.net,{}),result=l.request();
  expect(result).toMatchObject({kind:'http',status:200,body:l.server.httpServer!.body});
  expect(serializeNetwork(l.net,{})).toEqual(before);
  const records=l.capture.state.records;
  expect(records.some(p=>p.frame.payload.kind==='arp')).toBe(true);
  expect(records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.syn)).toBe(true);
  expect(records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.app?.kind==='http-request')).toBe(true);
  if(routed)expect(records.some(p=>p.fromDeviceId===l.router!.id)).toBe(true);
});
it('resolves hostnames through the configured simulated DNS server',()=>{
  const l=lab(true);expect(l.request('http://server.lab/index.html')).toMatchObject({kind:'http',status:200});
  expect(l.capture.state.records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='udp'&&p.frame.payload.l4.app?.kind==='dns-query')).toBe(true);
});
it('reports DNS failure without pretending an HTTP response exists',()=>{
  const l=lab();expect(l.request('http://missing.lab')).toMatchObject({kind:'error',code:'dns',dnsFailure:'not-found'});
  l.pc.nameserver=null;expect(l.request('http://server.lab')).toMatchObject({kind:'error',code:'dns',dnsFailure:'not-configured'});
});
it('retains structured DNS refusal/timeout without interpreting console text',()=>{
  const l=lab();l.server.dnsServer!.enabled=false;
  expect(l.request('http://server.lab')).toMatchObject({kind:'error',code:'dns',dnsFailure:'refused'});
  l.server.fw.declareFilter('input','input');l.server.fw.addFilterRule('input',{proto:'udp',dport:{from:53,to:53}},'drop');
  expect(l.request('http://server.lab')).toMatchObject({kind:'error',code:'dns',dnsFailure:'timeout'});
});
it('records successful DNS as evidence when the subsequent HTTP connection is refused',()=>{
  const l=lab();l.server.httpServer!.enabled=false;
  expect(l.request('http://server.lab')).toMatchObject({kind:'error',code:'refused',resolution:{host:'server.lab',address:l.address,viaDns:true}});
  expect(l.request()).toMatchObject({kind:'error',code:'refused',resolution:{host:l.address,address:l.address,viaDns:false}});
});
it('distinguishes an absent route from a wrong next hop that never responds',()=>{
  const l=lab();expect(l.request('http://192.168.2.10')).toMatchObject({kind:'error',code:'unreachable'});
  l.pc.addRoute(0,0,ip('192.168.1.99'));
  const result=l.request('http://192.168.2.10');
  expect(result).toMatchObject({kind:'error',code:'unreachable'});
});
it('respects forwarding firewall DROP/REJECT without diagnosing a DROP as a disabled service',()=>{
  for(const verdict of ['drop','reject'] as const){
    const l=lab(true);l.router!.fw.declareFilter('forward','forward');l.router!.fw.addFilterRule('forward',{proto:'tcp',dport:{from:80,to:80}},verdict);
    expect(l.request()).toMatchObject({kind:'error',code:verdict==='drop'?'timeout':'refused'});
    expect(l.router!.fwLog.some(e=>e.verdict===verdict)).toBe(true);
  }
});
it('distinguishes service off and generic open TCP without an HTTP response',()=>{
  const l=lab();l.server.httpServer!.enabled=false;
  expect(l.request()).toMatchObject({kind:'error',code:'refused'});
  l.server.services.tcp.add(80);expect(l.request()).toMatchObject({kind:'error',code:'empty'});
});
it('receives a real 404 frame; root and index.html use the existing configured page',()=>{
  const l=lab();expect(l.request('http://'+l.address+'/missing.html')).toMatchObject({kind:'http',status:404,reason:'Not Found'});
  expect(l.capture.state.records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.app?.kind==='http-response'&&p.frame.payload.l4.app.status===404)).toBe(true);
  expect(l.request('http://'+l.address+'/index.html?test=1')).toMatchObject({kind:'http',status:200});
});
it('uses current interfaces, addresses, link and service state on each new request',()=>{
  const l=lab();expect(l.request()).toMatchObject({kind:'http',status:200});
  l.pc.interfaces[0].up=false;expect(l.request()).toMatchObject({kind:'error',code:'unreachable'});
  l.pc.interfaces[0].up=true;l.server.httpServer!.body='<h1>Changed</h1>';
  expect(l.request()).toMatchObject({kind:'http',body:'<h1>Changed</h1>'});
  const id=l.pc.interfaces[0].link!.id;l.net.disconnect(id);expect(l.request()).toMatchObject({kind:'error',code:'unreachable'});
  l.net.connect(l.pc.id,l.server.id);expect(l.request()).toMatchObject({kind:'http',status:200});
});
it('cancels HTTP before data is sent and allows another request without stale callbacks',()=>{
  const l=lab();let calls=0;
  const handle=requestPage(l.pc,simulatedUrl('http://'+l.address)!,()=>calls++);handle.cancel();
  l.net.scheduler.advanceTo(l.net.now+7000);expect(calls).toBe(0);
  expect(l.request()).toMatchObject({kind:'http',status:200});
});
it('cancels during DNS resolution without starting HTTP afterward',()=>{
  const l=lab();let calls=0;
  const handle=requestPage(l.pc,simulatedUrl('http://server.lab')!,()=>calls++);handle.cancel();
  l.net.scheduler.advanceTo(7000);l.capture.stop();expect(calls).toBe(0);
  expect(l.capture.state.records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.app?.kind==='http-request')).toBe(false);
});
it('rejects HTTPS by default and tests only TCP 443 when explicitly requested, without HTTP',()=>{
  const l=lab();expect(l.request('https://'+l.address)).toMatchObject({kind:'error',code:'https'});
  l.capture.start();l.server.services.tcp.add(443);
  expect(l.request('https://'+l.address,{tcpOnly:true})).toMatchObject({kind:'tcp',port:443});
  expect(l.capture.state.records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.app?.kind==='http-request')).toBe(false);
});
it('parses simulated destinations and links, rejecting active schemes and credentials',()=>{
  expect(simulatedUrl('192.168.1.10/index.html')).toMatchObject({host:'192.168.1.10',port:80,path:'/index.html'});
  expect(simulatedUrl('http://server.lab:8080/index.html')).toMatchObject({host:'server.lab',port:8080});
  expect(simulatedUrl('/index.html','http://server.lab/')).toMatchObject({address:'http://server.lab/index.html'});
  for(const value of ['javascript:alert(1)','data:text/html,hi','file:///abc','http://user:pass@server.lab','http://server.lab:0','http://server.lab:99999'])expect(simulatedUrl(value)).toBeNull();
});
it('keeps all browser messages complete in the three existing languages',()=>{
  for(const messages of Object.values(browserMessages))expect(Object.keys(messages).sort()).toEqual(Object.keys(browserMessages.en).sort());
});
