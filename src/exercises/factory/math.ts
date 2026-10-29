/** Internal authoring tools. Ordinary IPv4 broadcast subnets, not RFC 3021 links. */
import { ipToString, parseIp } from '../../engine/ip';
import { gradeCidr, solveCidr, type CidrProblem } from './cidr';

export function address(text: string): number {
  if (typeof text !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(text.trim())) throw new Error('Ungültige IPv4-Adresse');
  const n = parseIp(text);
  if (n === null) throw new Error('Ungültige IPv4-Adresse');
  return n;
}
export function subnet(cidr: string) {
  if (typeof cidr !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}\/(0|[1-9]|[12]\d|30)$/.test(cidr)) {
    throw new Error('Broadcast-Subnetz mit Präfix /0 bis /30 erforderlich');
  }
  const [ip, p] = cidr.split('/'), prefix = Number(p), size = 2 ** (32 - prefix);
  const start = Math.floor(address(ip) / size) * size, end = start + size - 1;
  return { start, end, prefix, size, cidr: `${ipToString(start)}/${prefix}` };
}
export function network(cidr: string) {
  const s = subnet(cidr);
  if (address(cidr.split('/')[0]) !== s.start) throw new Error('Netzadresse ist nicht ausgerichtet');
  return s;
}
export function prefixForHosts(hosts: number): number {
  if (!Number.isSafeInteger(hosts) || hosts < 1 || hosts > 2 ** 32 - 2) throw new Error('Ungültiger Hostbedarf');
  return 32 - Math.max(2, Math.ceil(Math.log2(hosts + 2)));
}
export function prefixForMask(mask: string): number {
  const n = address(mask), size = 2 ** 32 - n, exponent = Math.log2(size);
  if (!Number.isInteger(exponent) || exponent < 2 || exponent > 32) throw new Error('Nicht zusammenhängende oder nicht unterstützte Maske');
  return 32 - exponent;
}
export function facts(cidr: string) {
  const s = subnet(cidr);
  return { network: ipToString(s.start), broadcast: ipToString(s.end), prefix: s.prefix,
    mask: ipToString(2 ** 32 - s.size), first: ipToString(s.start + 1), last: ipToString(s.end - 1),
    addresses: s.size, hosts: s.size - 2 };
}
export type Demand = { id: string; label: string; hosts: number; growthPercent?: number; purpose?: 'future' };
export type Allocation = { id: string; cidr: string };
export type MathProblem =
  | CidrProblem
  | ({ family: 'subnet'; ip: string } & ({ prefix: number; givenMask?: string } | { prefix?: never; givenMask: string }))
  | { family: 'capacity'; hosts: number }
  | { family: 'vlsm'; parent: string; demands: Demand[]; reserved: string[] }
  | { family: 'overlap'; networks: string[] }
  | { family: 'membership'; network: string; candidates: { id: string; ip: string }[] };
