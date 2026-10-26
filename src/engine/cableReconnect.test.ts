import { expect, it, vi } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { Host, IpDevice } from './ipdevice';
import { SwitchDevice } from './switch';
import { parseIp } from './ip';
import { serializeNetwork, restoreNetwork } from './serialize';
import type { EthernetFrame } from './types';

const ip = (value: string) => parseIp(value)!;
const frame = (mac: string): EthernetFrame => ({ srcMac: mac, dstMac: 'ff:ff:ff:ff:ff:ff',
  payload: { kind: 'arp', op: 'request', senderIp: ip('10.0.0.10'), senderMac: mac, targetIp: ip('10.0.0.20'), targetMac: null } });
function ping(net: Network, host: IpDevice, address: string) {
  const events: string[] = [], id = host.allocIcmpId();
  host.onIcmp(id, e => events.push(e.type)); host.sendEcho(ip(address), id, 1);
  net.scheduler.advanceTo(net.now + 4000); host.offIcmp(id);
  return events.includes('reply');
}

it.each(['a', 'b'] as const)('reconnects %s atomically, keeping identity, the fixed end, IP, MAC, VLAN and latency', end => {
  const net = new Network(), a = createDevice(net, 'switch', { switchPorts: 24 }) as SwitchDevice;
  const b = createDevice(net, 'switch') as SwitchDevice, c = createDevice(net, 'switch') as SwitchDevice;
  const link = net.connect(a.id, b.id, { aIface: 'eth23', bIface: 'eth7' }); link.latency = 123;
  const old = link[end], fixed = link[end === 'a' ? 'b' : 'a'];
  a.vlans.set('eth23', 20); b.vlans.set('eth7', 20); c.vlans.set('eth6', 30);
  a.receiveFrame(link.a, frame('02:aa:00:00:00:01')); b.receiveFrame(link.b, frame('02:aa:00:00:00:02'));
  const ownMacs = [old.mac, fixed.mac, c.interfaces[6].mac];
  expect(net.reconnectError(link.id, end, c.id, 'eth6')).toBeNull();
  expect(old.link).toBe(link); // preflight is read-only
  expect(net.reconnect(link.id, end, c.id, 'eth6')).toBe(link);
  expect(net.links.get(link.id)).toBe(link); expect(net.links.size).toBe(1); expect(link.latency).toBe(123);
  expect(link[end]).toBe(c.interfaces[6]); expect(old.link).toBeNull(); expect(fixed.link).toBe(link);
  expect([old.mac, fixed.mac, c.interfaces[6].mac]).toEqual(ownMacs);
  expect(a.macTable.size).toBe(0); expect(b.macTable.size).toBe(0);
  expect(a.vlanOf('eth23')).toBe(20); expect(c.vlanOf('eth6')).toBe(30);
  const restored = restoreNetwork(serializeNetwork(net, {}));
  expect(restored.links.get(link.id)?.[end].name).toBe('eth6');
});

it('rejects occupied, wireless, self, missing and stale targets without touching ports or learning', () => {
  const net = new Network(), sw = createDevice(net, 'switch') as SwitchDevice, a = createDevice(net, 'host');
  const b = createDevice(net, 'notebook'), phone = createDevice(net, 'smartphone'), occupied = net.connect(sw.id, b.id);
  const link = net.connect(a.id, sw.id), snapshot = serializeNetwork(net, {});
  sw.receiveFrame(link.b, frame(a.interfaces[0].mac)); const learned = [...sw.macTable];
  for (const [id, port] of [[b.id, 'eth0'], [b.id, 'wlan0'], [phone.id, 'wlan0'], [sw.id, 'eth5'], ['missing', 'eth0'], [a.id, 'eth22']]) {
    expect(() => net.reconnect(link.id, 'a', id, port)).toThrow();
    expect(serializeNetwork(net, {})).toEqual(snapshot); expect([...sw.macTable]).toEqual(learned);
  }
  expect(occupied.a.link).toBe(occupied); expect(link.a.link).toBe(link); expect(link.b.link).toBe(link);
  net.disconnect(link.id); expect(() => net.reconnect(link.id, 'b', sw.id, 'eth6')).toThrow();
});

