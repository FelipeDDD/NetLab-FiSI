import { describe, expect, it } from 'vitest';
import { address, allocate, facts, grade, network, prefixForHosts, prefixForMask, requiredHosts, solve, subnet, type MathProblem, type VlsmProblem } from './math';
import { FAMILIES, generate } from './generator';
import { CALCULATION_DRAFTS } from './calculations';

// Independent oracle: BigInt masks/shifts, not engine IP helpers or production division/logarithms.
const integer = (ip: string) => ip.split('.').reduce((n, byte) => (n << 8n) + BigInt(byte), 0n);
const dotted = (n: bigint) => [24n, 16n, 8n, 0n].map(s => Number((n >> s) & 255n)).join('.');
function oracle(cidr: string) {
  const [ip, p] = cidr.split('/'), prefix = Number(p), hostMask = (1n << BigInt(32 - prefix)) - 1n;
  const mask = 0xffffffffn ^ hostMask, start = integer(ip) & mask, end = start | hostMask;
  return { network: dotted(start), broadcast: dotted(end), prefix, mask: dotted(mask),
    first: dotted(start + 1n), last: dotted(end - 1n), addresses: Number(hostMask + 1n), hosts: Number(hostMask - 1n) };
}
function smallest(hosts: number) {
  for (let prefix = 30; prefix >= 0; prefix--) if ((1n << BigInt(32 - prefix)) - 2n >= BigInt(hosts)) return prefix;
  throw new Error('impossible');
}
function independent(p: MathProblem, answer: unknown) {
  if (p.family === 'subnet') {
    const prefix = p.prefix ?? integer(p.givenMask!).toString(2).split('').filter(b => b === '1').length;
    expect(answer).toEqual(oracle(`${p.ip}/${prefix}`));
  }
  if (p.family === 'capacity') {
    const prefix = smallest(p.hosts), f = oracle(`0.0.0.0/${prefix}`);
    expect(answer).toEqual({ prefix, mask: f.mask, hosts: f.hosts });
  }
  if (p.family === 'membership') {
    const n = oracle(p.network), start = integer(n.network), end = integer(n.broadcast);
    expect(answer).toEqual(Object.fromEntries(p.candidates.map(c => {
      const v = integer(c.ip); return [c.id, v === start ? 'network' : v === end ? 'broadcast' : v > start && v < end ? 'host' : 'outside'];
    })));
  }
  if (p.family === 'overlap') {
    const pairs: string[] = [];
    p.networks.forEach((a, i) => p.networks.forEach((b, j) => {
      const x = oracle(a), y = oracle(b);
      if (i < j && integer(x.network) <= integer(y.broadcast) && integer(y.network) <= integer(x.broadcast)) pairs.push(`${i + 1}:${j + 1}`);
    }));
    expect(answer).toEqual({ pairs });
  }
  if (p.family === 'vlsm') {
    const rows = answer as { id: string; cidr: string }[], parent = oracle(p.parent), used = p.reserved.map(oracle);
    expect(rows.map(r => r.id).sort()).toEqual(p.demands.map(d => d.id).sort());
    for (const row of rows) {
      const n = oracle(row.cidr), d = p.demands.find(d => d.id === row.id)!;
      // Integer ceiling independent from Math.ceil(hosts * factor / 100).
      const hosts = Number((BigInt(d.hosts) * BigInt(100 + (d.growthPercent ?? 0)) + 99n) / 100n);
      expect(n.prefix).toBe(smallest(hosts));
      expect(n.hosts).toBeGreaterThanOrEqual(hosts);
      expect(row.cidr).toBe(`${n.network}/${n.prefix}`);
      expect(integer(n.network) >= integer(parent.network) && integer(n.broadcast) <= integer(parent.broadcast)).toBe(true);
      for (const old of used) expect(integer(n.network) > integer(old.broadcast) || integer(old.network) > integer(n.broadcast)).toBe(true);
      used.push(n);
    }
  }
}
const cases = FAMILIES.flatMap(family => (['beginner', 'intermediate', 'advanced'] as const).flatMap(difficulty =>
  Array.from({ length: 10 }, (_, i) => ({ family, difficulty, seed: `review-${i}`, version: 1 }))));
