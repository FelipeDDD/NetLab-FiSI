import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { Host, IpDevice } from './engine/ipdevice';
import { ApDevice, SwitchDevice } from './engine/switch';
import { parseCidr, parseIp } from './engine/ip';
import { disposeNetwork } from './engine/networkLifecycle';
import { captureDeviceClipboard, prepareDevicePaste } from './deviceClipboard';
import { restoreDeletedDevices } from './topologyEdits';
import { serializeNetwork } from './engine/serialize';
import { EXERCISE_DRAFTS } from './exercises/drafts';
import { betaChecks } from './exercises/beta';
import { restoreNetwork } from './engine/serialize';
import { runChecks, type CheckResult } from './labs/checker';

it('copies config, internal cables and appearance, resets address ownership, and never captures runtime or external links',()=>{
  const net=new Network();
  try {
    const host=createDevice(net,'host',{os:'windows'}) as Host, sw=createDevice(net,'switch',{switchPorts:24}) as SwitchDevice, server=createDevice(net,'server') as IpDevice;
    const internal=net.connect(host.id,sw.id,{bIface:'eth8'});net.connect(sw.id,server.id);
    host.interfaces[0].ip=parseCidr('10.0.0.8/24');host.nameserver=parseIp('10.0.0.1');sw.vlans.set('eth8',20);
    const nodes=[{id:host.id,position:{x:10,y:30},data:{kind:host.kind}},{id:sw.id,position:{x:270,y:90},data:{kind:sw.kind}}];
    const source=captureDeviceClipboard(net,nodes,nodes.map(n=>n.id),{[host.id]:'#ff0088'},{[internal.id]:{mode:'manual',color:'#a383dd'}})!;
    expect(source.links).toHaveLength(1);
    const before=JSON.stringify(source), batch=prepareDevicePaste(net,source,{x:600,y:100},3);
    expect(JSON.stringify(source)).toBe(before);expect(restoreDeletedDevices(net,batch.devices,batch.links)).toBe(true);
    const [a,b]=batch.devices.map(d=>net.devices.get(d.saved.id)!);
    expect(a.id).not.toBe(host.id);expect(a.name).not.toBe(host.name);expect((a as Host).os).toBe('windows');
    expect(a.interfaces[0].ip).toBeNull();expect(a.interfaces[0].dhcpLease).toBeNull();expect((a as Host).staticRoutes).toEqual([]);expect((a as Host).manualNameserver).toBeNull();
    expect(b.interfaces).toHaveLength(24);expect((b as SwitchDevice).vlanOf('eth8')).toBe(20);
    expect(a.interfaces[0].link?.other(a.interfaces[0]).name).toBe('eth8');
    expect(batch.colors[a.id]).toBe('#ff0088');expect(batch.cableColors[batch.links[0].id]).toEqual({mode:'manual',color:'#a383dd'});
    const macs=[...net.devices.values()].flatMap(d=>d.interfaces.map(i=>i.mac));expect(new Set(macs).size).toBe(macs.length);
    expect(host.interfaces[0].ip).toEqual(parseCidr('10.0.0.8/24'));
  } finally {disposeNetwork(net);}
});
it('disables cloned DHCP pools, keeps DHCP client mode, and omits leases and routing runtime',()=>{
  const net=new Network();try{
    const r=createDevice(net,'router') as IpDevice;
    r.interfaces[0].configureIpv4({mode:'dhcp',ip:parseCidr('10.0.0.2/24'),gateway:parseIp('10.0.0.1'),dns:parseIp('10.0.0.1')});
    r.dhcpPools.set('eth1',{enabled:true,rangeStart:parseIp('10.1.0.10')!,rangeEnd:parseIp('10.1.0.20')!,router:null,dns:null,leases:new Map([['a',12]])});
    const source=captureDeviceClipboard(net,[{id:r.id,position:{x:0,y:0},data:{kind:r.kind}}],[r.id],{},{})!;
    const batch=prepareDevicePaste(net,source,{x:300,y:0},1);expect(restoreDeletedDevices(net,batch.devices,[])).toBe(true);
    const clone=net.devices.get(batch.devices[0].saved.id) as IpDevice;
    expect(clone.interfaces[0].ipv4Mode).toBe('dhcp');expect(clone.interfaces[0].ip).toBeNull();expect(clone.dhcpPools.get('eth1')?.enabled).toBe(false);expect(clone.dhcpPools.get('eth1')?.leases.size).toBe(0);
    expect(r.dhcpPools.get('eth1')?.enabled).toBe(true);
  }finally{disposeNetwork(net);}
});
it('remaps both WLAN association identities and AP virtual ports without copying outside clients',()=>{
  const net=new Network();try{
    const ap=createDevice(net,'ap') as ApDevice, phone=createDevice(net,'smartphone'), outside=createDevice(net,'smartphone');
    net.associate(phone.id,ap.id);net.associate(outside.id,ap.id);
    const nodes=[ap,phone].map((d,i)=>({id:d.id,position:{x:i*200,y:0},data:{kind:d.kind}}));
    const source=captureDeviceClipboard(net,nodes,nodes.map(n=>n.id),{},{})!;
    const batch=prepareDevicePaste(net,source,{x:500,y:0},3);
    expect(restoreDeletedDevices(net,batch.devices,batch.links)).toBe(true);
    const clone=net.devices.get(batch.devices[0].saved.id)!;
    expect(clone.interfaces.filter(i=>i.medium==='wireless')).toHaveLength(1);
    expect(batch.links[0].b[1]).toBe(`wifi-${batch.links[0].a[0]}`);
    expect(batch.links[0].apMac).not.toBe(source.links[0].apMac);
    const saved=serializeNetwork(net,{});expect(saved.lab).toBeUndefined();expect(saved.devices).toHaveLength(5);
  }finally{disposeNetwork(net);}
});

it('never reuses source IDs or MACs when pasting into another empty plan',()=>{
  const sourceNet=new Network(),target=new Network();try{
    const d=createDevice(sourceNet,'host');
    const source=captureDeviceClipboard(sourceNet,[{id:d.id,position:{x:0,y:0},data:{kind:d.kind}}],[d.id],{},{})!;
    const batch=prepareDevicePaste(target,source,{x:0,y:0},0);
    expect(batch.devices[0].saved.id).not.toBe(d.id);expect(batch.devices[0].macs.eth0).not.toBe(d.interfaces[0].mac);
  }finally{disposeNetwork(sourceNet);disposeNetwork(target);}
});
it.each(EXERCISE_DRAFTS.filter(d=>Object.hasOwn(betaChecks,d.id)))('$id copies cannot substitute the graded device identity',exercise=>{
  const net=restoreNetwork(structuredClone(exercise.review.reference.topology));try{
    const original=net.devices.values().next().value!;
    const source=captureDeviceClipboard(net,[{id:original.id,position:{x:0,y:0},data:{kind:original.kind}}],[original.id],{},{})!;
    const batch=prepareDevicePaste(net,source,{x:800,y:0},net.devices.size);
    expect(restoreDeletedDevices(net,batch.devices,[])).toBe(true);net.removeDevice(original.id);
    const rows: CheckResult[]=[];let done=false;
    runChecks(net,betaChecks[exercise.id].map(a=>({id:a.id,label:'',check:a.check})),r=>rows.push(r),()=>{done=true;});net.scheduler.advanceTo(120_000);
    expect(done).toBe(true);expect(rows.find(r=>r.id===(exercise.id.includes('routing')?'buero-eth0':'ip-servicepc'))?.pass).toBe(false);
  }finally{disposeNetwork(net);}
});