it('does not interrupt pending traffic when previewing or reselecting the current interface, but cancels old deliveries on commit', () => {
  const net = new Network(), a = createDevice(net, 'host'), b = createDevice(net, 'host'), c = createDevice(net, 'host');
  const link = net.connect(a.id, b.id), receive = vi.spyOn(b, 'receiveFrame').mockImplementation(() => {});
  link.a.send(frame(link.a.mac)); const pending = net.scheduler.pending;
  expect(net.reconnectError(link.id, 'b', c.id, 'eth0')).toBeNull();
  net.reconnect(link.id, 'b', b.id, 'eth0'); expect(net.scheduler.pending).toBe(pending);
  net.scheduler.advanceTo(link.latency); expect(receive).toHaveBeenCalledOnce();
  link.a.send(frame(link.a.mac)); net.reconnect(link.id, 'b', c.id, 'eth0');
  net.scheduler.advanceTo(net.now + link.latency); expect(receive).toHaveBeenCalledOnce();
});

it('flushes only affected ARP entries, relearns MACs after moving switch ports and continues ping', () => {
  const net = new Network(), sw = createDevice(net, 'switch') as SwitchDevice;
  const a = createDevice(net, 'host') as Host, b = createDevice(net, 'host') as Host;
  a.addIp('eth0', ip('10.0.0.10'), 24); b.addIp('eth0', ip('10.0.0.20'), 24);
  const link = net.connect(a.id, sw.id); net.connect(b.id, sw.id);
  expect(ping(net, a, '10.0.0.20')).toBe(true); expect(a.arpTable.size).toBeGreaterThan(0);
  expect(sw.macTable.get(`1|${a.interfaces[0].mac}`)).toBe(link.b);
  net.reconnect(link.id, 'b', sw.id, 'eth7');
  expect(a.arpTable.size).toBe(0); expect(sw.macTable.has(`1|${a.interfaces[0].mac}`)).toBe(false);
  expect(ping(net, a, '10.0.0.20')).toBe(true);
  expect(sw.macTable.get(`1|${a.interfaces[0].mac}`)).toBe(sw.interfaces[7]);
  expect(sw.macTable.get(`1|${b.interfaces[0].mac}`)).toBe(sw.interfaces[1]);
  const router = createDevice(net, 'router') as IpDevice;
  const other = net.connect(router.id, createDevice(net, 'host').id, { aIface: 'eth1' });
  const moved = net.connect(router.id, createDevice(net, 'host').id, { aIface: 'eth0' });
  router.arpTable.set(ip('10.1.0.1'), { mac: moved.b.mac, ifaceName: 'eth0', at: 0 });
  router.arpTable.set(ip('10.2.0.1'), { mac: other.b.mac, ifaceName: 'eth1', at: 0 });
  net.reconnect(moved.id, 'b', createDevice(net, 'host').id, 'eth0');
  expect([...router.arpTable.keys()]).toEqual([ip('10.2.0.1')]);
});

it('rejects Ethernet onto an associated Notebook and keeps AP wireless associations intact', () => {
  const net = new Network(), ap = createDevice(net, 'ap'), notebook = createDevice(net, 'notebook');
  const wifi = net.associate(notebook.id, ap.id), a = createDevice(net, 'host'), b = createDevice(net, 'switch');
  const cable = net.connect(a.id, b.id);
  expect(() => net.reconnect(cable.id, 'a', notebook.id, 'eth0')).toThrow('WLAN');
  expect(() => net.reconnect(wifi.id, 'a', a.id, 'eth0')).toThrow('WLAN');
  expect(wifi.a.link).toBe(wifi); expect(cable.a.link).toBe(cable);
});
