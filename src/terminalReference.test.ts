import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { findReference, REFERENCE_CATEGORIES, TERMINAL_REFERENCE } from './terminalReference';
import { Shell } from './commands/shell';
import { Network } from './engine/network';
import { RouterDevice } from './engine/ipdevice';
import { parseIp } from './engine/ip';

it('covers every real shell/CMD command and the terminal-owned clear command', () => {
  for (const os of ['linux', 'windows'] as const) {
    const source = readFileSync(new URL('./commands/' + (os === 'linux' ? 'shell' : 'windows') + '.ts', import.meta.url), 'utf8');
    const commands = [...source.matchAll(/case '([^']+)':/g)].map(m => m[1]);
    if (os === 'linux') commands.push('clear');
    expect([...new Set(TERMINAL_REFERENCE.filter(e => e.os === os).map(e => e.command))].sort())
      .toEqual([...new Set(commands)].sort());
  }
});
it('keeps documentation IDs, real examples and categories complete', () => {
  expect(new Set(TERMINAL_REFERENCE.map(e => e.id)).size).toBe(TERMINAL_REFERENCE.length);
  for (const e of TERMINAL_REFERENCE) {
    expect(REFERENCE_CATEGORIES.some(c => c.id === e.category)).toBe(true);
    expect(e.summary.length).toBeGreaterThan(10);
    expect(e.operations.length).toBeGreaterThan(0);
    for (const op of e.operations) {
      expect(op.example.split(' ')[0]).toBe(e.command);
      expect(op.example).not.toMatch(/[<>\n]/);
      expect(op.syntax).not.toBe('');
      expect(op.description).not.toBe('');
    }
  }
});
it('searches command, topics, examples and parameters while preserving OS/category scope', () => {
  expect(findReference('linux', 'IP ROUTE')).toContain(TERMINAL_REFERENCE.find(e => e.id === 'linux-ip-route'));
  expect(findReference('linux', 'Next Hop').some(e => e.title === 'ip route')).toBe(true);
  expect(findReference('linux', '10.72.254.2').map(e => e.title)).toEqual(['ip route']);
  expect(findReference('linux', 'ARP').every(e => e.os === 'linux')).toBe(true);
  expect(findReference('windows', '', 'routing').map(e => e.title)).toEqual(['route']);
  expect(findReference('windows', 'iptables')).toEqual([]);
  expect(findReference('linux', 'nicht-existierender-befehl')).toEqual([]);
});
it('documents only the implemented Windows route and traceroute subset', () => {
  const examples = findReference('windows', '').flatMap(e => e.operations.map(o => o.example));
  expect(examples).toContain('route print');
  expect(examples.some(e => /^route (add|del|delete)|^traceroute|^ip route|^tracert -/.test(e))).toBe(false);
  expect(examples).toContain('arp -d *');
  expect(findReference('linux', '', 'arp').flatMap(e => e.operations.map(o => o.example))).not.toContain('arp -d *');
});
it('the documented D02 route example works in the existing shell and is not a Windows command', () => {
  const net = new Network(), d = new RouterDevice(net, 'router', 'Router');
  d.addIp('eth0', parseIp('10.72.1.1')!, 26);
  d.addIp('eth1', parseIp('10.72.254.1')!, 30);
  const example = TERMINAL_REFERENCE.find(e => e.id === 'linux-ip-route')!.operations[1].example;
  const write = vi.fn(), done = vi.fn();
  new Shell(d).exec(example, { write }, done);
  expect(write).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledOnce();
  expect(d.staticRoutes).toMatchObject([{ dest: parseIp('10.72.2.0'), prefix: 27, via: parseIp('10.72.254.2'), ifaceName: 'eth1' }]);
  const replacement = TERMINAL_REFERENCE.find(e => e.id === 'linux-ip-route')!.operations.find(o => o.example.startsWith('ip route replace '))!;
  d.staticRoutes[0].ifaceName = 'eth0';
  new Shell(d).exec(replacement.example, { write }, done);
  expect(write).not.toHaveBeenCalled();
  expect(d.staticRoutes).toHaveLength(1);
  expect(d.staticRoutes[0].ifaceName).toBe('eth1');
  write.mockClear();
  new Shell(d).exec('route add 10.72.2.0 mask 255.255.255.224 10.72.254.2', { write }, done, 'windows');
  expect(write).toHaveBeenCalledWith('Usage: route print\n');
  expect(d.staticRoutes).toHaveLength(1);
});
it('firewall examples use accepted syntax and the handle listing really includes handles', () => {
  const net = new Network(), d = new RouterDevice(net, 'router', 'Router');
  const run = (command: string) => {
    let output = '';
    new Shell(d).exec(command, { write: s => { output += s; } }, () => {});
    return output;
  };
  const nft = TERMINAL_REFERENCE.find(e => e.id === 'linux-nft')!;
  const ruleExample = nft.operations.find(o => o.title === 'Regel hinzufügen')!.example;
  for (const command of ['nft add table ip filter', nft.operations[2].example, ruleExample]) expect(run(command)).toBe('');
  expect(run(nft.operations[0].example)).toContain('# handle 1');
  expect(run(nft.operations[4].example)).toBe('');
  expect(run(nft.operations[0].example)).not.toContain('# handle 1');
  expect(run('nft add table ip nat')).toBe('');
  expect(run(nft.operations[5].example)).toBe('');
  expect(run(nft.operations[6].example)).toBe('');
  expect(run('nft add chain ip nat prerouting { type nat hook prerouting priority -100 ; }')).toBe('');
  expect(run(nft.operations[7].example)).toBe('');
  expect(run(nft.operations[8].example)).toBe('');
});
