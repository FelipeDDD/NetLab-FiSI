import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NETWORK_DIAGNOSIS_PILOT as cases } from './pilot';
import type { DiagnosisPilotCase } from './pilot';

// Independent BigInt arithmetic; no factory solver, grader or engine.
const number = (ip: string) => ip.split('.').reduce((n, octet) => (n << 8n) | BigInt(octet), 0n);
function bounds(cidr: string) {
  const [ip, prefix] = cidr.split('/');
  const hostBits = (1n << BigInt(32 - Number(prefix))) - 1n;
  const start = number(ip) & (0xffffffffn ^ hostBits);
  return { start, end: start | hostBits, own: number(ip) };
}
const cidrs = (s: string) => s.match(/\b\d+(?:\.\d+){3}\/\d+\b/g) ?? [];
const ips = (s: string) => s.match(/\b\d+(?:\.\d+){3}\b/g) ?? [];
function single(values: readonly string[]): string {
  if (values.length !== 1 || values[0] === undefined) throw Error('Expected exactly one address in the reviewed text');
  return values[0];
}
const answer = (yes: boolean) => yes ? 'yes' : 'no';
const get = (id: string) => cases.find(c => c.id === id)!;
const fact = (c: DiagnosisPilotCase, id: string) => c.evidence.find(e => e.id === id)!;
const question = (c: DiagnosisPilotCase, id: string) => c.questions.find(q => q.id === id)!;

it('keeps eight internal versioned cases, two per requested archetype', () => {
  expect(cases.map(c => c.id)).toEqual([
    'nd01-01', 'nd01-02', 'nd02-01', 'nd02-02', 'nd05-01', 'nd05-02', 'nd06-01', 'nd06-02',
  ]);
  for (const archetype of ['ND01', 'ND02', 'ND05', 'ND06']) {
    expect(cases.filter(c => c.archetype === archetype)).toHaveLength(2);
  }
  expect(new Set(cases.map(c => c.contentVersion))).toEqual(new Set([1]));
  expect(new Set(cases.flatMap(c => c.questions.map(q => q.concept)))).toEqual(
    new Set(['membership', 'gateway-address', 'reachability', 'observation', 'cause']),
  );
});

it.each(cases)('$id links its reasoning to evidence and labels both hypothetical alternatives', c => {
  expect(c.title.trim()).not.toBe('');
  expect(c.scenario.trim()).not.toBe('');
  expect(new Set(c.evidence.map(e => e.id)).size).toBe(c.evidence.length);
  expect(new Set(c.questions.map(q => q.id)).size).toBe(c.questions.length);
  for (const q of c.questions) {
    expect(q.prompt.endsWith('?')).toBe(true);
    expect(q.basis.length).toBeGreaterThan(0);
    for (const id of q.basis) expect(c.evidence.some(e => e.id === id)).toBe(true);
    expect(q.explanation.reasoning.length).toBeGreaterThan(70);
    if (q.answer === 'unknown') {
      expect(q.basis.some(id => fact(c, id).kind === 'missing')).toBe(true);
      expect(q.explanation.alternatives.yes).toMatch(/^Hypothetisches Beispiel/);
      expect(q.explanation.alternatives.no).toMatch(/^Hypothetisches Beispiel/);
      expect(q.explanation.alternatives.yes).not.toBe(q.explanation.alternatives.no);
      // Asking whether one can decide would literally require Nein, not Unknown.
      expect(q.prompt).not.toMatch(/Lässt sich|Ist .*nachgewiesen|Beweist|Belegt/);
    } else expect(q.explanation.alternatives).toBeUndefined();
  }
});

it.each(['nd01-01', 'nd01-02'])('%s separates independently calculated membership from operation', id => {
  const c = get(id), [a, b] = cidrs(fact(c, 'addresses').text).map(bounds);
  expect(question(c, 'membership').answer).toBe(answer(a.start === b.start && a.end === b.end));
  expect(question(c, 'communication').answer).toBe('unknown');
  expect(c.evidence.some(e => e.kind === 'observation')).toBe(false);
});

it.each(['nd02-01', 'nd02-02'])('%s includes boundaries but rejects them as gateways', id => {
  const c = get(id), n = bounds(single(cidrs(fact(c, 'address').text)));
  expect(n.own > n.start && n.own < n.end).toBe(true);
  for (const q of c.questions) {
    const value = number(single(ips(q.prompt)));
    const belongs = value >= n.start && value <= n.end;
    const usable = value > n.start && value < n.end && value !== n.own;
    expect(q.answer).toBe(answer(q.concept === 'membership' ? belongs : usable));
  }
  expect(question(c, 'membership').answer).toBe('yes');
  expect(question(c, 'usable-gateway').answer).toBe('yes');
  expect(fact(c, 'routers').kind).toBe('missing');
  expect(question(c, 'usable-gateway').prompt).toContain('hinsichtlich der Subnetzgrenzen');
});

it('uses a network boundary first and a broadcast boundary second', () => {
  for (const [id, qid, boundary] of [
    ['nd02-01', 'network-gateway', 'start'], ['nd02-02', 'broadcast-gateway', 'end'],
  ] as const) {
    const c = get(id), n = bounds(single(cidrs(fact(c, 'address').text)));
    expect(number(single(ips(question(c, qid).prompt)))).toBe(n[boundary]);
    expect(question(c, qid).answer).toBe('no');
  }
});

