import { describe, expect, it } from 'vitest';
import { createDevice } from '../engine/factory';
import { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { disposeNetwork } from '../engine/networkLifecycle';
import { runChecks, type CheckResult } from './checker';
import type { Check } from './types';

function fixture() {
  const net = new Network();
  const source = createDevice(net, 'host', { id: 'source-id', name: 'Arbeitsplatz Büro 🖥' }) as IpDevice;
  const target = createDevice(net, 'server', { id: 'target-id', name: 'Servidor de destino 東京' }) as IpDevice;
  source.interfaces[0].ip = parseCidr('10.80.0.10/24');
  target.interfaces[0].ip = parseCidr('10.80.0.20/24');
  net.connect(source.id, target.id);
  source.addRoute(0, 0, parseIp('10.80.0.20')!);
  source.forwarding = true;
  source.fw.filter.output.declared = true;
  source.fw.filter.output.policy = 'accept';
  source.nameserver = parseIp('10.80.0.20');
  target.services.tcp.add(22);
  target.dnsServer = { enabled: true, records: new Map([['ziel.intern', parseIp('10.80.0.20')!]]) };
  target.httpServer = { enabled: true, port: 80, body: 'Identität bleibt erhalten' };
  return { net, source, target };
}
const checks: Check[] = [
  { type: 'iface-ip', device: 'source-id', iface: 'eth0', cidr: '10.80.0.10/24' },
  { type: 'default-route', device: 'source-id', via: '10.80.0.20' },
  { type: 'forwarding', device: 'source-id', expect: true },
  { type: 'fw-policy', device: 'source-id', hook: 'output', policy: 'accept' },
  { type: 'ping', from: 'source-id', toDevice: 'target-id', expect: 'success' },
  { type: 'tcp', from: 'source-id', toDevice: 'target-id', port: 22, expect: 'open' },
  { type: 'dns', from: 'source-id', name: 'ziel.intern', expect: 'resolves', addr: '10.80.0.20' },
  { type: 'http', from: 'source-id', url: 'http://ziel.intern/', expect: 'ok', contains: 'Identität bleibt erhalten' },
].map(c => ({ ...c, resolveBy: 'id' }) as Check);

function run(net: Network, items: Check[]) {
  const rows: CheckResult[] = []; let done = false;
  runChecks(net, items.map((check, i) => ({ id: String(i), label: '', check })), r => rows.push(r), () => { done = true; });
  net.scheduler.advanceTo(net.scheduler.now + 90_000);
  expect(done).toBe(true); expect(rows).toHaveLength(items.length); return rows;
}

describe('shared checker stable device identities', () => {
  it('resolves all eight check types by ID with unrelated Unicode display names', () => {
    const { net, source, target } = fixture();
    try {
      expect(run(net, checks).filter(r => !r.pass)).toEqual([]);
      source.name = 'Office-PC / Paulo'; target.name = 'Büro';
      expect(run(net, checks).filter(r => !r.pass)).toEqual([]);
      expect([source.id, target.id]).toEqual(['source-id', 'target-id']);
    } finally { disposeNetwork(net); }
  });
  it('never substitutes a same-named device for a deleted required source', () => {
    const { net } = fixture();
    try {
      net.removeDevice('source-id');
      createDevice(net, 'host', { id: 'impostor', name: 'source-id' });
      expect(run(net, checks).every(r => !r.pass)).toBe(true);
    } finally { disposeNetwork(net); }
  });
  it('does not resolve missing ping/TCP targets by display name, including negative probes', () => {
    const { net, source } = fixture();
    try {
      net.removeDevice('target-id');
      const impostor = createDevice(net, 'server', { id: 'impostor', name: 'target-id' }) as IpDevice;
      impostor.interfaces[0].ip = parseCidr('10.80.0.20/24'); impostor.services.tcp.add(22); net.connect(source.id, impostor.id);
      expect(run(net, [
        { resolveBy: 'id', type: 'ping', from: source.id, toDevice: 'target-id', expect: 'success' },
        { resolveBy: 'id', type: 'ping', from: source.id, toDevice: 'target-id', expect: 'fail' },
        { resolveBy: 'id', type: 'tcp', from: source.id, toDevice: 'target-id', port: 22, expect: 'open' },
        { resolveBy: 'id', type: 'tcp', from: source.id, toDevice: 'target-id', port: 22, expect: 'filtered' },
      ]).every(r => !r.pass)).toBe(true);
    } finally { disposeNetwork(net); }
  });
  it('preserves legacy name lookup, even when a different device owns the matching internal ID', () => {
    const { net, source } = fixture();
    try {
      const other = createDevice(net, 'host', { id: source.name, name: 'Other display name' }) as IpDevice;
      other.interfaces[0].ip = parseCidr('10.90.0.99/24');
      const legacy: Check = { type: 'iface-ip', device: source.name, iface: 'eth0', cidr: '10.80.0.10/24' };
      expect(run(net, [legacy, { ...legacy, resolveBy: 'name' }]).every(r => r.pass)).toBe(true);
      source.name = 'renamed';
      expect(run(net, [legacy])[0].pass).toBe(false);
    } finally { disposeNetwork(net); }
  });
});
