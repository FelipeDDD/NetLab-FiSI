import { describe, expect, it } from 'vitest';
import { PRACTICAL_EXERCISES, practicalChecks } from '../exercises/beta';
import { runPracticalChecks } from '../exercises/practicalChecker';
import type { CheckResult } from '../labs/checker';
import { RouterDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { Shell } from './shell';

function westFixture() {
  const exercise = PRACTICAL_EXERCISES.find(e => e.id === 'pilot-d02-v1')!;
  const net = restoreNetwork(structuredClone(exercise.student.initialTopology));
  const west = net.devices.get('west');
  if (!(west instanceof RouterDevice)) throw Error('D02 West router missing');
  const execute = (command: string) => {
    let output = '';
    let completed = false;
    new Shell(west).exec(command, { write: text => { output += text; } }, () => { completed = true; });
    expect(completed).toBe(true);
    return output;
  };
  return { net, west, execute };
}

describe('static route destination normalization', () => {
  it('replaces an equivalent destination in place and creates missing routes', () => {
    const { net, west, execute } = westFixture();
    try {
      expect(execute('ip route add 192.0.2.0/24 dev eth0')).toBe('');
      expect(execute('ip route add 10.72.2.10/27 via 10.72.254.1 dev eth0')).toBe('');
      expect(execute('ip route add 198.51.100.0/24 dev eth1')).toBe('');
      expect(execute('ip route replace 10.72.2.31/27 via 10.72.254.2 dev eth1')).toBe('');
      expect(west.staticRoutes.map(r => [r.dest, r.prefix, r.via, r.ifaceName])).toEqual([
        [parseIp('192.0.2.0'), 24, null, 'eth0'],
        [parseIp('10.72.2.0'), 27, parseIp('10.72.254.2'), 'eth1'],
        [parseIp('198.51.100.0'), 24, null, 'eth1'],
      ]);
      expect(execute('ip route replace 203.0.113.10/24 dev eth1')).toBe('');
      expect(west.staticRoutes.at(-1)).toMatchObject({ dest: parseIp('203.0.113.0'), prefix: 24, ifaceName: 'eth1' });
    } finally { disposeNetwork(net); }
  });

  it('replaces default and /0 without changing the interface gateway or connected route', () => {
    const { net, west, execute } = westFixture();
    try {
      const iface = west.getInterface('eth0')!;
      iface.gateway = parseIp('10.72.1.254');
      const connected = west.routes().filter(r => r.kind === 'connected');
      expect(execute('ip route replace default via 10.72.254.1 dev eth0')).toBe('');
      expect(execute('ip route replace 192.0.2.1/0 via 10.72.254.2 dev eth1')).toBe('');
      expect(west.staticRoutes).toHaveLength(1);
      expect(west.staticRoutes[0]).toMatchObject({ dest: 0, prefix: 0, via: parseIp('10.72.254.2'), ifaceName: 'eth1' });
      expect(iface.gateway).toBe(parseIp('10.72.1.254'));
      expect(west.routes().filter(r => r.kind === 'connected')).toEqual(connected);
    } finally { disposeNetwork(net); }
  });

  it('preserves existing routes when validation fails or saved duplicates are ambiguous', () => {
    const { net, west, execute } = westFixture();
    try {
      expect(execute('ip route add 10.72.2.0/27 via 10.72.254.2 dev eth1')).toBe('');
      const before = structuredClone(west.staticRoutes);
      expect(execute('ip route replace 10.72.2.10/27 via 10.72.254.2 dev missing')).toContain('Cannot find device');
      expect(execute('ip route replace 10.72.2.10/27 via 192.0.2.1')).toContain('Nexthop has invalid gateway');
      expect(west.staticRoutes).toEqual(before);
      west.staticRoutes.push({ ...west.staticRoutes[0], ifaceName: 'eth0' });
      const duplicated = structuredClone(west.staticRoutes);
      expect(execute('ip route replace 10.72.2.31/27 via 10.72.254.2 dev eth1'))
        .toBe('Error: multiple static routes match this destination; remove duplicates before replace.\n');
      expect(west.staticRoutes).toEqual(duplicated);
      const restored = restoreNetwork(JSON.parse(JSON.stringify(serializeNetwork(net, {}))));
      try {
        const copy = restored.devices.get('west') as RouterDevice;
        let output = '';
        new Shell(copy).exec('ip route replace 10.72.2.1/27 dev eth1', { write: text => { output += text; } }, () => {});
        expect(output).toContain('remove duplicates before replace');
        expect(copy.staticRoutes).toEqual(duplicated);
      } finally { disposeNetwork(restored); }
      expect(execute('ip route append 10.72.2.0/27 dev eth1')).toContain('not supported');
      expect(execute('ip route change 10.72.2.0/27 dev eth1')).toContain('not supported');
      expect(execute('help')).toContain('add|replace');
      expect(west.staticRoutes).toEqual(duplicated);
    } finally { disposeNetwork(net); }
  });

  it.each([
    ['10.72.2.0/27', 'eth0', '10.72.2.10/27', 'eth1'],
    ['10.72.2.10/27', 'eth1', '10.72.2.0/27', 'eth0'],
  ])('rejects an equivalent destination (%s on %s, then %s on %s)', (first, firstDev, second, secondDev) => {
    const { net, west, execute } = westFixture();
    try {
      expect(execute(`ip route add ${first} via 10.72.254.2 dev ${firstDev}`)).toBe('');
      expect(execute(`ip route add ${second} via 10.72.254.2 dev ${secondDev}`)).toBe('RTNETLINK answers: File exists\n');
      expect(execute(`ip route add ${second} via 10.72.254.1 dev ${firstDev}`)).toBe('RTNETLINK answers: File exists\n');
      const routes = west.staticRoutes.filter(r => r.prefix === 27);
      expect(routes).toHaveLength(1);
      expect(routes[0].ifaceName).toBe(firstDev);
      const lines = execute('ip route show').split('\n').filter(line => line.startsWith('10.72.2.0/27 '));
      expect(lines).toEqual([`10.72.2.0/27 via 10.72.254.2 dev ${firstDev}`]);
    } finally { disposeNetwork(net); }
  });

  it('keeps distinct prefixes and host routes, and permits deletion and replacement', () => {
    const { net, execute } = westFixture();
    try {
      expect(execute('ip route add 10.72.2.10/27 via 10.72.254.2 dev eth0')).toBe('');
      expect(execute('ip route add 10.72.2.10/28 via 10.72.254.2 dev eth1')).toBe('');
      expect(execute('ip route add 10.72.2.10 via 10.72.254.2 dev eth1')).toBe('');
      expect(execute('ip route del 10.72.2.31/27')).toBe('');
      expect(execute('ip route add 10.72.2.20/27 via 10.72.254.2 dev eth1')).toBe('');
      const routes = execute('ip route show');
      expect(routes).toContain('10.72.2.0/27 via 10.72.254.2 dev eth1');
      expect(routes).toContain('10.72.2.0/28 via 10.72.254.2 dev eth1');
      expect(routes).toContain('10.72.2.10/32 via 10.72.254.2 dev eth1');
    } finally { disposeNetwork(net); }
  });

  it('normalizes default routes and preserves existing duplicates when loading older documents', () => {
    const { net, west, execute } = westFixture();
    try {
      expect(execute('ip route add 10.72.2.10/0 via 10.72.254.2 dev eth0')).toBe('');
      expect(execute('ip route add default via 10.72.254.2 dev eth1')).toBe('RTNETLINK answers: File exists\n');
      expect(execute('ip route add 192.0.2.1/0 via 10.72.254.2 dev eth1')).toBe('RTNETLINK answers: File exists\n');
      // Older documents may already contain duplicates; loading must not silently remove them.
      west.staticRoutes.push({ ...west.staticRoutes[0], via: parseIp('10.72.254.1'), ifaceName: 'eth1' });
      const saved = JSON.parse(JSON.stringify(serializeNetwork(net, {})));
      const restored = restoreNetwork(saved);
      try {
        const copy = restored.devices.get('west') as RouterDevice;
        expect(copy.staticRoutes).toHaveLength(2);
        expect(copy.addRoute(0, 0, null, 'eth0')).toBe('RTNETLINK answers: File exists');
        expect(copy.lookupRoute(parseIp('203.0.113.10')!)?.ifaceName).toBe('eth0');
        expect(copy.delRoute(parseIp('192.0.2.10')!, 0)).toBeNull();
        expect(copy.staticRoutes).toHaveLength(1);
        expect(copy.staticRoutes[0].ifaceName).toBe('eth1');
        expect(copy.lookupRoute(parseIp('203.0.113.10')!)?.ifaceName).toBe('eth1');
      } finally { disposeNetwork(restored); }
    } finally { disposeNetwork(net); }
  });

  it('preserves working D02 routes and real exercise checks through JSON save/load', () => {
    const { net, execute } = westFixture();
    try {
      expect(execute('ip route add 10.72.2.10/27 via 10.72.254.2 dev eth0')).toBe('');
      expect(execute('ip route replace 10.72.2.0/27 via 10.72.254.2 dev eth1')).toBe('');
      const east = net.devices.get('east');
      if (!(east instanceof RouterDevice)) throw Error('D02 East router missing');
      let output = '';
      new Shell(east).exec('ip route replace 10.72.1.10/26 via 10.72.254.1 dev eth0', { write: text => { output += text; } }, () => {});
      expect(output).toBe('');
      const saved = JSON.parse(JSON.stringify(serializeNetwork(net, {})));
      expect(saved.devices.find((d: { id: string }) => d.id === 'west').routes)
        .toEqual([{ dest: '10.72.2.0/27', via: '10.72.254.2', dev: 'eth1' }]);
      const restored = restoreNetwork(saved);
      try {
        const exercise = PRACTICAL_EXERCISES.find(e => e.id === 'pilot-d02-v1')!;
        const results: CheckResult[] = [];
        let done = false;
        runPracticalChecks(restored, exercise, practicalChecks[exercise.id], r => results.push(r), () => { done = true; }, () => true);
        restored.scheduler.advanceTo(restored.scheduler.now + 120_000);
        expect(done).toBe(true);
        expect(results).toHaveLength(practicalChecks[exercise.id].length);
        expect(results.filter(r => !r.pass)).toEqual([]);
      } finally { disposeNetwork(restored); }
    } finally { disposeNetwork(net); }
  });
});
