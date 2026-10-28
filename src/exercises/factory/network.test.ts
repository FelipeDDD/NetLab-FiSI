import { describe, expect, it } from 'vitest';
import { restoreNetwork, serializeNetwork, type SaveFile } from '../../engine/serialize';
import { disposeNetwork } from '../../engine/networkLifecycle';
import { runChecks, type CheckResult } from '../../labs/checker';
import { PRACTICAL_DRAFTS } from './practical';
import { ROUTING_DRAFTS } from './routing';
import { device, referenceAddressIssues, route, setAddress } from './networkTools';
import type { NetworkDraft } from './types';

const drafts = [...PRACTICAL_DRAFTS, ...ROUTING_DRAFTS];
function probes(d: NetworkDraft, file: SaveFile) {
  const net = restoreNetwork(structuredClone(file));
  try {
    const results: CheckResult[] = []; let done = false;
    runChecks(net, d.review.assessments.flatMap(a => a.kind === 'engine' ? [{ id: a.id, label: a.id, check: a.check }] : []),
      r => results.push(r), () => { done = true; });
    net.scheduler.advanceTo(net.scheduler.now + 120_000);
    expect(done).toBe(true);
    expect(results.length).toBe(d.review.assessments.filter(a => a.kind === 'engine').length);
    return results;
  } finally { disposeNetwork(net); }
}
function failures(d: NetworkDraft, file = d.review.reference.topology) { return probes(d, file).filter(r => !r.pass); }
describe.each(drafts)('$id', d => {
  it('runs every reference probe in an isolated real simulation, with valid unique host addresses', () => {
    expect(referenceAddressIssues(d.review.reference.topology)).toEqual([]);
    expect(failures(d)).toEqual([]);
  });
  it('keeps the initial fault detectable, without pretending probes prove uniqueness', () => {
    if (d.id.endsWith('adresskonflikt')) {
      expect(referenceAddressIssues(d.student.initialTopology).join(' ')).toContain('doppelte');
      expect(d.review.assessments.some(a => a.kind === 'manual')).toBe(true);
    } else expect(failures(d, d.student.initialTopology).length).toBeGreaterThan(0);
  });
  it('round-trips permanent reference data and still passes after restoration', () => {
    const net = restoreNetwork(structuredClone(d.review.reference.topology));
    try {
      const saved = serializeNetwork(net, {});
      expect(failures(d, JSON.parse(JSON.stringify(saved)))).toEqual([]);
      const again = restoreNetwork(saved);
      try { expect(serializeNetwork(again, {})).toEqual(saved); }
      finally { disposeNetwork(again); }
    } finally { disposeNetwork(net); }
  });
  it('preserves the initial fault and exact ports through serialization', () => {
    const initial = d.student.initialTopology, net = restoreNetwork(structuredClone(initial));
    try {
      const saved = serializeNetwork(net, {});
      expect(saved.links.map(l => [l.id, l.a, l.b])).toEqual(initial.links.map(l => [l.id, l.a, l.b]));
      expect(saved.devices.map(dev => [dev.id, dev.forwarding, dev.routes, dev.ifaces.map(i => [i.name, i.ip])]))
        .toEqual(initial.devices.map(dev => [dev.id, dev.forwarding, dev.routes, dev.ifaces.map(i => [i.name, i.ip])]));
    } finally { disposeNetwork(net); }
  });
  it('uses immutable IDs even after all display names change or collide', () => {
    const file = structuredClone(d.review.reference.topology);
    file.devices.forEach(dev => { dev.name = 'Umbenannt'; });
    expect(failures(d, file)).toEqual([]);
  });
});
it('detects the wrong mask even while all LAN pings succeed', () => {
  const d = PRACTICAL_DRAFTS[0], rows = probes(d, d.student.initialTopology);
  expect(rows.filter(r => r.id.startsWith('ping-')).every(r => r.pass)).toBe(true);
  expect(rows.find(r => r.id === 'ip-client-a-eth0')?.pass).toBe(false);
});
it('accepts alternate valid addresses for both flexible LAN exercises', () => {
  for (const [index, a, b] of [[1, '10.61.2.170/28', '10.61.2.171/28'], [3, '10.62.5.4/29', '10.62.5.5/29']] as const) {
    const d = PRACTICAL_DRAFTS[index], f = structuredClone(d.review.reference.topology);
    setAddress(f, 'client-a', 0, a); setAddress(f, 'client-b', 0, b);
    expect(referenceAddressIssues(f)).toEqual([]); expect(failures(d, f)).toEqual([]);
  }
});
it('does not confuse a successful ping with a complete grade for address allocation', () => {
  const d = PRACTICAL_DRAFTS[1], f = structuredClone(d.review.reference.topology);
  setAddress(f, 'client-b', 0, '10.61.2.165/28');
  expect(referenceAddressIssues(f).length).toBeGreaterThan(0);
  expect(d.review.assessments.find(a => a.id === 'unique-hosts')?.kind).toBe('manual');
  setAddress(f, 'client-b', 0, '10.61.2.175/28'); expect(referenceAddressIssues(f).length).toBeGreaterThan(0);
  setAddress(f, 'client-b', 0, '10.61.2.190/28'); expect(failures(d, f).some(r => r.id === 'ip-client-b')).toBe(true);
});
it('accepts default-route alternatives but rejects missing return route and disabled forwarding', () => {
  const d = ROUTING_DRAFTS[1], f = structuredClone(d.review.reference.topology);
  device(f, 'west').routes[0].dest = '0.0.0.0/0'; device(f, 'east').routes[0].dest = '0.0.0.0/0';
  expect(failures(d, f)).toEqual([]);
  device(f, 'east').routes = []; expect(failures(d, f).some(r => r.id.startsWith('ping'))).toBe(true);
  const off = structuredClone(d.review.reference.topology); device(off, 'west').forwarding = false;
  expect(failures(d, off).some(r => r.id === 'forward-west')).toBe(true);
});
it('accepts a corrected /32 or specific LAN return route; adding only /27 cannot override the bad /32', () => {
  const d = ROUTING_DRAFTS[3], corrected = structuredClone(d.student.initialTopology);
  device(corrected, 'east').routes.find(r => r.dest.endsWith('/32'))!.via = '10.76.254.1';
  expect(failures(d, corrected)).toEqual([]);
  const specific = structuredClone(d.review.reference.topology); device(specific, 'east').routes[0].dest = '10.76.1.0/27';
  expect(failures(d, specific)).toEqual([]);
  const wrong = structuredClone(d.student.initialTopology); route(wrong, 'east', '10.76.1.0/27', '10.76.254.1');
  const rows = probes(d, wrong);
  expect(rows.find(r => r.id === 'ping-client-a-archive')?.pass).toBe(false);
  expect(rows.find(r => r.id === 'ping-client-b-archive')?.pass).toBe(true);
});
it('rejects firewall policy regression independently of forwarding', () => {
  const d = ROUTING_DRAFTS[2], f = structuredClone(d.review.reference.topology);
  device(f, 'edge').firewall!.filter.forward!.policy = 'drop';
  expect(failures(d, f).some(r => r.id === 'policy-forward')).toBe(true);
  expect(failures(d, f).some(r => r.id.startsWith('ping'))).toBe(true);
});
