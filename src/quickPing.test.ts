import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { Host, RouterDevice } from './engine/ipdevice';
import { parseCidr } from './engine/ip';
import { pingAddresses, preferredPingAddress, quickPingCommand } from './quickPing';

it('deduplicates usable configured IPv4 addresses without inventing connectivity', () => {
  const net = new Network(), router = new RouterDevice(net, 'r', 'RouterDevice');
  router.interfaces[0].ip = parseCidr('10.0.0.1/24');
  router.interfaces[1].ip = parseCidr('10.0.0.1/24');
  router.interfaces[1].up = false;
  router.interfaces[2].ip = parseCidr('224.0.0.1/24');
  router.interfaces[3].ip = parseCidr('10.0.0.255/24');
  expect(pingAddresses(router)).toEqual([{address:'10.0.0.1', interfaces:['eth0','eth1']}]);
  expect(pingAddresses(undefined)).toEqual([]);
});
it('always requires a choice for multiple addresses, even with exactly one in the source subnet', () => {
  const net = new Network(), source = new Host(net, 'a', 'PC'), target = new RouterDevice(net, 'r', 'RouterDevice');
  target.interfaces[0].ip = parseCidr('10.0.0.1/24');
  target.interfaces[1].ip = parseCidr('192.0.2.1/24');
  expect(preferredPingAddress(source, target)).toBeNull();
  source.interfaces[0].ip = parseCidr('10.0.0.2/24');
  expect(preferredPingAddress(source, target)).toBeNull();
  // A later attempt has the same complete set; there is no remembered preference.
  expect(pingAddresses(target).map(a => a.address)).toEqual(['10.0.0.1', '192.0.2.1']);
  expect(preferredPingAddress(source, target)).toBeNull();
  target.interfaces[2].ip = parseCidr('10.0.0.3/24');
  expect(preferredPingAddress(source, target)).toBeNull();
  expect(quickPingCommand(source, '192.0.2.1')).toBe('ping -c 4 192.0.2.1');
  source.os='windows'; expect(quickPingCommand(source, '192.0.2.1')).toBe('ping -n 4 192.0.2.1');
});

it('automatically selects only one distinct usable address, preserving all interface labels', () => {
  const net = new Network(), source = new Host(net, 'a', 'PC'), target = new RouterDevice(net, 'r', 'Router');
  source.interfaces[0].ip = parseCidr('192.0.2.10/24');
  target.interfaces[0].ip = parseCidr('10.0.0.1/24');
  target.interfaces[1].ip = parseCidr('10.0.0.1/24');
  target.interfaces[2].ip = parseCidr('10.0.0.255/24');
  expect(preferredPingAddress(source, target)).toBe('10.0.0.1');
  expect(pingAddresses(target)).toEqual([{ address: '10.0.0.1', interfaces: ['eth0', 'eth1'] }]);
  target.interfaces[0].ip = null;
  target.interfaces[1].ip = null;
  expect(preferredPingAddress(source, target)).toBeNull();
});
