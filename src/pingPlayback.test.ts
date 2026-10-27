import { expect, it } from 'vitest';
import { pingPlaybackFixture } from './testing/pingPlaybackFixture';
import { observeGuidedPacket, observeGuidedPingProgress, emptyGuidedPacket, advanceGuidedPacket, updateGuidedObservation, visibleGuidedHops } from './guidedPacket';
import { packetAnimationDuration, isPingAnimationActive } from './packetAnimation';
import { IpDevice } from './engine/ipdevice';
import { Shell } from './commands/shell';
import { PacketCapture } from './packetCapture';

it.each([.5,1,2].flatMap(speed=>(['linux','windows'] as const).map(os=>({speed,os}))))('bounds 120 real logical $os ping attempts at $speed× and drains only the current attempt on Ctrl+C', ({speed,os})=>{
  const {net,hosts}=pingPlaybackFixture(),source=hosts[0],capture=new PacketCapture(()=>{});
  source.os=os;
  let state=emptyGuidedPacket(),output='';const attemptTimes:number[]=[];
  net.onPingProgress=event=>{if(event.type==='attempt')attemptTimes.push(net.now);state=observeGuidedPingProgress(state,event,net.now);};
  net.onWireTransfer=(t,context,trace)=>{
    const p=context.frame.payload,d=net.devices.get(t.toDeviceId);
    state=observeGuidedPacket(state,t,context,trace,p.kind==='ipv4'&&d instanceof IpDevice&&d.hasIp(p.dst));
    capture.observe(t,context);
  };
  capture.start();
  const running=new Shell(source).exec(os==='linux'?'ping 10.0.0.30':'ping -t 10.0.0.30',{write:s=>output+=s},()=>{})!;
  for(let t=100;t<=120500;t+=100){
    net.scheduler.advanceTo(t);state=advanceGuidedPacket(updateGuidedObservation(state,net.now),100,packetAnimationDuration(speed));
    expect(new Set(state.playback.hops.map(h=>h.ping)).size).toBeLessThanOrEqual(2);
    expect(state.playback.hops.length).toBeLessThanOrEqual(32);
    expect(state.observation.attempts.length).toBeLessThanOrEqual(5);expect(state.observation.observed.length).toBeLessThanOrEqual(256);
    expect(new Set(visibleGuidedHops(state.playback).map(h=>h.ping)).size).toBeLessThanOrEqual(1);
  }
  if(os==='linux')expect(output).toContain('icmp_seq=120');else expect(output.match(/Reply from/g)?.length).toBeGreaterThanOrEqual(120);
  const active=state.playback.hops[state.playback.index]?.ping;
  running.cancel();
  expect(state.observation.cancelled).toBe(true);
  expect(state.playback.hops.every(h=>h.ping===active)).toBe(true);
  for(let i=0;i<100;i++){
    net.scheduler.advanceTo(net.now+100);state=advanceGuidedPacket(updateGuidedObservation(state,net.now),100,packetAnimationDuration(speed));
    expect(state.playback.hops.every(h=>h.ping===active)).toBe(true);
  }
  expect(isPingAnimationActive(state)).toBe(false);
  expect(state.playback.hops.some(h=>h.direction==='reply'&&!h.arp)).toBe(true);
  capture.stop();
  const requests=capture.state.records.filter(r=>r.fromDeviceId===source.id&&r.frame.payload.kind==='ipv4'&&
    r.frame.payload.l4.kind==='icmp'&&r.frame.payload.l4.msg.type==='echo-request');
  expect(requests.length).toBe(121); // Visual omissions never cancel real sends.
  expect(attemptTimes.slice(1).every((t,i)=>t-attemptTimes[i]===1000)).toBe(true);
  expect(requests.slice(2).every((r,i)=>r.start-requests[i+1].start===1000)).toBe(true);
});

