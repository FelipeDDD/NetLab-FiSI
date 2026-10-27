import { describe, expect, it } from 'vitest';
import { Shell } from '../commands/shell';
import { IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import type { Network } from '../engine/network';
import { disposeNetwork } from '../engine/networkLifecycle';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { runChecks, type CheckResult } from '../labs/checker';
import { EXERCISE_DRAFTS } from './drafts';
import type { ExerciseDraft } from './types';
import { validateDraftCollection } from './validate';

function results(net: Network, draft: ExerciseDraft): CheckResult[] {
  const rows: CheckResult[] = [];
  let done = false;
  runChecks(net, draft.review.assessments.flatMap(a => a.kind === 'engine' ? [{ id: a.id, label: a.id, check: a.check }] : []),
    r => rows.push(r), () => { done = true; });
  net.scheduler.advanceTo(net.scheduler.now + 120_000);
  expect(done).toBe(true);
  return rows;
}
function ipDevice(net: Network, name: string): IpDevice {
  const d = net.devices.get(name); expect(d).toBeInstanceOf(IpDevice); return d as IpDevice;
}
function solution(draft: ExerciseDraft): Network {
  const net = restoreNetwork(structuredClone(draft.review.reference.topology));
  try {
    for (const command of draft.review.reference.commands) {
      let done = false, output = '';
      new Shell(ipDevice(net, command.device)).exec(command.line, { write: text => { output += text; } }, () => { done = true; });
      net.scheduler.advanceTo(net.scheduler.now + 10_000);
      expect(done, output).toBe(true);
      expect(output).not.toMatch(/unknown command|syntax error|not supported|cannot|failed/i);
    }
    return net;
  } catch (error) { disposeNetwork(net); throw error; }
}

it('validates all five independent, JSON-roundtrippable draft documents without mutation', () => {
  const before = JSON.stringify(EXERCISE_DRAFTS);
  expect(EXERCISE_DRAFTS).toHaveLength(5);
  expect(validateDraftCollection(JSON.parse(before))).toEqual([]);
  expect(JSON.stringify(EXERCISE_DRAFTS)).toBe(before);
});

describe.each(EXERCISE_DRAFTS)('$id', draft => {
  it('does not pass all final probes in the starting configuration', () => {
    const net = restoreNetwork(structuredClone(draft.student.initialTopology));
    try { expect(results(net, draft).some(r => !r.pass)).toBe(true); }
    finally { disposeNetwork(net); }
  });
  it('passes every available probe with the real engine reference solution', () => {
    const net = solution(draft);
    try { expect(results(net, draft).filter(r => !r.pass)).toEqual([]); }
    finally { disposeNetwork(net); }
  });
  it('round-trips the reference permanent configuration through the existing serializer', () => {
    const net = solution(draft);
    try {
      const snapshot = serializeNetwork(net, {}), restored = restoreNetwork(JSON.parse(JSON.stringify(snapshot)));
      try {
        expect(serializeNetwork(restored, {})).toEqual(snapshot);
        // DHCP origin is transient: renew explicitly instead of pretending the saved IP proves a lease.
        if (draft.category !== 'dhcp') expect(results(restored, draft).filter(r => !r.pass)).toEqual([]);
      } finally { disposeNetwork(restored); }
    } finally { disposeNetwork(net); }
  });
});

it('accepts alternate free /27 addresses and rejects a wrong prefix', () => {
  const draft = EXERCISE_DRAFTS[0], net = solution(draft);
  try {
    ipDevice(net, 'annahme').getInterface('eth0')!.ip = parseCidr('172.20.8.50/27');
    ipDevice(net, 'werkstatt').getInterface('eth0')!.ip = parseCidr('172.20.8.51/27');
    expect(results(net, draft).every(r => r.pass)).toBe(true);
    ipDevice(net, 'annahme').getInterface('eth0')!.ip = parseCidr('172.20.8.50/24');
    expect(results(net, draft).find(r => r.id === 'ip-annahme')?.pass).toBe(false);
  } finally { disposeNetwork(net); }
});

it('accepts default routes instead of specific routes; rejects missing return route or forwarding', () => {
  const draft = EXERCISE_DRAFTS[1], net = solution(draft);
  try {
    const a = ipDevice(net, 'buero'), b = ipDevice(net, 'lager');
    a.staticRoutes.length = b.staticRoutes.length = 0;
    a.addRoute(0, 0, parseIp('10.44.0.1')!); b.addRoute(0, 0, parseIp('10.44.0.65')!);
    expect(results(net, draft).every(r => r.pass)).toBe(true);
    b.staticRoutes.length = 0;
    expect(results(net, draft).find(r => r.id === 'outbound')?.pass).toBe(false);
    ipDevice(net, 'r1').forwarding = false;
    expect(results(net, draft).find(r => r.id === 'forwarding')?.pass).toBe(false);
  } finally { disposeNetwork(net); }
});

it('obtains a real DHCP lease, but does not mislabel generic IP checks as proof of DHCP', () => {
  const draft = EXERCISE_DRAFTS[2], net = solution(draft);
  try {
    const client = ipDevice(net, 'gast').getInterface('eth0')!, pool = ipDevice(net, 'r1').dhcpPools.get('eth0')!;
    expect(client.ipv4Mode).toBe('dhcp');
    expect(client.ip!.addr).toBeGreaterThanOrEqual(parseIp('192.168.77.10')!);
    expect(client.ip!.addr).toBeLessThanOrEqual(parseIp('192.168.77.20')!);
    expect(pool.leases.get(client.mac)).toBe(client.ip!.addr);
    expect(ipDevice(net, 'gast').nameserver).toBe(parseIp('192.168.77.2'));
    client.configureIpv4({ mode: 'static', ip: client.ip, gateway: client.gateway, dns: client.dns });
    expect(results(net, draft).every(r => r.pass)).toBe(true); // Deliberate counterexample: manual gate is essential.
    expect(draft.review.assessments.some(a => a.kind === 'manual' && a.requirementId === 'lease')).toBe(true);
  } finally { disposeNetwork(net); }
});

it('rejects DNS-only and numeric-IP-only repairs', () => {
  const draft = EXERCISE_DRAFTS[3], net = solution(draft);
  try {
    ipDevice(net, 'portal').httpServer!.enabled = false;
    expect(results(net, draft).find(r => r.id === 'page')?.pass).toBe(false);
    ipDevice(net, 'portal').httpServer!.enabled = true;
    ipDevice(net, 'servicepc').nameserver = null;
    expect(results(net, draft).filter(r => ['lookup', 'page'].includes(r.id)).every(r => !r.pass)).toBe(true);
  } finally { disposeNetwork(net); }
});

it('accepts an alternative DNS server without prescribing the reference placement', () => {
  const draft = EXERCISE_DRAFTS[3], net = solution(draft);
  try {
    ipDevice(net, 'dns1').dnsServer!.enabled = false;
    ipDevice(net, 'portal').dnsServer = { enabled: true, records: new Map([['portal.intern', parseIp('10.63.5.80')!]]) };
    ipDevice(net, 'servicepc').nameserver = parseIp('10.63.5.80');
    expect(results(net, draft).every(r => r.pass)).toBe(true);
  } finally { disposeNetwork(net); }
});

it('accepts an equivalent nftables reference instead of matching iptables command text', () => {
  const draft = structuredClone(EXERCISE_DRAFTS[4]);
  draft.review.reference.commands = [
    'nft add chain ip filter forward { type filter hook forward priority 0 ; policy drop ; }',
    'nft add rule ip filter forward ct state established,related accept',
    'nft add rule ip filter forward ip saddr 10.91.1.0/24 ip daddr 10.91.2.20 tcp dport 80 ct state new accept',
  ].map(line => ({ device: 'fw1', line }));
  const net = solution(draft);
  try { expect(results(net, draft).every(r => r.pass)).toBe(true); }
  finally { disposeNetwork(net); }
});

it('keeps firewall negative probes meaningful with live listeners and positive HTTP control', () => {
  const draft = EXERCISE_DRAFTS[4], net = solution(draft);
  try {
    expect(ipDevice(net, 'intranet').services.tcp.has(22)).toBe(true);
    expect(ipDevice(net, 'intranet').services.tcp.has(2345)).toBe(true);
    expect(results(net, draft).every(r => r.pass)).toBe(true);
    net.disconnect('cable-2');
    expect(results(net, draft).find(r => r.id === 'web')?.pass).toBe(false);
  } finally { disposeNetwork(net); }
});

describe('development validator rejects malformed proposals', () => {
  const cases: [string, (d: any) => void][] = [
    ['missing field', d => { delete d.student.task; }],
    ['published status', d => { d.status = 'published'; }],
    ['unknown objective', d => { d.student.requirements[0].objectiveIds = ['missing']; }],
    ['unknown requirement', d => { d.review.assessments[0].requirementId = 'missing'; }],
    ['unknown checker', d => { d.review.assessments[0].check.type = 'dhcp-proof'; }],
    ['bad expectation', d => { d.review.assessments[4].check.expect = 'maybe'; }],
    ['unknown check interface', d => { d.review.assessments[0].check.iface = 'eth99'; }],
    ['unknown check device', d => { d.review.assessments[0].check.device = 'sw1'; }],
    ['bad subnet', d => { d.review.assessments[0].check.inSubnet = '172.20.8.40/27'; }],
    ['bad IPv4', d => { d.student.initialTopology.devices[0].ifaces[0].ip = '300.1.1.1/24'; }],
    ['missing endpoint', d => { d.student.initialTopology.links[0].a[1] = 'eth99'; }],
    ['occupied endpoint', d => { d.student.initialTopology.links[1].b = [...d.student.initialTopology.links[0].b]; }],
    ['invalid route interface', d => { d.student.initialTopology.devices[0].routes.push({ dest: '0.0.0.0/0', via: '172.20.8.35', dev: 'eth99' }); }],
    ['missing device name', d => { d.student.initialTopology.devices[1].name = ''; }],
    ['missing ID lookup contract', d => { delete d.review.assessments[0].check.resolveBy; }],
    ['name lookup contract', d => { d.review.assessments[0].check.resolveBy = 'name'; }],
    ['historical probe', d => { d.student.requirements[0].evidence = 'historical'; }],
    ['invalid reference endpoint', d => { d.review.reference.topology.links[0].a[1] = 'eth99'; }],
    ['invalid command device', d => { d.review.reference.commands = [{ device: 'sw1', line: 'dhclient' }]; }],
  ];
  it.each(cases)('%s', (_, mutate) => {
    const draft = structuredClone(EXERCISE_DRAFTS[0]); mutate(draft);
    expect(validateDraftCollection([draft])).toHaveLength(1);
  });
  it('rejects duplicate IDs and empty/non-array collections', () => {
    expect(validateDraftCollection([EXERCISE_DRAFTS[0], EXERCISE_DRAFTS[0]])[0]).toContain('duplicate exercise ID');
    expect(validateDraftCollection([])).not.toEqual([]); expect(validateDraftCollection(null)).not.toEqual([]);
  });
  it('rejects incompatible or overlapping DHCP pools through the existing pool validator', () => {
    const draft = structuredClone(EXERCISE_DRAFTS[2]);
    draft.student.initialTopology.devices.find(d => d.id === 'r1')!.dhcpPools!.eth0.rangeEnd = '192.168.78.20';
    expect(validateDraftCollection([draft])).toHaveLength(1);
  });
});
