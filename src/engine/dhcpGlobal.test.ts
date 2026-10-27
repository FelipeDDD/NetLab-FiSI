import { expect, it } from 'vitest';
import { dhcpGlobalFixture, dhcpGlobalDocument } from '../testing/dhcpGlobalFixture';
import { runDhclient } from '../commands/dhclient';
import { createDevice } from './factory';
import { IpDevice, RouterDevice } from './ipdevice';
import type { Network } from './network';
import { dhcpConfiguration } from './dhcpPools';
import { restoreNetwork, serializeNetwork } from './serialize';
import { inspectLegacyTopology } from '../projects/legacyInspection';
import { Shell, formatSockets } from '../commands/shell';

const renew = (net:Network, client:IpDevice) => {
  runDhclient(client,['eth0'],()=>{},()=>{});net.scheduler.advanceTo(net.now+6000);
};
const command = (device:IpDevice, text:string) => {let output='';new Shell(device).exec(text,{write:s=>output+=s},()=>{});return output;};

it('blocks all three pools globally without changing individual settings, leases, addresses or Link UP',()=>{
  const {net,router,clients,switches}=dhcpGlobalFixture();
  renew(net,clients[0]);renew(net,clients[1]);
  const before=dhcpConfiguration(router),pools=[...router.dhcpPools.values()],leases=pools.map(p=>[...p.leases]);
  const interfaces=router.interfaces.map(i=>({ip:i.ip,up:i.up,link:i.link}));
  router.dhcpServerEnabled=false;
  expect(router.dhcpServiceEnabled).toBe(false);expect(formatSockets(router)).not.toContain(':67');
  const fresh=switches.map((sw,n)=>{const d=createDevice(net,'host',{id:`new-${n}`}) as IpDevice;net.connect(sw.id,d.id);return d;});
  for(const client of fresh)renew(net,client);
  expect(fresh.map(c=>c.interfaces[0].dhcpLease)).toEqual([null,null,null]);
  expect(dhcpConfiguration(router)).toEqual(before);
  expect(pools.map(p=>[...p.leases])).toEqual(leases);
  expect(router.interfaces.map(i=>({ip:i.ip,up:i.up,link:i.link}))).toEqual(interfaces);
  expect([...net.links.values()].every(l=>l.operational)).toBe(true);
  router.dhcpServerEnabled=true;
  for(const client of fresh)renew(net,client);
  expect(fresh.slice(0,2).every(c=>c.interfaces[0].dhcpLease)).toBe(true);
  expect(fresh[2].interfaces[0].dhcpLease).toBeNull();
  expect([...router.dhcpPools.values()].map(p=>p.enabled)).toEqual([true,true,false]);
});

it('holds a pending reservation during stop and rechecks it on start, without a delayed Offer while off',()=>{
  const {net,router,clients,switches}=dhcpGlobalFixture();let offers=0;
  net.onWireTransfer=(_t,ctx)=>{const p=ctx.frame.payload;if(p.kind==='ipv4'&&p.l4.kind==='udp'&&p.l4.app?.kind==='dhcp'&&p.l4.app.op==='offer')offers++;};
  runDhclient(clients[0],['eth0'],()=>{},()=>{});net.scheduler.advanceTo(300);
  router.dhcpServerEnabled=false;net.scheduler.advanceTo(6300);
  expect(offers).toBe(0);expect(router.dhcpPools.get('eth0')!.leases.size).toBe(0);
  router.dhcpServerEnabled=true;
  const other=createDevice(net,'host') as IpDevice;net.connect(switches[0].id,other.id);renew(net,other);
  expect(other.interfaces[0].ip?.addr).toBe(router.dhcpPools.get('eth0')!.rangeStart+1);
  renew(net,clients[0]);expect(clients[0].interfaces[0].ip?.addr).toBe(router.dhcpPools.get('eth0')!.rangeStart);
});

it('does not ACK a Request arriving after global stop, then resumes a new acquisition',()=>{
  const {net,router,clients}=dhcpGlobalFixture();let acknowledgements=0;
  net.onWireTransfer=(t,ctx)=>{const p=ctx.frame.payload;if(p.kind!=='ipv4'||p.l4.kind!=='udp'||p.l4.app?.kind!=='dhcp')return;
    if(p.l4.app.op==='offer'&&t.fromDeviceId===router.id)router.dhcpServerEnabled=false;
    if(p.l4.app.op==='ack')acknowledgements++;
  };
  renew(net,clients[0]);expect(acknowledgements).toBe(0);expect(clients[0].interfaces[0].dhcpLease).toBeNull();
  net.onWireTransfer=null;router.dhcpServerEnabled=true;renew(net,clients[0]);
  expect(clients[0].interfaces[0].dhcpLease).not.toBeNull();
});

it('round-trips the global flag in v1 while old documents default on and runtime leases remain transient',()=>{
  const {net,router,clients}=dhcpGlobalFixture();renew(net,clients[0]);router.dhcpServerEnabled=false;
  const saved=serializeNetwork(net,{}),copy=restoreNetwork(saved),loaded=copy.devices.get(router.id) as RouterDevice;
  expect(saved.version).toBe(1);expect(loaded.dhcpServerEnabled).toBe(false);
  expect(dhcpConfiguration(loaded)).toEqual(dhcpConfiguration(router));
  expect([...loaded.dhcpPools.values()].every(p=>p.leases.size===0)).toBe(true);
  expect(router.dhcpPools.get('eth0')!.leases.size).toBe(1);
  expect(inspectLegacyTopology(JSON.stringify(saved)).ok).toBe(true);
  const old=dhcpGlobalDocument();delete old.devices[0].dhcpServerEnabled;
  expect((restoreNetwork(old).devices.get(router.id) as RouterDevice).dhcpServerEnabled).toBe(true);
  old.devices[0].dhcpServerEnabled=true;expect(inspectLegacyTopology(JSON.stringify(old)).ok).toBe(true);
  old.devices[0].dhcpServerEnabled='false' as never;expect(()=>restoreNetwork(old)).toThrow('global DHCP');
});

it('uses a strict Router-only Linux service command and retains per-pool flags and unrelated services',()=>{
  const {net,router}=dhcpGlobalFixture();router.dnsServer={enabled:true,records:new Map()};
  const before=dhcpConfiguration(router);
  expect(command(router,'help')).toContain('systemctl start|stop|status kea-dhcp4-server');
  command(router,'systemctl stop kea-dhcp4-server');expect(router.dhcpServerEnabled).toBe(false);
  expect(command(router,'systemctl status kea-dhcp4-server.service')).toContain('inactive (dead)');
  expect(router.dnsServer.enabled).toBe(true);expect(dhcpConfiguration(router)).toEqual(before);
  for(const invalid of ['systemctl start dnsmasq','systemctl start kea-dhcp4-server extra','systemctl enable kea-dhcp4-server','service dhcp','no service dhcp']){
    command(router,invalid);expect(router.dhcpServerEnabled).toBe(false);
  }
  command(router,'systemctl start kea-dhcp4-server.service');expect(router.dhcpServiceEnabled).toBe(true);
  expect(command(router,'systemctl status kea-dhcp4-server')).toContain('active (running)');
  expect(formatSockets(router)).toContain('kea-dhcp4');
  const host=createDevice(net,'host') as IpDevice;command(host,'systemctl stop kea-dhcp4-server');expect(host.dhcpServerEnabled).toBe(true);
});
