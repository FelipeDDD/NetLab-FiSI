import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DIAGNOSIS_RECIPES, generateDiagnosis } from './generator';
import type { DiagnosisRecipe, GeneratedDiagnosis, PingEvidence } from './generator';

const int = (ip: string) => ip.split('.').reduce((n, s) => (n << 8n) | BigInt(s), 0n);
const dot = (n: bigint) => [24n, 16n, 8n, 0n].map(s => (n >> s) & 255n).join('.');
function oracle(ip: string, prefix: number) {
  const host = (1n << BigInt(32 - prefix)) - 1n, mask = 0xffffffffn ^ host;
  const start = int(ip) & mask, end = start | host;
  return { start, end, mask: dot(mask), first: dot(start + 1n), last: dot(end - 1n) };
}
const yesNo = (yes: boolean) => yes ? 'yes' : 'no';
const q = (v: GeneratedDiagnosis, id: string) => v.case.questions.find(q => q.id === id)!;
const sample = (archetype: 'ND02' | 'ND05', difficulty: DiagnosisRecipe['difficulty'], seed: string) =>
  generateDiagnosis({ version: 1, archetype, difficulty, seed });

// Test-only finite witnesses, not a production diagnosis engine. Partial loss is
// checked by counts. Distinguish arrival at A from delivery to its ping process.
const worlds = Array.from({ length: 1024 }, (_, bits) => {
  const [up, path, back, echo, drop, local, process, http, allowHttp, other] =
    Array.from({ length: 10 }, (_, i) => Boolean(bits & (1 << i)));
  const ingress = up && path && back && echo && !drop;
  const terminal = ingress && !local && process;
  const tcp = up && path && back && http && allowHttp;
  return { up, path, back, echo, drop, local, process, tcp, ingress, terminal,
    communication: terminal || tcp || (up && path && back && other) };
});
function compatible(d: PingEvidence) {
  return worlds.filter(w => w.terminal === (d.terminalReplies > 0) &&
    (!d.tcpReply || w.tcp) &&
    (d.ingressReplies === null || w.ingress === (d.ingressReplies > 0)) &&
    (d.requestDrops === null || (w.path && w.drop)));
}
function conclusion(values: boolean[]) {
  expect(values.length).toBeGreaterThan(0); // No vacuous success for contradictory observations.
  return values.every(Boolean) ? 'yes' : values.every(v => !v) ? 'no' : 'unknown';
}
function check(v: GeneratedDiagnosis) {
  expect(v.case.questions).toHaveLength(2);
  expect(new Set(v.case.evidence.map(e => e.id)).size).toBe(v.case.evidence.length);
  for (const question of v.case.questions) {
    question.basis.forEach(id => expect(v.case.evidence.some(e => e.id === id)).toBe(true));
    expect(question.prompt.endsWith('?')).toBe(true);
    if (question.answer === 'unknown') {
      expect(question.explanation.alternatives.yes).toMatch(/^Hypothetisches Beispiel:/);
      expect(question.explanation.alternatives.no).toMatch(/^Hypothetisches Beispiel:/);
      expect(question.explanation.alternatives.yes).not.toBe(question.explanation.alternatives.no);
      expect(question.prompt).not.toMatch(/Lässt sich|Belegt|nachgewiesen/);
    }
  }
  const d = v.data;
  if (d.kind === 'address') {
    const n = oracle(d.pc, d.prefix), value = int(d.candidate);
    const addresses = v.case.evidence.find(e => e.id === 'addresses')!.text;
    expect(addresses).toContain(d.pc + '/' + d.prefix);
    expect(addresses).toContain(d.candidate);
    expect(d.prefix).toBeGreaterThanOrEqual(0);
    expect(d.prefix).toBeLessThanOrEqual(30);
    expect(int(d.pc) > n.start && int(d.pc) < n.end).toBe(true);
    expect(q(v, 'membership').answer).toBe(yesNo(value >= n.start && value <= n.end));
    expect(q(v, 'gateway').answer).toBe(yesNo(value > n.start && value < n.end && value !== int(d.pc)));
    for (const question of v.case.questions) {
      expect(question.prompt).toContain(d.candidate);
      for (const part of [dot(n.start), dot(n.end), n.mask, n.first, n.last]) {
        expect(question.explanation.reasoning).toContain(part);
      }
    }
    switch (d.role) {
      case 'network': expect(value).toBe(n.start); break;
      case 'broadcast': expect(value).toBe(n.end); break;
      case 'self': expect(d.candidate).toBe(d.pc); break;
      case 'outside': expect(value === n.start - 1n || value === n.end + 1n).toBe(true); break;
      case 'zero-host':
        expect(d.candidate.endsWith('.0')).toBe(true);
        expect(q(v, 'gateway').answer).toBe('yes'); break;
      case 'host': expect(q(v, 'gateway').answer).toBe('yes'); break;
    }
  } else {
    const test = v.case.evidence.find(e => e.id === 'test')!.text;
    expect(test).toContain('Gesendet: ' + d.sent + ' Echo Requests');
    expect(test).toContain('zugeordnete Echo Replies: ' + d.terminalReplies);
    expect(test).toContain('Timeouts: ' + (d.sent - d.terminalReplies));
    expect(test).toContain('Kennung ' + d.identifier);
    expect(d.terminalReplies).toBeGreaterThanOrEqual(0);
    expect(d.terminalReplies).toBeLessThan(d.sent);
    const extra = v.case.evidence.find(e => e.id === 'extra')?.text;
    if (d.tcpReply) {
      expect(extra).toContain('HTTP-Antwort von B (' + d.target + ')');
      expect(extra).toContain('TCP-Port ' + d.port);
    }
    if (d.gatewayReply) expect(extra).toContain('an ' + d.gateway);
    if (d.requestDrops !== null || d.ingressReplies !== null) {
      expect(extra).toContain(d.source);
      expect(extra).toContain(d.target);
      expect(extra).toContain('Kennung ' + d.identifier);
      expect(extra).toContain('Sequenzen 1–' + d.sent);
      if (d.requestDrops !== null) {
        expect(d.requestDrops).toBe(d.sent);
        expect(d.terminalReplies).toBe(0);
        expect(extra).toContain('DROP vor der Weiterleitung');
      } else {
        expect(d.ingressReplies).toBe(d.sent);
        expect(extra).toContain('vor lokalen Filtern');
        expect(extra).toContain('vor Ablauf');
      }
    }
    const possible = compatible(d);
    expect(possible.length).toBeGreaterThan(0);
    for (const question of v.case.questions) {
      switch (question.id) {
        case 'received': expect(question.answer).toBe(yesNo(d.terminalReplies > 0)); break;
        case 'complete': expect(question.answer).toBe(yesNo(d.terminalReplies === d.sent)); break;
        case 'target-proof':
          expect(d.gatewayReply).toBe(true);
          expect(d.gateway).not.toBe(d.target);
          expect(question.answer).toBe('no'); break;
        case 'transit-loss':
          expect(question.answer).toBe(conclusion(possible.map(w => !w.ingress))); break;
        case 'communication':
          expect(question.answer).toBe(conclusion(possible.map(w => w.communication))); break;
        case 'cause':
          expect(question.answer).toBe(conclusion(possible.map(w =>
            v.recipe.recipe === 'nd05-ingress' ? w.local : w.drop))); break;
        default: throw Error('Unreviewed question ' + question.id);
      }
    }
  }
}

