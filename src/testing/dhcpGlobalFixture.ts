import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { IpDevice, RouterDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import { serializeNetwork } from '../engine/serialize';

/** Three independent broadcast domains; third pool intentionally disabled. */
export function dhcpGlobalFixture() {
  const net = new Network();
  const router = createDevice(net, 'router', {id:'r-dhcp',name:'DHCP-Router'}) as RouterDevice;
  router.position = {x:340,y:60};
  const clients: IpDevice[] = [], switches = [];
  for (let n=0;n<3;n++) {
    const address = parseIp(`10.20.${n+1}.1`)!;
    router.addIp(`eth${n}`,address,24);
    router.dhcpPools.set(`eth${n}`,{enabled:n!==2,rangeStart:address+99,rangeEnd:address+109,router:address,dns:null,leases:new Map()});
    const sw = createDevice(net,'switch',{id:`sw-${n}`,name:`LAN ${n+1}`});
    const client = createDevice(net,'host',{id:`client-${n}`,name:`Client ${n+1}`}) as IpDevice;
    sw.position={x:80+260*n,y:250};client.position={x:80+260*n,y:400};
    net.connect(router.id,sw.id,{aIface:`eth${n}`,bIface:'eth0'});
    net.connect(sw.id,client.id,{aIface:'eth1',bIface:'eth0'});
    clients.push(client);switches.push(sw);
  }
  return {net,router,clients,switches};
}

export function dhcpGlobalDocument() {
  const {net} = dhcpGlobalFixture();
  return serializeNetwork(net,Object.fromEntries([...net.devices.values()].map(d=>[d.id,d.position])));
}
