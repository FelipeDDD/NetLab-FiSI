import { expect, it } from 'vitest';
import { Network, type WireTransfer, type WireFrameContext, type WireVisualTrace } from './network';
import { createDevice } from './factory';
import { IpDevice } from './ipdevice';
import { MAC_AGE_MS, SwitchDevice } from './switch';
import { parseIp } from './ip';
import { runDhclient, releaseDhcp } from '../commands/dhclient';
import { serializeNetwork, restoreNetwork } from './serialize';
import { sequencePacketAnimation, type AnimatedTransfer } from '../packetAnimation';
import { applyInspectorEdit } from '../topologyEdits';
import { dhcpConfiguration } from './dhcpPools';

const ip = (s: string) => parseIp(s)!;
function lab(kind: 'router' | 'firewall') {
  const net = new Network(), gateway = createDevice(net, kind) as IpDevice;
  const a = createDevice(net, 'switch'), b = createDevice(net, 'switch');
  const ap = createDevice(net, 'ap') as SwitchDevice;
  const pcs = [1, 2, 3].map(() => createDevice(net, 'host') as IpDevice);
  const phones = [1, 2].map(() => createDevice(net, 'smartphone') as IpDevice);
  const notebook = createDevice(net, 'notebook') as IpDevice;
  for (const n of [1, 2]) {
    gateway.addIp(`eth${n - 1}`, ip(`192.168.${n}.1`), 24);
    gateway.dhcpPools.set(`eth${n - 1}`, { enabled: true, rangeStart: ip(`192.168.${n}.100`),
      rangeEnd: ip(`192.168.${n}.150`), router: ip(`192.168.${n}.1`), dns: ip(`192.168.${n}.1`), leases: new Map() });
  }
  net.connect(gateway.id, a.id, { aIface: 'eth0' });
  net.connect(gateway.id, b.id, { aIface: 'eth1' }); net.connect(b.id, ap.id);
  for (const pc of pcs) net.connect(a.id, pc.id);
  net.associate(phones[0].id, ap.id); net.associate(notebook.id, ap.id);
  return { net, gateway, ap, pcs, phones, notebook };
}
function renew(net: Network, d: IpDevice) {
  runDhclient(d, [d.kind === 'host' ? 'eth0' : 'wlan0'], () => {}, () => {});
  net.scheduler.advanceTo(net.now + 10000);
}
type Hop = { transfer: WireTransfer; context: WireFrameContext; trace?: WireVisualTrace };
function observe(net: Network) {
  const hops: Hop[] = [], visuals: AnimatedTransfer[] = [];
  net.onWireTransfer = (transfer, context, trace) => {
    hops.push({ transfer, context: structuredClone(context), trace });
    const visual = sequencePacketAnimation(transfer, trace, visuals, transfer.start, 200);
    if (visual) visuals.push(visual);
  };
  return { hops, visuals };
}
function ping(net: Network, source: IpDevice, target: IpDevice, id: number, trace: ReturnType<typeof observe>) {
  trace.hops.length = 0; trace.visuals.length = 0;
  const replies: number[] = [];
  const destination = target.interfaces.find(i => i.ip)!.ip!.addr;
  source.onIcmp(id, e => { if (e.type === 'reply') replies.push(e.seq); });
  expect(source.sendEcho(destination, id, 1)).toBeNull();
  net.scheduler.advanceTo(net.now + 5000);
  expect(replies).toEqual([1]);
  const requests = trace.hops.filter(h => {
    const p = h.context.frame.payload;
    return p.kind === 'ipv4' && p.l4.kind === 'icmp' && p.l4.msg.type === 'echo-request' && p.l4.msg.id === id;
  });
  expect(requests.length).toBeGreaterThanOrEqual(5);
  for (const { transfer: t, context: c } of requests) {
    expect(c.frame.payload).toMatchObject({ dst: destination });
    const link = net.links.get(t.linkId)!;
    expect([link.a.device.id, link.b.device.id]).toContain(t.fromDeviceId);
    expect([link.a.device.id, link.b.device.id]).toContain(t.toDeviceId);
    expect(trace.visuals.find(v => v.id === t.id)).toMatchObject(t);
  }
  const delivered = requests.filter(h => h.transfer.toDeviceId === target.id && h.context.frame.dstMac === target.interfaces[0].mac);
  expect(delivered).toHaveLength(1);
  // Reply provenance proves which destination actually processed the request.
  const reply = trace.hops.find(h => h.trace?.echoRequestTransferId === delivered[0].transfer.id);
  expect(reply?.transfer.fromDeviceId).toBe(target.id);
  return requests;
}

