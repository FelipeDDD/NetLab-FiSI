import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { Host, RouterDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { parseIp } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';

/** Disposable broadcast domain, four eligible egress ports and an excluded VLAN. */
export function pingPlaybackFixture() {
  const net = new Network();
  const sw = createDevice(net, 'switch', { id:'sw',name:'Switch' }) as SwitchDevice;
  sw.position={x:370,y:100};
  const router=createDevice(net,'router',{id:'router',name:'Router'}) as RouterDevice;
  router.position={x:80,y:100};router.addIp('eth0',parseIp('10.0.0.1')!,24);
  router.dhcpPools.set('eth0',{enabled:true,rangeStart:parseIp('10.0.0.100')!,rangeEnd:parseIp('10.0.0.110')!,router:parseIp('10.0.0.1'),dns:null,leases:new Map()});
  net.connect(router.id,sw.id,{id:'router-link',aIface:'eth0',bIface:'eth0'});
  const hosts=Array.from({length:5},(_,i)=>{
    const d=createDevice(net,'host',{id:'pc'+(i+1),name:'PC'+(i+1),os:i===1?'windows':'linux'}) as Host;
    d.position={x:70+i*170,y:320};d.addIp('eth0',parseIp(`10.0.0.${(i+1)*10}`)!,24);
    net.connect(d.id,sw.id,{id:d.id+'-link',aIface:'eth0',bIface:'eth'+(i+1)});
    return d;
  });
  for(let i=0;i<=5;i++)sw.vlans.set('eth'+i,i===5?2:1);
  return {net,sw,router,hosts};
}

export function pingPlaybackDocument() {
  const {net}=pingPlaybackFixture();
  return serializeNetwork(net,Object.fromEntries([...net.devices].map(([id,d])=>[id,d.position])));
}