export type VlsmProblem = Extract<MathProblem, { family: 'vlsm' }>;
export function requiredHosts(demand: Demand) {
  if (demand.purpose !== undefined && demand.purpose !== 'future') throw new Error('Ungültiger Reservezweck');
  const growth = demand.growthPercent ?? 0;
  prefixForHosts(demand.hosts);
  if (!Number.isSafeInteger(growth) || growth < 0 || growth > 1000) throw new Error('Ungültige Wachstumsreserve');
  const total = Math.ceil(demand.hosts * (100 + growth) / 100);
  prefixForHosts(total);
  return total;
}
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start <= b.end && b.start <= a.end;
}
function planInput(p: VlsmProblem) {
  const parent = network(p.parent), reserved = p.reserved.map(network);
  if (!p.demands.length || new Set(p.demands.map(d => d.id)).size !== p.demands.length ||
    p.demands.some(d => !d.id?.trim() || !d.label?.trim())) throw new Error('Ungültige Bedarfs-IDs');
  p.demands.forEach(requiredHosts);
  reserved.forEach((r, i) => {
    if (r.start < parent.start || r.end > parent.end || reserved.slice(0, i).some(a => overlaps(a, r))) {
      throw new Error('Ungültige feste Reservierung');
    }
  });
  return { parent, reserved };
}
export function allocate(p: VlsmProblem): Allocation[] {
  const { parent, reserved } = planInput(p), used = [...reserved], result: Allocation[] = [];
  // Largest first, stable ID tie-break; first aligned fit skips occupied intervals, never enumerates IPs.
  const demands = [...p.demands].sort((a, b) => requiredHosts(b) - requiredHosts(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const d of demands) {
    const prefix = prefixForHosts(requiredHosts(d)), size = 2 ** (32 - prefix);
    let start = Math.ceil(parent.start / size) * size;
    while (start + size - 1 <= parent.end) {
      const end = start + size - 1, conflict = used.find(r => overlaps(r, { start, end }));
      if (!conflict) { used.push({ start, end, prefix, size, cidr: '' }); break; }
      start = Math.ceil((conflict.end + 1) / size) * size;
    }
    if (start + size - 1 > parent.end) throw new Error('Kein Platz für den Bedarf');
    result.push({ id: d.id, cidr: `${ipToString(start)}/${prefix}` });
  }
  return result;
}
export function solve(p: MathProblem): unknown {
  switch (p.family) {
    case 'cidr': return solveCidr(p);
    case 'subnet': {
      if (p.prefix !== undefined && (!Number.isInteger(p.prefix) || p.prefix < 0 || p.prefix > 30)) throw new Error('Ungültiger Präfix');
      const prefix = p.prefix ?? prefixForMask(p.givenMask!);
      if (p.givenMask !== undefined && prefixForMask(p.givenMask) !== prefix) throw new Error('Maske und Präfix widersprechen sich');
      return facts(`${p.ip}/${prefix}`);
    }
    case 'capacity': {
      const prefix = prefixForHosts(p.hosts);
      return { prefix, mask: facts(`0.0.0.0/${prefix}`).mask, hosts: 2 ** (32 - prefix) - 2 };
    }
    case 'vlsm': return allocate(p);
    case 'overlap': {
      if (p.networks.length < 2) throw new Error('Mindestens zwei Netze erforderlich');
      const ranges = p.networks.map(network), pairs: string[] = [];
      ranges.forEach((a, i) => ranges.forEach((b, j) => { if (i < j && overlaps(a, b)) pairs.push(`${i + 1}:${j + 1}`); }));
      return { pairs };
    }
    case 'membership': {
      const n = network(p.network), result: Record<string, string> = {};
      if (!p.candidates.length || new Set(p.candidates.map(c => c.id)).size !== p.candidates.length) throw new Error('Ungültige Kandidaten');
      for (const c of p.candidates) {
        if (!c.id?.trim() || ['__proto__', 'constructor', 'prototype'].includes(c.id)) throw new Error('Ungültige Kandidaten-ID');
        const ip = address(c.ip);
        result[c.id] = ip === n.start ? 'network' : ip === n.end ? 'broadcast' : ip > n.start && ip < n.end ? 'host' : 'outside';
      }
      return result;
    }
    default: throw new Error('Unbekannte Aufgabenfamilie');
  }
}
export type Grade = { pass: boolean; issues: string[]; feedback?: string[] };
/** Constraints, not equality to one particular VLSM layout. No engine or browser state. */
export function grade(p: MathProblem, answer: unknown): Grade {
  if (p.family === 'cidr') return gradeCidr(p, answer);
  try {
    const expected = solve(p); // validates the authored problem, including feasibility
    if (p.family === 'vlsm') {
      const { parent, reserved } = planInput(p);
      if (!Array.isArray(answer) || answer.length !== p.demands.length) throw new Error('Jeden Bedarf genau einmal zuordnen');
      const seen = new Set<string>(), used = [...reserved];
      for (const row of answer) {
        if (!row || typeof row !== 'object') throw new Error('Netzzuordnung fehlt');
        const d = p.demands.find(d => d.id === row.id);
        if (!d || seen.has(row.id)) throw new Error('Unbekannte oder doppelte Bedarfs-ID');
        seen.add(row.id);
        const n = network(row.cidr);
        if (n.prefix !== prefixForHosts(requiredHosts(d))) throw new Error(`${d.label}: kleinstes ausreichendes Netz erforderlich`);
        if (n.start < parent.start || n.end > parent.end) throw new Error(`${d.label}: außerhalb des Stammnetzes`);
        if (used.some(r => overlaps(r, n))) throw new Error(`${d.label}: Überschneidung`);
        used.push(n);
      }
    } else {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Strukturierte Antwort erforderlich');
      const actual = answer as Record<string, unknown>;
      const entries = Object.entries(expected as Record<string, unknown>);
      if (Object.keys(actual).length !== entries.length) throw new Error('Antwortfelder fehlen oder sind unbekannt');
      for (const [key, value] of entries) {
        if (key === 'pairs') {
          const pairs = actual[key];
          if (!Array.isArray(pairs) || pairs.some(p => typeof p !== 'string') ||
            new Set(pairs).size !== pairs.length || JSON.stringify([...pairs].sort()) !== JSON.stringify([...(value as string[])].sort())) {
            throw new Error('Überschneidungspaare stimmen nicht');
          }
        } else if ((typeof actual[key] === 'string' ? (actual[key] as string).trim() : actual[key]) !== value) {
          throw new Error(`Feld ${key} stimmt nicht`);
        }
      }
    }
    return { pass: true, issues: [] };
  } catch (e) { return { pass: false, issues: [e instanceof Error ? e.message : String(e)] }; }
}
