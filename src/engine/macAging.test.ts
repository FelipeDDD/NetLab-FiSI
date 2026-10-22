import { expect, it, vi } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { SwitchDevice, MAC_AGE_MS } from './switch';
import { applyAccessVlan } from '../topologyEdits';
import { restoreNetwork, serializeNetwork } from './serialize';
import type { EthernetFrame } from './types';
const mac = '02:aa:00:00:00:01';
const frame: EthernetFrame = { srcMac: mac, dstMac: 'ff:ff:ff:ff:ff:ff', payload: { kind: 'arp', op: 'reply', senderIp: 0, senderMac: mac, targetIp: 0, targetMac: null } };
function setup(kind: 'switch' | 'ap' = 'switch', ports = 8) {
  const net = new Network(), sw = createDevice(net, kind, { switchPorts: ports }) as SwitchDevice;
  const host = createDevice(net, 'host'), link = net.connect(sw.id, host.id, { aIface: `eth${ports - 1}` });
  return { net, sw, host, link, port: link.a };
}
it.each(['switch', 'ap'] as const)('ages %s entries on the virtual clock and refreshes learning', kind => {
  const { net, sw, port } = setup(kind);
  sw.receiveFrame(port, frame); expect(sw.macTable.get(`1|${mac}`)).toBe(port);
  net.scheduler.advanceTo(200000); sw.receiveFrame(port, frame);
  net.scheduler.advanceTo(MAC_AGE_MS); expect(sw.macTable.size).toBe(1);
  net.scheduler.advanceTo(499999); expect(sw.macTable.size).toBe(1);
  net.scheduler.advanceTo(500000); expect(sw.macTable.size).toBe(0);
  expect(net.scheduler.pending).toBe(0);
});
it('does not age when wall time passes without advancing the paused virtual clock', () => {
  vi.useFakeTimers();
  try { const { net, sw, port } = setup(); sw.receiveFrame(port, frame); vi.advanceTimersByTime(600000); expect(net.now).toBe(0); expect(sw.macTable.size).toBe(1); }
  finally { vi.useRealTimers(); }
});
it.each([8, 24])('disconnects, removes the free last port and relearns on another port (%i ports)', count => {
  const { net, sw, host, link, port } = setup('switch', count);
  sw.receiveFrame(port, frame); net.disconnect(link.id); expect(sw.macTable.size).toBe(0);
  sw.removeLastPort(); expect(sw.interfaces).toHaveLength(count - 1);
  const newLink = net.connect(sw.id, host.id, { aIface: 'eth0' }); sw.receiveFrame(newLink.a, frame);
  expect(sw.macTable.get(`1|${mac}`)).toBe(sw.interfaces[0]);
  const saved = serializeNetwork(net, {}), copy = restoreNetwork(saved).devices.get(sw.id) as SwitchDevice;
  expect(copy.macTable.size).toBe(0); expect(copy.interfaces.length).toBe(count - 1);
});
it('flushes DOWN and VLAN changes, preserves VLAN configuration and separates identical MACs', () => {
  const { net, sw, port } = setup(); const other = createDevice(net, 'host'); const p = net.connect(sw.id, other.id).a;
  applyAccessVlan(sw, p.name, 20); sw.receiveFrame(port, frame); sw.receiveFrame(p, frame);
  expect(sw.macTable.size).toBe(2); port.up = false; expect(sw.macTable.size).toBe(1);
  expect(sw.vlanOf(p.name)).toBe(20); applyAccessVlan(sw, p.name, 30); expect(sw.macTable.size).toBe(0);
});
it('relearns moves and floods unknown unicast only inside its VLAN after expiration', () => {
  const { net, sw, port } = setup();
  const p = net.connect(sw.id, createDevice(net, 'host').id).a;
  const q = net.connect(sw.id, createDevice(net, 'host').id).a;
  const isolated = net.connect(sw.id, createDevice(net, 'host').id).a; applyAccessVlan(sw, isolated.name, 20);
  sw.receiveFrame(port, frame); sw.receiveFrame(p, frame); expect(sw.macTable.get(`1|${mac}`)).toBe(p);
  net.scheduler.advanceTo(MAC_AGE_MS);
  const oldSend = vi.spyOn(port, 'send'), newSend = vi.spyOn(p, 'send'), outside = vi.spyOn(isolated, 'send');
  sw.receiveFrame(q, { ...frame, srcMac: '02:bb:00:00:00:01', dstMac: mac });
  expect(oldSend).toHaveBeenCalledOnce(); expect(newSend).toHaveBeenCalledOnce(); expect(outside).not.toHaveBeenCalled();
});
