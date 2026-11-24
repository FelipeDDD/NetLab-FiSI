import { afterEach, expect, it } from 'vitest';
import { PacketCapture } from './packetCapture';
import { packetPath } from './packetPath';
import { simulatedInternet } from './labs/simulatedInternet';
import { restoreNetwork, type SaveFile } from './engine/serialize';
import { disposeNetwork } from './engine/networkLifecycle';
import type { IpDevice } from './engine/ipdevice';
import { parseIp } from './engine/ip';
import { requestPage, simulatedUrl } from './browser/request';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });

function setup(change?: (file: SaveFile) => void) {
  const file = structuredClone(simulatedInternet);
  change?.(file);
  const net = restoreNetwork(file), capture = new PacketCapture(() => {});
  capture.start();
  net.onWireTransfer = (t, c, v) => capture.observe(t, c, v?.parentTransferId, v, net.packetTrace?.responseId(c.frame.payload));
  net.observeDecisions(capture.recordDecision);
  cleanup.push(() => { capture.reset(); disposeNetwork(net); });
  const host = (id: string) => net.devices.get(id) as IpDevice;
  const finish = () => { net.scheduler.advanceTo(net.now + 20000); capture.stop(); };
  const send = (dst = '198.51.100.10', ttl = 64) => host('PC1').sendEcho(parseIp(dst)!, 51, 1, ttl);
  const selectedPath = (source: string, protocol: 'icmp' | 'tcp') => {
    const first = capture.state.records.find(p => p.fromDeviceId === source && p.kind === protocol)!;
    return packetPath(capture.state.records, first.id);
  };
  const events = (source = 'PC1', protocol: 'icmp' | 'tcp' = 'icmp') =>
    selectedPath(source, protocol).flatMap(p => capture.state.evidence?.get(p.id) ?? []);
  return { net, capture, send, finish, selectedPath, events, host };
}

it('follows the local exchange through its switch and distinguishes actual delivery from send time', () => {
  const f = setup();
  f.send('192.168.10.20'); f.finish();
  const hops = f.selectedPath('PC1', 'icmp').filter(p => p.kind === 'icmp');
  expect(hops.map(p => p.toDeviceId)).toEqual(['LAN Switch', 'PC2', 'LAN Switch', 'PC1']);
  expect(f.events()).toContainEqual({ deviceId: 'PC2', fact: { kind: 'local' } });
  for (const p of hops) expect(f.capture.state.evidence?.get(p.id)).toContainEqual({ deviceId: p.toDeviceId, fact: { kind: 'received' } });
});

it('separates concurrent real HTTP exchanges through two routers, two switches and a modem including PAT allocation', () => {
  const f = setup(), results: string[] = [];
  for (const id of ['PC1', 'PC2']) requestPage(f.host(id), simulatedUrl('http://198.51.100.10')!, r => {
    if (r.kind === 'http' && r.status === 200) results.push(id);
  });
  f.finish();
  expect(results.sort()).toEqual(['PC1', 'PC2']);
  const roots = ['PC1', 'PC2'].map(source => f.selectedPath(source, 'tcp'));
  const firstIds = new Set(roots[0].map(p => p.id));
  expect(roots[1].some(p => firstIds.has(p.id))).toBe(false);
  const ports = roots.map((path, i) => {
    const facts = f.events(i ? 'PC2' : 'PC1', 'tcp');
    expect(path.filter(p => p.kind === 'tcp').slice(0, 6).map(p => p.toDeviceId))
      .toEqual(['LAN Switch', 'Router', 'Modem', 'Provider', 'External Switch', 'Web Server']);
    expect(facts).toContainEqual(expect.objectContaining({ deviceId: 'Router', fact: expect.objectContaining({
      kind: 'route', nextHop: parseIp('192.0.2.1'), route: expect.objectContaining({ ifaceName: 'eth1', prefix: 0 }),
    }) }));
    const nat = facts.map(e => e.fact).find(e => e.kind === 'nat' && e.rule.includes('masquerade'));
    if (nat?.kind !== 'nat') throw Error('Missing applied NAT rule');
    expect(nat.before.srcIp).toBe(parseIp(i ? '192.168.10.20' : '192.168.10.10'));
    expect(nat.after.srcIp).toBe(parseIp('192.0.2.2'));
    expect(facts.some(e => e.fact.kind === 'nat' && e.fact.rule === 'Conntrack' && e.fact.after.dstIp === nat.before.srcIp)).toBe(true);
    return nat.after.srcPort;
  });
  expect(new Set(ports).size).toBe(2);
});