it('keeps both same-subnet worlds compatible with unobserved operational state', () => {
  const c = get('nd01-01'), q = question(c, 'communication');
  if (q.answer !== 'unknown') throw Error('Expected an open operational question');
  expect(fact(c, 'operation').kind).toBe('missing');
  expect(q.explanation.alternatives.yes).toContain('selben funktionierenden VLAN');
  expect(q.explanation.alternatives.no).toContain('Kabel ist abgezogen');
  expect(q.explanation.alternatives.no).toContain('gespeicherte /23-Konfiguration bleibt gleich');
  expect(c.evidence.some(e => /Kabel ist abgezogen|funktionierenden VLAN/.test(e.text))).toBe(false);
});

it('permits indirect routing without a direct switch link; missing diagram data is not isolation', () => {
  const c = get('nd01-02'), q = question(c, 'communication');
  if (q.answer !== 'unknown') throw Error('Expected an open path question');
  expect(fact(c, 'switches').text).toContain('keinen direkten Link');
  expect(fact(c, 'switches').text).toContain('unvollständig');
  expect(fact(c, 'paths').kind).toBe('missing');
  const hosts = cidrs(fact(c, 'addresses').text).map(bounds);
  const gateways = ips(q.explanation.alternatives.yes).map(number);
  expect(gateways).toHaveLength(2);
  gateways.forEach((g, i) => expect(g > hosts[i].start && g < hosts[i].end && g !== hosts[i].own).toBe(true));
  expect(q.explanation.alternatives.yes).toContain('Uplinks zu einem aktiven Router');
  expect(q.explanation.alternatives.no).toContain('isolierte Inseln');
  expect(c.evidence.some(e => e.text.includes('isolierte Inseln'))).toBe(false);
});

it('distinguishes a failed ICMP observation from possible TCP communication', () => {
  const c = get('nd05-01'), q = question(c, 'communication');
  expect(fact(c, 'ping').kind).toBe('observation');
  expect(fact(c, 'ping').text).toContain('keinen empfangenen Echo Reply');
  expect(question(c, 'reply').answer).toBe('no');
  if (q.answer !== 'unknown') throw Error('A timeout cannot settle all IP communication');
  expect(q.explanation.alternatives.yes).toContain('nur die ICMP Echo Requests');
  expect(q.explanation.alternatives.yes).toContain('TCP funktioniert');
  expect(q.explanation.alternatives.no).toContain('B ist ausgeschaltet');
  expect(fact(c, 'operation').kind).toBe('missing');
});

it('does not confuse a gateway reply with a target reply or a proven firewall cause', () => {
  const c = get('nd05-02'), q = question(c, 'cause');
  const [a, b, gateway] = ips(fact(c, 'addresses').text);
  expect(new Set([a, b, gateway]).size).toBe(3);
  expect(ips(fact(c, 'gateway-reply').text)).toEqual([gateway]);
  expect(ips(fact(c, 'target-timeout').text)).toEqual([b]);
  expect(fact(c, 'target-timeout').text).toContain('keinen Echo Reply');
  expect(question(c, 'target-proof').answer).toBe('no');
  expect(fact(c, 'remote-state').kind).toBe('missing');
  if (q.answer !== 'unknown') throw Error('The cause was not observed');
  expect(q.explanation.alternatives.yes).toContain('B beantwortet HTTP');
  expect(q.explanation.alternatives.no).toContain('Router bleibt aktiv');
  expect(q.explanation.alternatives.no).toContain('Die Filter würden den Verkehr erlauben');
  expect(q.explanation.alternatives.no).toContain('B ist ausgeschaltet');
});

it('limits positive ICMP evidence to the measured endpoints, protocol and time', () => {
  const c = get('nd06-01'), q = question(c, 'exchange');
  expect(fact(c, 'exchange').text).toContain('Kennung, Sequenznummer und Nutzlast');
  expect(fact(c, 'exchange').text).toContain('10:15:03.020');
  expect(q.prompt).toContain('für diesen Messzeitpunkt');
  expect(q.answer).toBe('yes');
  expect(fact(c, 'other-services').kind).toBe('missing');
});

it('permits HTTP failure without contradicting observed ICMP success', () => {
  const c = get('nd06-02'), q = question(c, 'http');
  const [a, b] = cidrs(fact(c, 'addresses').text).map(bounds);
  expect(a.start).not.toBe(b.start);
  expect(fact(c, 'exchange').kind).toBe('observation');
  expect(fact(c, 'http').kind).toBe('missing');
  expect(q.prompt).toContain('http://10.60.2.20:8080/');
  if (q.answer !== 'unknown') throw Error('ICMP does not decide HTTP availability');
  expect(q.explanation.alternatives.yes).toContain('TCP-Port 8080');
  expect(q.explanation.alternatives.no).toContain('B beantwortet weiterhin ICMP');
  expect(q.explanation.alternatives.no).toContain('kein Dienst auf TCP-Port 8080');
  expect(q.explanation.alternatives.no).not.toContain('B ist ausgeschaltet');
});

it('documents every reviewed prompt, answer, fact and explanation verbatim', () => {
  const doc = readFileSync(new URL('../../../docs/network-diagnosis-pilot.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const labels = { yes: 'Ja', no: 'Nein', unknown: 'Nicht eindeutig bestimmbar' };
  for (const c of cases) {
    const section = doc.split('### ' + c.id + ' — ')[1]?.split('\n### ')[0];
    expect(section).toBeDefined();
    for (const text of [c.title, c.scenario, ...c.evidence.map(e => e.text)]) expect(section).toContain(text);
    for (const q of c.questions) {
      expect(section).toContain('**' + q.id + ': ' + q.prompt + '**\n\nAntwort: **' + labels[q.answer] + '**.');
      expect(section).toContain(q.explanation.reasoning);
      if (q.answer === 'unknown') {
        expect(section).toContain(q.explanation.alternatives.yes);
        expect(section).toContain(q.explanation.alternatives.no);
      }
    }
  }
});
