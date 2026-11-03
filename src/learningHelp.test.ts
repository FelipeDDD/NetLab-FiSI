import { expect, it, vi } from 'vitest';
import { IPV4_HELP_COMMANDS } from './components/LearningHelp';
import { Shell } from './commands/shell';
import { Network } from './engine/network';
import { RouterDevice } from './engine/ipdevice';
import { parseIp } from './engine/ip';

it('the IPv4 help examples run in the supported shell/CMD subset', () => {
  const device = new RouterDevice(new Network(), 'example', 'Example');
  const write = vi.fn(), done = vi.fn(), shell = new Shell(device);
  shell.exec(IPV4_HELP_COMMANDS.add, { write }, done, 'linux');
  expect(write).not.toHaveBeenCalled();
  expect(device.getInterface('eth0')?.ip).toEqual({ addr: parseIp('192.168.10.10'), prefix: 24 });
  expect(device.getInterface('eth0')?.gateway).toBeNull();
  expect(device.getInterface('eth0')?.dns).toBeNull();
  shell.exec(IPV4_HELP_COMMANDS.show, { write }, done, 'linux');
  expect(write.mock.calls.flat().join('')).toContain('192.168.10.10/24');
  write.mockClear();
  shell.exec(IPV4_HELP_COMMANDS.windows, { write }, done, 'windows');
  expect(write.mock.calls.flat().join('')).toContain('192.168.10.10');
  expect(write.mock.calls.flat().join('')).toContain('255.255.255.0');
});

it('the documented Linux add limitation preserves an already configured interface', () => {
  const device = new RouterDevice(new Network(), 'example', 'Example');
  device.addIp('eth0', parseIp('192.168.20.10')!, 24);
  const write = vi.fn();
  new Shell(device).exec(IPV4_HELP_COMMANDS.add, { write }, vi.fn(), 'linux');
  expect(write.mock.calls.flat().join('')).toContain('one address per interface');
  expect(device.getInterface('eth0')?.ip?.addr).toBe(parseIp('192.168.20.10'));
});