it.each(['noRoute', 'arpTimeout', 'ttl', 'linkDown', 'firewall', 'return'] as const)('records the actual decision for %s', failure => {
  const f = setup(file => {
    const router = file.devices.find(d => d.id === 'Router')!;
    if (failure === 'noRoute') router.routes = [];
    if (failure === 'return') router.firewall!.nat.postrouting!.rules = [];
    if (failure === 'firewall') {
      router.firewall!.tables.filter = true;
      router.firewall!.filter.forward = { name: 'policy_forward', policy: 'drop', rules: [] };
    }
  });
  if (failure === 'linkDown') f.net.disconnect('internet-link-4');
  f.send(failure === 'arpTimeout' ? '198.51.100.99' : undefined, failure === 'ttl' ? 1 : 64);
  f.finish();
  const facts = f.events();
  if (failure === 'firewall') expect(facts).toContainEqual({ deviceId: 'Router', fact: {
    kind: 'firewall', chain: 'policy_forward', verdict: 'drop', rule: 'policy drop',
  } });
  else {
    const expected = failure === 'return' ? 'noRoute' : failure;
    expect(facts.some(e => e.fact.kind === 'drop' && e.fact.reason === expected &&
      e.deviceId === (failure === 'return' || failure === 'arpTimeout' ? 'Provider' : failure === 'linkDown' ? 'Modem' : 'Router'))).toBe(true);
  }
  if (failure === 'return') {
    expect(facts).toContainEqual({ deviceId: 'Web Server', fact: { kind: 'local' } });
    expect(facts.some(e => e.fact.kind === 'nat')).toBe(false);
  }
});

it('records local delivery and a failed attempt to reply when the server has no return route', () => {
  const f = setup(file => {
    delete file.devices.find(d => d.id === 'Web Server')!.ifaces[0].gateway;
  });
  f.send(); f.finish();
  const delivered = f.selectedPath('PC1', 'icmp').find(p => p.toDeviceId === 'Web Server' && p.kind === 'icmp')!;
  expect(f.capture.state.evidence!.get(delivered.id)).toEqual(expect.arrayContaining([
    { deviceId: 'Web Server', fact: { kind: 'local' } },
    { deviceId: 'Web Server', fact: { kind: 'drop', reason: 'replyNoRoute', detail: '192.0.2.2' } },
  ]));
  expect(f.capture.state.records.some(p => p.responseTo === delivered.id)).toBe(false);
});

it('stopping before arrival leaves reception unknown, and clearing or retention removes old decisions', () => {
  const f = setup();
  f.send();
  f.capture.stop();
  const first = f.capture.state.records[0];
  f.net.scheduler.advanceTo(10000);
  expect(f.capture.state.evidence?.get(first.id)).toEqual([]);
  f.capture.clear();
  expect(packetPath(f.capture.state.records, first.id)).toEqual([]);
  f.capture.start();
  for (let i = 0; i < 550; i++) f.host('PC1').sendEcho(parseIp('192.168.10.20')!, i, 1);
  f.finish();
  expect(f.capture.state.discarded).toBeGreaterThan(0);
  expect(f.capture.state.evidence?.size).toBeLessThanOrEqual(1000);
  expect(f.capture.state.evidence?.has(first.id)).toBe(false);
  expect([...f.capture.state.evidence!.keys()]).toEqual(f.capture.state.records.map(p => p.id));
});