describe('150 generated variants, independent oracle and rejection controls', () => {
  it.each(cases)('$family/$difficulty/$seed', recipe => {
    const v = generate(recipe);
    expect(generate(recipe)).toEqual(v);
    expect(generate(JSON.parse(JSON.stringify(v.recipe)))).toEqual(v);
    independent(v.problem, v.reference);
    expect(grade(v.problem, v.reference).pass).toBe(true);
    expect(grade(v.problem, null).pass).toBe(false);
    const wrong = structuredClone(v.reference) as Record<string, unknown> | { cidr: string }[];
    if (Array.isArray(wrong)) wrong[0].cidr = '192.0.2.0/24';
    else if (v.problem.family === 'overlap') wrong.pairs = ['1:999'];
    else { const key = Object.keys(wrong)[0]; wrong[key] = typeof wrong[key] === 'number' ? Number(wrong[key]) + 1 : 'wrong'; }
    expect(grade(v.problem, wrong).pass).toBe(false);
  });
});
it('actually varies parameters and does not consult ambient randomness', () => {
  expect(new Set(cases.map(r => JSON.stringify(generate(r).problem))).size).toBeGreaterThanOrEqual(100);
  expect(generate({ family: 'subnet', difficulty: 'beginner' }).recipe.seed).toBe('netlab-default');
  expect(() => generate({ family: 'subnet', difficulty: 'beginner', version: 2 })).toThrow();
  expect(() => generate({ family: 'subnet', difficulty: 'beginner', seed: '' })).toThrow();
});
it('freezes version-1 example recipes, so refactoring cannot silently change saved variants', () => {
  const recipe = { seed: 'notebook-demo', version: 1 };
  const subnet = generate({ ...recipe, family: 'subnet', difficulty: 'intermediate' });
  expect(subnet.problem).toEqual({ family: 'subnet', ip: '10.113.220.8', prefix: 27 });
  expect(generate({ ...recipe, family: 'capacity', difficulty: 'beginner' }).problem).toEqual({ family: 'capacity', hosts: 5 });
  expect(generate({ ...recipe, family: 'vlsm', difficulty: 'advanced' }).reference).toEqual([
    { id: 'dept-1', cidr: '10.208.200.0/24' }, { id: 'dept-2', cidr: '10.208.201.0/26' },
    { id: 'dept-3', cidr: '10.208.201.64/27' }, { id: 'dept-4', cidr: '10.208.201.96/28' }]);
});
it.each(CALCULATION_DRAFTS)('checks the authored reference independently: $id', d => independent(d.student.initialData, d.review.reference.answer));
it.each(['0.0.0.0/0', '255.255.255.255/0', '128.0.0.0/1', '255.255.255.255/30', '0.0.0.0/30', '172.19.7.255/22', '192.168.1.64/26', '192.168.1.63/26'])('unsigned boundary %s', cidr => {
  expect(facts(cidr)).toEqual(oracle(cidr));
  expect(prefixForMask(facts(cidr).mask)).toBe(facts(cidr).prefix);
});
it.each([1, 2, 3, 6, 7, 14, 15, 30, 31, 62, 63, 126, 127, 254, 255, 1022, 1023, 4294967294])('minimal capacity for %i hosts', n => expect(prefixForHosts(n)).toBe(smallest(n)));
it.each(['10.0.0.1/31', '10.0.0.1/32', '10.0.0.1/-1', '10.0.0.1/33', '256.1.1.1/24', '1.2.3/24', '1.2.3.4/2.5', '1.2.3.4/24junk'])('rejects unsupported/malformed subnet %s', s => expect(() => subnet(s)).toThrow());
it.each(['255.0.255.0', '255.255.255.254', '255.255.255.255', '256.0.0.0'])('rejects mask %s', s => expect(() => prefixForMask(s)).toThrow());
it.each([0, -1, 1.5, NaN, Infinity, 4294967295])('rejects invalid host count %s', n => expect(() => prefixForHosts(n)).toThrow());
it('rejects misaligned networks, invalid addresses and contradictory mask data', () => {
  expect(() => network('10.0.0.1/24')).toThrow();
  expect(() => address('10.0.0.-1')).toThrow();
  expect(() => solve({ family: 'subnet', ip: '10.0.0.1', prefix: 24, givenMask: '255.255.255.224' })).toThrow();
});
const plan: VlsmProblem = { family: 'vlsm', parent: '10.0.0.0/24', reserved: ['10.0.0.128/26'], demands: [
  { id: 'a', label: 'A', hosts: 30 }, { id: 'b', label: 'B', hosts: 30 }] };
it('accepts alternative layouts and unordered answers, rejects overlap, oversizing, duplicates, omissions and non-networks', () => {
  expect(grade(plan, [{ id: 'b', cidr: '10.0.0.224/27' }, { id: 'a', cidr: '10.0.0.64/27' }]).pass).toBe(true);
  for (const bad of ['10.0.0.0/26', '10.0.0.128/27', '10.0.0.1/27', '10.0.1.0/27', '10.0.0.0/28', '10.0.0.32/27']) {
    expect(grade(plan, [{ id: 'a', cidr: bad }, { id: 'b', cidr: '10.0.0.32/27' }]).pass, bad).toBe(false);
  }
  expect(grade(plan, [{ id: 'a', cidr: '10.0.0.0/27' }]).pass).toBe(false);
  expect(grade(plan, [{ id: 'a', cidr: '10.0.0.0/27' }, { id: 'a', cidr: '10.0.0.32/27' }]).pass).toBe(false);
  expect(grade(plan, [{ id: 'x', cidr: '10.0.0.0/27' }, { id: 'b', cidr: '10.0.0.32/27' }]).pass).toBe(false);
});
it('handles growth rounding, future demands and impossible/invalid plans explicitly', () => {
  expect(requiredHosts({ id: 'x', label: 'X', hosts: 21, growthPercent: 10 })).toBe(24);
  expect(() => requiredHosts({ id: 'x', label: 'X', hosts: 21, growthPercent: -1 })).toThrow();
  expect(() => allocate({ ...plan, parent: '10.0.0.0/27', reserved: [] })).toThrow(/Platz/);
  expect(() => allocate({ ...plan, reserved: ['10.0.1.0/24'] })).toThrow();
  expect(() => allocate({ ...plan, reserved: ['10.0.0.0/25', '10.0.0.64/26'] })).toThrow();
  expect(() => allocate({ ...plan, demands: [plan.demands[0], plan.demands[0]] })).toThrow();
});
it('distinguishes touching subnets from containment and rejects malformed structured answers', () => {
  const p: MathProblem = { family: 'overlap', networks: ['10.0.0.0/26', '10.0.0.64/26', '10.0.0.32/27'] };
  expect(solve(p)).toEqual({ pairs: ['1:3'] });
  expect(grade(p, { pairs: ['1:3', '1:3'] }).pass).toBe(false);
  expect(grade(p, { pairs: [13] }).pass).toBe(false);
  expect(grade({ family: 'capacity', hosts: 30 }, { prefix: 27, mask: '255.255.255.224', hosts: 30, extra: true }).pass).toBe(false);
});
