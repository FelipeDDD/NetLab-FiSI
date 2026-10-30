// Internal, offline authoring audit. Default: stdout only.
// --write-review updates only the marked examples in docs/network-diagnosis-generation.md.
// --check-review checks those examples without writing. No browser or engine instance.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const mode = process.argv[2];
assert(process.argv.length <= 3 && [undefined, '--write-review', '--check-review'].includes(mode), 'Unsupported arguments');
const vite = await createServer({ configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const { generateDiagnosis, DIAGNOSIS_RECIPES } = await vite.ssrLoadModule('/src/exercises/diagnosis/generator.ts');
  const rows = [];
  for (const archetype of ['ND02', 'ND05']) for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
    const recipes = {}, signatures = new Set(), visible = new Set(), prefixes = new Set();
    const answers = { yes: 0, no: 0, unknown: 0 };
    for (let i = 0; i < 200; i++) {
      const v = generateDiagnosis({ version: 1, archetype, difficulty, seed: 'diagnosis-audit-' + String(i).padStart(4, '0') });
      assert.deepEqual(generateDiagnosis(v.recipe), v);
      recipes[v.recipe.recipe] = (recipes[v.recipe.recipe] ?? 0) + 1;
      signatures.add(v.recipe.recipe); // Structural families, not IP-string uniqueness.
      visible.add(JSON.stringify([v.case.evidence, v.case.questions.map(q => q.prompt)]));
      if (v.data.kind === 'address') prefixes.add(v.data.prefix);
      for (const q of v.case.questions) answers[q.answer]++;
    }
    const eligible = DIAGNOSIS_RECIPES.filter(r => r.archetype === archetype && r.levels.includes(difficulty));
    assert.deepEqual(Object.keys(recipes).sort(), eligible.map(r => r.id).sort());
    rows.push({ archetype, difficulty, samples: 200, structures: signatures.size,
      uniqueVisible: visible.size, exactRepeats: 200 - visible.size,
      prefixes: [...prefixes].sort((a, b) => a - b), recipes, answers });
  }
  const selection = [
    ['nd02-network', 'beginner'], ['nd02-broadcast', 'beginner'], ['nd02-host', 'intermediate'],
    ['nd02-outside', 'intermediate'], ['nd02-self', 'advanced'], ['nd02-zero-host', 'advanced'],
    ['nd05-timeout', 'beginner'], ['nd05-partial', 'intermediate'], ['nd05-tcp', 'intermediate'],
    ['nd05-gateway', 'intermediate'], ['nd05-drop', 'advanced'], ['nd05-ingress', 'advanced'],
  ];
  const examples = selection.map(([recipe, difficulty], i) => generateDiagnosis({
    version: 1, archetype: recipe.startsWith('nd02') ? 'ND02' : 'ND05',
    difficulty, recipe, seed: 'diagnosis-review-' + String(i + 1).padStart(2, '0'),
  }));
  const labels = { yes: 'Ja', no: 'Nein', unknown: 'Nicht eindeutig bestimmbar' };
  const fence = String.fromCharCode(96).repeat(3);
  const rendered = examples.map((v, i) => [
    '### Beispiel ' + String(i + 1).padStart(2, '0') + ' — ' + v.recipe.recipe, '',
    fence + 'json', JSON.stringify(v.recipe), fence, '',
    '**' + v.case.title + '**', '', v.case.scenario, '',
    ...v.case.evidence.map(e => '- ' + e.text), '',
    ...v.case.questions.flatMap(q => [
      '**' + q.id + ': ' + q.prompt + '**', '', 'Antwort: **' + labels[q.answer] + '**.',
      '', 'Bezug: ' + q.basis.join(', ') + '.', '', q.explanation.reasoning, '',
      ...(q.answer === 'unknown' ? ['- ' + q.explanation.alternatives.yes, '- ' + q.explanation.alternatives.no, ''] : []),
    ]),
  ].join('\n')).join('\n');
  const hash = createHash('sha256').update(JSON.stringify(examples)).digest('hex');
  if (mode) {
    const file = new URL('../docs/network-diagnosis-generation.md', import.meta.url);
    const doc = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const marker = /<!-- generated-review:start -->[\s\S]*?<!-- generated-review:end -->/;
    assert(marker.test(doc), 'Review markers missing');
    const block = '<!-- generated-review:start -->\n\n' + rendered + '\n<!-- generated-review:end -->';
    if (mode === '--write-review') writeFileSync(file, doc.replace(marker, block));
    else assert.equal(doc.match(marker)[0], block, 'Review examples differ from generated content');
  }
  console.log(JSON.stringify({ version: 1, seeds: 'diagnosis-audit-0000..0199 per archetype/level',
    sampleCount: 1200, rows, reviewExamples: 12, reviewFingerprint: hash }, null, 2));
} finally { await vite.close(); }