it.each(DIAGNOSIS_RECIPES)('$id: explicit recipes reproduce and satisfy independent conditions', spec => {
  for (const difficulty of spec.levels) for (let i = 0; i < 40; i++) {
    const input: DiagnosisRecipe = { version: 1, archetype: spec.archetype, difficulty,
      recipe: spec.id, seed: 'explicit-' + i };
    const v = generateDiagnosis(input);
    expect(generateDiagnosis(input)).toEqual(v);
    expect(generateDiagnosis(JSON.parse(JSON.stringify(v.recipe)))).toEqual(v);
    check(v);
  }
});

it.each(['ND02', 'ND05'] as const)('%s: selection covers all eligible structures, not just new addresses', archetype => {
  for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const v = sample(archetype, difficulty, 'diagnosis-audit-' + String(i).padStart(4, '0'));
      seen.add(v.recipe.recipe);
      expect(generateDiagnosis(v.recipe)).toEqual(v);
      check(v);
    }
    expect([...seen].sort()).toEqual(DIAGNOSIS_RECIPES.filter(r =>
      r.archetype === archetype && (r.levels as readonly string[]).includes(difficulty)).map(r => r.id).sort());
  }
});

it('handles /30 two-host blocks and cross-octet host addresses without collisions', () => {
  const prefixes = new Set<number>();
  for (let i = 0; i < 200; i++) {
    for (const recipe of ['nd02-host', 'nd02-zero-host'] as const) {
      const v = generateDiagnosis({ version: 1, archetype: 'ND02', difficulty: 'advanced', recipe, seed: 'edges-' + i });
      if (v.data.kind !== 'address') throw Error('address');
      prefixes.add(v.data.prefix);
      expect(v.data.pc).not.toBe(v.data.candidate);
      check(v);
    }
  }
  for (const prefix of [16, 20, 22, 23, 27, 30]) expect(prefixes.has(prefix)).toBe(true);
});

