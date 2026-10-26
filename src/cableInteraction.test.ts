import { expect, it } from 'vitest';
import { cableEndAt, firstReconnectInterface, reconnectTargetError } from './cableInteraction';
import { cableGeometry } from './cableGeometry';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';

it.each(['straight', 'hybrid'] as const)('detects both halves along %s paths, including vertical, reversed and frontal curved paths', style => {
  const paths = [
    cableGeometry({ x: 0, y: 0, width: 96, height: 78 }, { x: 0, y: 450, width: 96, height: 78 }, style),
    cableGeometry({ x: 600, y: 390, width: 96, height: 78 }, { x: 0, y: 0, width: 96, height: 78 }, style),
    cableGeometry({ x: 300, y: 200, width: 2, height: 2, front: { x: -24, y: 38 } }, { x: 0, y: 400, width: 96, height: 78 }, style),
  ];
  for (const path of paths) {
    for (const progress of [.03, .15, .4, .49, .51, .6, .85, .97]) expect(cableEndAt(path, path.pointAt(progress))).toBe(progress < .5 ? 'a' : 'b');
  }
});

it('chooses the first actually free Ethernet interface, including DOWN ports, and rejects unavailable/incompatible devices', () => {
  const net = new Network(), a = createDevice(net, 'host'), b = createDevice(net, 'switch'), router = createDevice(net, 'router');
  const link = net.connect(a.id, b.id); net.connect(router.id, createDevice(net, 'host').id);
  router.interfaces[1].up = false;
  const draft = { id: link.id, end: 'b' as const };
  expect(firstReconnectInterface(net, draft, router.id)?.name).toBe('eth1');
  expect(firstReconnectInterface(net, draft, a.id)).toBeNull();
  const occupied = createDevice(net, 'host'); net.connect(occupied.id, b.id);
  expect(firstReconnectInterface(net, draft, occupied.id)).toBeNull();
  expect(reconnectTargetError(net, draft, occupied.id)).toContain('keine freie');
  const phone = createDevice(net, 'smartphone');
  expect(firstReconnectInterface(net, draft, phone.id)).toBeNull();
  expect(reconnectTargetError(net, draft, phone.id)).toContain('keine Ethernet');
  expect(firstReconnectInterface(net, draft, 'missing')).toBeNull();
});

it.each(['a', 'b'] as const)('accepts the original endpoint %s and prioritizes its exact port over other free interfaces', end => {
  const net = new Network(), host = createDevice(net, 'host'), sw = createDevice(net, 'switch');
  const link = net.connect(host.id, sw.id, { bIface: 'eth7' });
  const original = link[end];
  expect(firstReconnectInterface(net, { id: link.id, end }, original.device.id)).toBe(original);
  expect(firstReconnectInterface(net, { id: link.id, end }, link[end === 'a' ? 'b' : 'a'].device.id)).toBeNull();
});
