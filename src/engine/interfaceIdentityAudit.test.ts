import { expect, it } from 'vitest';
import { interfaceAuditFixture, interfaceAuditDocument } from '../testing/interfaceAuditFixture';
import { canvasNetwork } from '../canvasNetwork';
import { interfaceCableColor, resolvedCableAppearances } from '../cableAppearance';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { restoreNetwork, serializeNetwork } from './serialize';
import { IpDevice } from './ipdevice';
import { SwitchDevice } from './switch';
import { createDevice } from './factory';
import { parseIp } from './ip';
import { runDhclient } from '../commands/dhclient';

it('reproduces eth2 connected without IPv4 and eth3 configured but disconnected consistently', () => {
  const document = interfaceAuditDocument(), prepared = prepareTopologyDocument(document), net = prepared.network;
  const r = net.devices.get('r1') as IpDevice, link = net.links.get('ap-uplink')!;
  expect(document.links.find(l => l.id === link.id)!.a).toEqual(['r1', 'eth2']);
  expect(link.a).toBe(r.getInterface('eth2')); expect(link.b).toBe(net.devices.get('ap1')!.getInterface('eth0'));
  expect(link.operational).toBe(true); expect(link.a.ip).toBeNull(); expect(r.getInterface('eth3')!.link).toBeNull();
  const summary = canvasNetwork(r)!;
  expect(summary.addresses.map(a => a.interfaceName)).toEqual(['eth0', 'eth3']);
  expect(summary.addresses.find(a => a.interfaceName === 'eth3')).toMatchObject({ address: '192.168.2.1', stored: true, active: false });
  expect(summary.tooltip).toContain('eth2: Kein IPv4');
  const colors = resolvedCableAppearances(net, prepared.presentation.cableColors);
  expect(interfaceCableColor(link.a, colors)).toBe('#f472b6'); expect(interfaceCableColor(r.getInterface('eth3'), colors)).toBeUndefined();
});

it('restores exact interface names, MACs, IPv4, VLANs and endpoints without relying on array order', () => {
  const document = interfaceAuditDocument(), initial = restoreNetwork(document);
  const canonical = serializeNetwork(initial, {});
  for (let i=0;i<3;i++) {
    const copy = structuredClone(document); copy.devices.reverse(); copy.links.reverse(); copy.devices.find(d=>d.id==='r1')!.ifaces.reverse();
    const restored = restoreNetwork(copy);
    const actual = serializeNetwork(restored, {});
    expect(actual.devices.sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...canonical.devices].sort((a,b)=>a.id.localeCompare(b.id)));
    expect(actual.links.sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...canonical.links].sort((a,b)=>a.id.localeCompare(b.id)));
  }
});

it('does not serve an eth3 pool through unconfigured eth2, while the independent LAN completes DORA', () => {
  const {net,router,client,wireless} = interfaceAuditFixture(); let lan = '', wlan = '';
  runDhclient(client, ['eth0'], s=>lan+=s, ()=>{}); runDhclient(wireless, ['wlan0'], s=>wlan+=s, ()=>{});
  net.scheduler.advanceTo(8000);
  expect(lan).toContain('DHCPACK'); expect(client.interfaces[0].ip!.addr).toBe(parseIp('192.168.1.100'));
  expect(wlan.match(/DHCPDISCOVER/g)).toHaveLength(3); expect(wlan).toContain('No DHCPOFFERS');
  expect(wireless.getInterface('wlan0')!.ip).toBeNull(); expect(router.dhcpPools.get('eth3')!.leases.size).toBe(0);
});

it('isolates VLANs and completes the correctly constructed AP control topology', () => {
  const {net,sw,client,wireless} = interfaceAuditFixture(true);
  sw.vlans.set('eth1', 8); let blocked = '';
  runDhclient(client, ['eth0'], s=>blocked+=s, ()=>{}); runDhclient(wireless, ['wlan0'], ()=>{}, ()=>{}); net.scheduler.advanceTo(8000);
  expect(blocked).toContain('No DHCPOFFERS'); expect(client.interfaces[0].ip).toBeNull();
  expect(wireless.getInterface('wlan0')!.ip!.addr).toBe(parseIp('192.168.2.100'));
});

it('can legitimately repeat DISCOVER before a delayed Offer and still complete DORA', () => {
  const {net,wireless} = interfaceAuditFixture(true); for(const link of net.links.values())link.latency=250;
  let output='',doneAt=0;runDhclient(wireless,['wlan0'],s=>output+=s,()=>{doneAt=net.now;});
  net.scheduler.advanceTo(8000);
  expect((output.match(/DHCPDISCOVER/g)??[]).length).toBeGreaterThan(1);
  expect(output.indexOf('DHCPOFFER')).toBeLessThan(output.indexOf('DHCPREQUEST'));
  expect(output.indexOf('DHCPREQUEST')).toBeLessThan(output.indexOf('DHCPACK'));
  expect(doneAt).toBeGreaterThan(2000);expect(output).toContain('bound to 192.168.2.100');
});

it('retains last DHCP IPv4/options but clears leases, listeners, caches and pending events on restore', () => {
  const {net,client,router} = interfaceAuditFixture();runDhclient(client,['eth0'],()=>{},()=>{});net.scheduler.advanceTo(5000);
  expect(client.interfaces[0].dhcpLease).not.toBeNull();expect(router.dhcpPools.get('eth0')!.leases.size).toBe(1);
  const copy=restoreNetwork(serializeNetwork(net,{})), restored=copy.devices.get(client.id) as IpDevice, r=copy.devices.get(router.id) as IpDevice;
  expect(restored.interfaces[0].ipv4).toEqual(client.interfaces[0].ipv4);expect(restored.interfaces[0].dhcpLease).toBeNull();
  expect(restored.interfaces[0].cancelDhcp).toBeNull();expect(r.dhcpPools.get('eth0')!.leases.size).toBe(0);
  expect(r.arpTable.size).toBe(0);expect(restored.dhcpListeners.size).toBe(0);expect(copy.scheduler.pending).toBe(0);
  expect([...copy.devices.values()].filter(d=>d instanceof SwitchDevice).every(d=>(d as SwitchDevice).macTable.size===0)).toBe(true);
  const newcomer=createDevice(copy,'host') as IpDevice;
  copy.connect('sw1',newcomer.id,{aIface:'eth3'});(copy.devices.get('sw1') as SwitchDevice).vlans.set('eth3',7);
  runDhclient(newcomer,['eth0'],()=>{},()=>{});copy.scheduler.advanceTo(8000);
  expect(newcomer.interfaces[0].ip!.addr).not.toBe(restored.interfaces[0].ip!.addr);
});
