import { expect, it, vi } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import type { EthernetFrame } from './types';

it('observes each transmission once with exact interfaces, without changing its frame or delivery time', () => {
  const net = new Network(), a = createDevice(net, 'router'), b = createDevice(net, 'router');
  const link = net.connect(a.id, b.id, { aIface: 'eth2', bIface: 'eth1' });
  link.latency = 125;
  const frame: EthernetFrame = { srcMac: link.a.mac, dstMac: link.b.mac,
    payload: { kind: 'arp', op: 'request', senderIp: 1, senderMac: link.a.mac, targetIp: 2, targetMac: null } };
  const original = structuredClone(frame), observe = vi.fn(), receive = vi.spyOn(b, 'receiveFrame').mockImplementation(() => {});
  net.onWireTransfer = observe;
  link.a.send(frame);
  expect(observe).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledWith({ id: 1, linkId: link.id, fromDeviceId: a.id, toDeviceId: b.id,
    kind: 'arp', start: 0, end: 125 }, {
    frame, fromInterface: 'eth2', toInterface: 'eth1', fromDeviceName: a.name, toDeviceName: b.name,
  });
  expect(observe.mock.calls[0][1].frame).toBe(frame);
  expect(frame).toEqual(original); expect(net.scheduler.pending).toBe(1);
  net.scheduler.advanceTo(124); expect(receive).not.toHaveBeenCalled();
  net.scheduler.advanceTo(125); expect(receive).toHaveBeenCalledOnce(); expect(receive).toHaveBeenCalledWith(link.b, frame);
  link.b.send(frame);
  expect(observe).toHaveBeenCalledTimes(2);
  expect(observe.mock.calls[1][1]).toMatchObject({ fromInterface: 'eth1', toInterface: 'eth2', fromDeviceName: b.name, toDeviceName: a.name });
  receive.mockRestore();
});

it('delivers frames even when the wire observer throws', () => {
  const net = new Network(), a = createDevice(net, 'host'), b = createDevice(net, 'host');
  const link = net.connect(a.id, b.id), receive = vi.spyOn(b, 'receiveFrame').mockImplementation(() => {});
  const frame: EthernetFrame = { srcMac: link.a.mac, dstMac: link.b.mac,
    payload: { kind: 'ipv4', src: 1, dst: 2, ttl: 64, l4: { kind: 'icmp', msg: { type: 'echo-request', id: 1, seq: 1 } } } };
  net.onWireTransfer = () => { throw new Error('observer failed'); };
  expect(() => link.a.send(frame)).not.toThrow();
  net.scheduler.advanceTo(link.latency);
  expect(receive).toHaveBeenCalledOnce(); expect(receive).toHaveBeenCalledWith(link.b, frame);
  receive.mockRestore();
});