it('shares evidence-scope wording across determinate and indeterminate questions', () => {
  const examples = DIAGNOSIS_RECIPES.filter(r => r.archetype === 'ND05').map(r =>
    generateDiagnosis({ version: 1, archetype: 'ND05', difficulty: 'advanced', recipe: r.id, seed: 'lexical-check' }));
  expect(new Set(examples.map(v => v.case.evidence.find(e => e.id === 'scope')!.text)).size).toBe(1);
  for (const v of examples) {
    expect(v.case.questions.some(q => q.answer !== 'unknown')).toBe(true);
    const learner = [v.case.scenario, ...v.case.evidence.map(e => e.text), ...v.case.questions.map(q => q.prompt)].join(' ');
    expect(learner).not.toMatch(/unbekannt|nicht dokumentiert/i);
  }
});

it('cause alternatives preserve HTTP success or incoming replies rather than inventing a dead target', () => {
  for (const recipe of ['nd05-tcp', 'nd05-ingress'] as const) {
    const v = generateDiagnosis({ version: 1, archetype: 'ND05', difficulty: 'advanced', recipe, seed: 'witnesses' });
    const question = q(v, 'cause');
    if (question.answer !== 'unknown' || v.data.kind !== 'ping') throw Error('open cause');
    const possible = compatible(v.data);
    expect(possible.some(w => recipe === 'nd05-tcp' ? w.drop && w.tcp : w.local && w.ingress)).toBe(true);
    expect(possible.some(w => recipe === 'nd05-tcp' ? !w.drop && !w.echo && w.tcp : !w.local && !w.process && w.ingress)).toBe(true);
    expect(question.explanation.alternatives.no).not.toMatch(/ausgeschaltet|kein Netzwerkzugang/);
  }
});

it('rejects unsupported versions, seeds and recipe/level/archetype mismatches', () => {
  const base: DiagnosisRecipe = { version: 1, archetype: 'ND02', difficulty: 'beginner', seed: 'reference' };
  for (const change of [{ version: 2 }, { archetype: 'ND01' }, { difficulty: 'expert' },
    { seed: '' }, { seed: '   ' }, { seed: 'x'.repeat(257) }, { seed: 12 },
    { recipe: 'nd05-timeout' }, { recipe: 'nd02-zero-host' }, { recipe: 'toString' }]) {
    expect(() => generateDiagnosis({ ...base, ...change } as DiagnosisRecipe)).toThrow();
  }
  for (const seed of ['büro 東京', 'reference', '37b3c848-b226-44c2-93eb-0337af1ce011', ' seed ']) {
    const v = generateDiagnosis({ ...base, seed });
    expect(generateDiagnosis(v.recipe)).toEqual(v);
    expect(v.recipe.seed).toBe(seed);
  }
});

it('preserves the fixed pilot source apart from portable line endings', () => {
  const source = readFileSync(new URL('./pilot.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  expect(createHash('sha256').update(source).digest('hex')).toBe('d46c277e21c8c7f9de830997ea41374b8e327b3bfb0777e86ef17a231a3a7fd5');
});

it('reproduces all twelve human-review examples from documented recipes', () => {
  const doc = readFileSync(new URL('../../../docs/network-diagnosis-generation.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const sections = doc.split(/\n### Beispiel \d+ — /).slice(1);
  expect(sections).toHaveLength(12);
  const seen = new Set<string>();
  const examples: GeneratedDiagnosis[] = [];
  const labels = { yes: 'Ja', no: 'Nein', unknown: 'Nicht eindeutig bestimmbar' };
  for (const section of sections) {
    const input = JSON.parse(section.match(/\x60{3}json\n([\s\S]*?)\n\x60{3}/)![1]) as DiagnosisRecipe;
    const v = generateDiagnosis(input);
    examples.push(v);
    seen.add(v.recipe.recipe);
    expect(section).toContain(v.case.scenario);
    for (const e of v.case.evidence) expect(section).toContain(e.text);
    for (const q of v.case.questions) {
      expect(section).toContain(q.prompt);
      expect(section).toContain('Antwort: **' + labels[q.answer] + '**.');
      expect(section).toContain(q.explanation.reasoning);
      if (q.answer === 'unknown') {
        expect(section).toContain(q.explanation.alternatives.yes);
        expect(section).toContain(q.explanation.alternatives.no);
      }
    }
  }
  expect([...seen].sort()).toEqual(DIAGNOSIS_RECIPES.map(r => r.id).sort());
  expect(createHash('sha256').update(JSON.stringify(examples)).digest('hex'))
    .toBe('237863bd15b3e545f1622b4bd102ece0cc87b08485f8706da734a942d9492c1c');
});