it.each(['request','reply'] as const)('Ctrl+C during visual %s lets only that real attempt and its eventual reply finish', direction=>{
  const {net,hosts}=pingPlaybackFixture();hosts[0].sendEcho(0x0a00001e,99,1);net.scheduler.advanceTo(1000);
  let state=emptyGuidedPacket();
  net.onPingProgress=e=>{state=observeGuidedPingProgress(state,e,net.now);};
  net.onWireTransfer=(t,c,trace)=>{const p=c.frame.payload,d=net.devices.get(t.toDeviceId);state=observeGuidedPacket(state,t,c,trace,p.kind==='ipv4'&&d instanceof IpDevice&&d.hasIp(p.dst));};
  const running=new Shell(hosts[0]).exec('ping 10.0.0.30',{write:()=>{}},()=>{})!;
  for(let i=0;i<(direction==='request'?1:5);i++){
    net.scheduler.advanceTo(net.now+100);state=advanceGuidedPacket(updateGuidedObservation(state,net.now),100,200);
  }
  expect(visibleGuidedHops(state.playback)[0].direction).toBe(direction);
  running.cancel();
  const phases=new Set<string>();
  for(let i=0;i<30;i++){
    net.scheduler.advanceTo(net.now+100);state=advanceGuidedPacket(updateGuidedObservation(state,net.now),100,200);
    for(const h of visibleGuidedHops(state.playback)){expect(h.ping).toBe(1);phases.add(h.direction);}
  }
  expect(phases.has('reply')).toBe(true);expect(isPingAnimationActive(state)).toBe(false);
});

it('uses real same-VLAN flooding, parallel visual egress, exact reply causality and no excluded-port animation',()=>{
  const {net,hosts}=pingPlaybackFixture();let state=emptyGuidedPacket();
  net.onPingProgress=e=>{state=observeGuidedPingProgress(state,e,net.now);};
  net.onWireTransfer=(t,c,trace)=>{state=observeGuidedPacket(state,t,c,trace,false);};
  new Shell(hosts[0]).exec('ping -c 1 10.0.0.30',{write:()=>{}},()=>{});
  net.scheduler.advanceTo(700);
  const requests=state.observation.observed.filter(h=>h.arp==='request');
  expect(requests.filter(h=>h.fromDeviceId==='sw').map(h=>h.toDeviceId).sort()).toEqual(['pc2','pc3','pc4','router']);
  expect(requests.some(h=>h.toDeviceId==='pc5')).toBe(false);
  state=advanceGuidedPacket(state,300,200);
  expect(visibleGuidedHops(state.playback).map(h=>h.toDeviceId).sort()).toEqual(['pc2','pc3','pc4','router']);
  const reply=state.observation.observed.find(h=>h.arp==='reply'&&h.fromDeviceId==='pc3')!;
  expect(state.observation.observed.filter(h=>h.arp==='reply'&&h.fromDeviceId!=='sw').map(h=>h.fromDeviceId)).toEqual(['pc3']);
  expect(reply.visualStep).toBeGreaterThan(Math.max(...requests.map(h=>h.visualStep!)));
});

it('accepts a late real reply of the cancelled current attempt on high-latency links without starting a new cycle',()=>{
  const {net,hosts}=pingPlaybackFixture();hosts[0].sendEcho(0x0a00001e,99,1);net.scheduler.advanceTo(1000);
  for(const link of net.links.values())link.latency=1000;
  let state=emptyGuidedPacket();net.onPingProgress=e=>{state=observeGuidedPingProgress(state,e,net.now);};
  net.onWireTransfer=(t,c,tr)=>{state=observeGuidedPacket(state,t,c,tr,false);};
  const running=new Shell(hosts[0]).exec('ping 10.0.0.30',{write:()=>{}},()=>{})!;
  state=advanceGuidedPacket(state,100,200);running.cancel();
  state=advanceGuidedPacket(state,500,200);
  expect(state.playback.progress).toBe(1);expect(visibleGuidedHops(state.playback)).toEqual([]);
  for(let i=0;i<50;i++){net.scheduler.advanceTo(net.now+100);state=advanceGuidedPacket(updateGuidedObservation(state,net.now),100,200);}
  expect(isPingAnimationActive(state)).toBe(false);
  expect(state.playback.hops.some(h=>h.direction==='reply')).toBe(true);
});