it.each(['router', 'firewall'] as const)('%s keeps real and visual ping paths aligned after second phone, renewals and reconnection', kind => {
  const { net, gateway, ap, pcs, phones, notebook } = lab(kind);
  for (const d of [...pcs, phones[0], notebook]) renew(net, d);
  const trace = observe(net);
  ping(net, phones[0], pcs[2], 101, trace); // Populate ARP and both bridge tables.
  net.associate(phones[1].id, ap.id); renew(net, phones[1]);
  for (const n of [0, 1]) {
    const requests = ping(net, phones[n], pcs[2], 102 + n, trace);
    expect(requests.some(h => h.transfer.toDeviceId === phones[1 - n].id)).toBe(false);
  }
  const before = dhcpConfiguration(gateway), after = structuredClone(before); after.pools.eth1.enabled = false;
  const edit = { type: 'set-dhcp-configuration' as const, label: 'DHCP eth1', deviceId: gateway.id, before, after };
  expect(applyInspectorEdit(net, edit, 'redo')).toBe(true);
  ping(net, phones[1], pcs[2], 104, trace); // Existing leases still work with server disabled.
  expect(gateway.dhcpPools.get('eth0')!.enabled).toBe(true);
  expect(applyInspectorEdit(net, edit, 'undo')).toBe(true);
  releaseDhcp(phones[1], 'wlan0'); net.scheduler.advanceTo(net.now + 2000); renew(net, phones[1]);
  net.disconnect(phones[0].interfaces[0].link!.id); net.associate(phones[0].id, ap.id);
  renew(net, phones[0]); ping(net, phones[0], pcs[2], 105, trace);
  expect(new Set([...phones, notebook].map(d => d.getInterface('wlan0')!.ip!.addr)).size).toBe(3);
  // Same import/export path used by autosave; leases/ARP/MAC tables are transient.
  const restored = restoreNetwork(JSON.parse(JSON.stringify(serializeNetwork(net, {}))));
  const phone = restored.devices.get(phones[1].id) as IpDevice, pc = restored.devices.get(pcs[2].id) as IpDevice;
  renew(restored, phone); ping(restored, phone, pc, 106, observe(restored));
});

it('distinguishes visible broadcast/unknown-unicast branches from IP delivery after MAC aging', () => {
  const { net, ap, pcs, phones } = lab('router');
  net.associate(phones[1].id, ap.id);
  for (const d of [...pcs, ...phones]) renew(net, d);
  const trace = observe(net);
  ping(net, phones[0], pcs[2], 201, trace);
  // MAC aging can legitimately flood an ICMP frame to the other phone while
  // the IP destination and Ethernet destination remain the PC and gateway.
  net.scheduler.advanceTo(net.now + MAC_AGE_MS + 1);
  const requests = ping(net, phones[0], pcs[2], 202, trace);
  const branch = requests.find(h => h.transfer.toDeviceId === phones[1].id);
  expect(branch).toBeDefined();
  expect(branch!.context.frame.dstMac).not.toBe(phones[1].interfaces[0].mac);
  expect(trace.hops.some(h => h.transfer.fromDeviceId === phones[1].id && h.transfer.kind === 'icmp')).toBe(false);
  const warm = ping(net, phones[0], pcs[2], 203, trace);
  expect(warm.some(h => h.transfer.toDeviceId === phones[1].id)).toBe(false);
});

it.each(['router', 'firewall'] as const)('%s delivers replies to current lease owners after warm wireless clients exchange addresses', kind => {
  const { net, gateway, ap, pcs, phones } = lab(kind);
  net.associate(phones[1].id, ap.id);
  for (const d of [...pcs, ...phones]) renew(net, d);
  const trace = observe(net);
  ping(net, phones[0], pcs[2], 301, trace); ping(net, phones[1], pcs[2], 302, trace);
  const old = phones.map(p => p.interfaces[0].ip!.addr);
  for (const phone of phones) releaseDhcp(phone, 'wlan0');
  net.scheduler.advanceTo(net.now + 2000);
  renew(net, phones[1]); renew(net, phones[0]);
  expect(phones.map(p => p.interfaces[0].ip!.addr)).toEqual([old[1], old[0]]);
  for (const phone of phones) {
    const iface = phone.interfaces[0];
    expect(gateway.arpTable.get(iface.ip!.addr)).toMatchObject({ mac: iface.mac, ifaceName: 'eth1' });
    expect(trace.hops.some(h => h.transfer.fromDeviceId === phone.id && h.context.frame.payload.kind === 'arp' &&
      h.context.frame.payload.senderIp === iface.ip!.addr && h.context.frame.payload.targetIp === iface.ip!.addr)).toBe(true);
  }
  ping(net, phones[1], pcs[2], 303, trace);
  ping(net, phones[0], pcs[2], 304, trace);
});

it('updates existing ARP neighbors from announcements only on their learned interface, without a global flush', () => {
  const net = new Network(), r = createDevice(net, 'router') as IpDevice;
  const a = createDevice(net, 'host') as IpDevice, b = createDevice(net, 'host') as IpDevice;
  net.connect(r.id, a.id, {aIface:'eth0'}); net.connect(r.id, b.id, {aIface:'eth1'});
  a.addIp('eth0', ip('192.168.1.100'), 24); b.addIp('eth0', ip('192.168.1.100'), 24);
  const old = {mac:'02:00:00:ff:ff:ff',ifaceName:'eth0',at:0};
  r.arpTable.set(ip('192.168.1.100'), old);
  r.arpTable.set(ip('192.168.1.101'), {...old});
  b.announceIpv4(b.interfaces[0]); net.scheduler.advanceTo(100);
  expect(r.arpTable.get(ip('192.168.1.100'))).toEqual(old);
  a.announceIpv4(a.interfaces[0]); net.scheduler.advanceTo(200);
  expect(r.arpTable.get(ip('192.168.1.100'))).toMatchObject({mac:a.interfaces[0].mac,ifaceName:'eth0'});
  expect(r.arpTable.get(ip('192.168.1.101'))).toEqual(old);
});
