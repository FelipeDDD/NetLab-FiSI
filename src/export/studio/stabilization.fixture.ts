import { blocksFixture } from './blocks.fixture';
import type { ProjectDocument } from '../../projects/types';

/** Disposable audit network: four routers, three switches, six hosts, with
 * two distinct IPv4 LANs and two real router ports on SW-A. Never used at boot. */
export function stabilizationFixture(): ProjectDocument {
  const doc=blocksFixture('four'),a=doc.topology.devices.find(d=>d.id==='A')!,d=doc.topology.devices.find(d=>d.id==='D')!;
  Object.assign(a.ifaces[2],{ip:'192.168.40.1/24',ipv4Mode:'static'});
  d.routes.push({dest:'192.168.40.0/24',via:'10.0.1.1',dev:'eth0'});
  doc.topology.links.push({id:'parallel-A-40',a:['A','eth2'],b:['SW-A','eth2']});
  for(const [i,id] of ['A','B','C'].entries()){
    const subnet=id==='A'?40:(i+1)*10;
    doc.topology.devices.push({id:`PC-${id}2`,name:`PC-${id} / segunda rede`,kind:'host',x:i*290-160,y:-200,forwarding:false,ifaces:[{name:'eth0',ip:`192.168.${subnet}.${id==='A'?10:20}/24`,gateway:`192.168.${subnet}.1`,ipv4Mode:'static',up:true}],routes:[]});
    doc.topology.links.push({id:`host-${id}-extra`,a:[`PC-${id}2`,'eth0'],b:[`SW-${id}`,id==='A'?'eth3':'eth2']});
  }
  return doc;
}
