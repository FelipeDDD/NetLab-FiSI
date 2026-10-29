// Internal authoring CLI, following validate-exercise-drafts.mjs. No browser, DB, or HTTP listener.
import { fileURLToPath } from 'node:url';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(a => !['--catalog', '--check-bundle'].includes(a) && !/^--(family|difficulty|seed|scenario)=.+/.test(a))) {
  throw new Error('Usage: node scripts/validate-network-factory.mjs [--catalog] [--check-bundle] [--family=cidr --scenario=mixed-masks --difficulty=intermediate --seed=example]');
}
const option = (key, fallback) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const { NETWORK_FACTORY_DRAFTS: drafts } = await vite.ssrLoadModule('/src/exercises/factory/catalog.ts');
  const { validateFactory } = await vite.ssrLoadModule('/src/exercises/factory/validate.ts');
  const { generate, FAMILIES, CIDR_SCENARIOS } = await vite.ssrLoadModule('/src/exercises/factory/generator.ts');
  const { grade } = await vite.ssrLoadModule('/src/exercises/factory/math.ts');
  const issues = validateFactory(drafts);
  if (issues.length) throw new Error(issues.join('\n'));
  let count = 0;
  for (const family of FAMILIES.filter(f => f !== 'cidr')) for (const difficulty of ['beginner', 'intermediate', 'advanced']) for (let i = 0; i < 10; i++) {
    const v = generate({ family, difficulty, seed: `review-${i}`, version: 1 });
    if (!grade(v.problem, v.reference).pass) throw new Error(`Variant failed: ${family}/${difficulty}/${i}`);
    count++;
  }
  for (const scenario of CIDR_SCENARIOS) for (const difficulty of ['beginner', 'intermediate', 'advanced']) for (let i = 0; i < 30; i++) {
    const v = generate({ family: 'cidr', scenario, difficulty, seed: `cidr-review-${i}`, version: 1 });
    if (!grade(v.problem, v.reference).pass) throw new Error(`CIDR variant failed: ${scenario}/${difficulty}/${i}`);
    count++;
  }
  console.log(`Valid: ${drafts.length} internal drafts; ${count} generated variants. Independent oracle and engine execution: run factory tests.`);
  for (const d of drafts) console.log(`${d.id}: ${d.review.assessments.filter(a => a.kind === 'engine').length} engine / ${d.review.assessments.filter(a => a.kind === 'math').length} math criteria / ${d.review.assessments.filter(a => a.kind === 'manual').length} mandatory manual${d.practice ? `; practice: ${d.practice.review.assessments.filter(a => a.kind === 'engine').length} engine / ${d.practice.review.assessments.filter(a => a.kind === 'manual').length} mandatory manual` : ''}`);
  if (args.some(a => a.startsWith('--family='))) console.log(JSON.stringify(generate({ family: option('family', 'subnet'), difficulty: option('difficulty', 'beginner'), seed: option('seed', 'example'), version: 1, ...(option('scenario', '') ? { scenario: option('scenario', '') } : {}) }), null, 2));
  if (args.includes('--catalog')) {
    const lines = [`# Interner Netzwerk-Katalog — ${drafts.length} Entwürfe`, '',
      'Generiert mit `node scripts/validate-network-factory.mjs --catalog`. Quelle: `src/exercises/factory/`. Nicht veröffentlicht, keine offiziellen IHK-Aufgaben. Lösungen sind nur für Autoren/Review bestimmt.', '',
      'Rechenaufgaben: reine strukturierte Korrektur ohne UI. Praktische Aufgaben: existierender Engine-Vertrag, zusätzlich genannte manuelle Grenzen beachten. Eine Prüfung des Diagnosewegs wird nicht behauptet.', ''];
    const bullet = rows => rows.map(r => `- ${r}`).join('\n');
    for (const d of drafts) {
      lines.push(`## ${d.id} — ${d.student.title}`, '', `Gruppe ${d.group} · ${d.difficulty} · ${d.category} · Version ${d.contentVersion} · draft`, '',
        d.student.description, '', '**Auftrag**', '', d.student.task, '', '**Lernziele**', '', bullet(d.student.learningObjectives.map(o => o.text)), '', '**Pflichtanforderungen**', '', bullet(d.student.requirements.map(r => `${r.id}: ${r.text}`)), '', '**Ausgangsdaten**', '');
      if (d.format === 'calculation') {
        lines.push('```json', JSON.stringify(d.student.initialData, null, 2), '```', '', '**Referenzantwort**', '', '```json', JSON.stringify(d.review.reference.answer, null, 2), '```');
      } else {
        const show = file => [
          '| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |',
          '|---|---|---|---|---|---|',
          ...file.devices.map(dev => `| ${dev.id} | ${dev.name} | ${dev.kind} | ${dev.ifaces.filter(i => i.ip).map(i => `${i.name}: ${i.ip}`).join('; ') || '—'} | ${dev.forwarding} | ${dev.routes.map(r => `${r.dest} via ${r.via ?? 'direkt'} dev ${r.dev}`).join('; ') || '—'} |`),
        ];
        lines.push(...show(d.student.initialTopology), '', '**Verkabelung**', '', bullet(d.student.initialTopology.links.map(l => `${l.id}: ${l.a.join('/')} ↔ ${l.b.join('/')}`)), '', '**Referenzkonfiguration**', '', ...show(d.review.reference.topology));
      }
      lines.push('', '**Erklärung**', '', d.review.reference.explanation, '', '**Zulässige Alternativen**', '', bullet(d.review.alternatives.map(a => `${a.description} ${a.rationale}`)), '', '**Falsche Antworten / Ablehnung**', '', bullet(d.review.rejectionCases), '', '**Typische Fehler**', '', bullet(d.review.commonMistakes), '', '**Korrekturzuordnung**', '',
        bullet(d.review.assessments.map(a => `${a.id} → ${a.requirementId}: ${a.kind === 'math' ? a.criterion : a.kind === 'manual' ? `MANUELL: ${a.procedure} ${a.reason}` : `ENGINE ${JSON.stringify(a.check)}`}`)), '', '**Grenzen**', '', bullet(d.review.limitations), '');
      if (d.review.hints) lines.push('**Optionale Hinweise**', '', bullet(d.review.hints), '');
      if (d.practice) {
        const p = d.practice;
        const state = file => file.devices.map(dev => `- ${dev.id} (${dev.name}, ${dev.kind}): ${dev.ifaces.filter(i => i.ip).map(i => `${i.name}=${i.ip}`).join(', ') || 'ohne IPv4'}; VLANs: ${JSON.stringify(dev.vlans ?? {})}; Forwarding: ${dev.forwarding}; Routen: ${JSON.stringify(dev.routes)}`).join('\n');
        lines.push('**Ausführbare Praxisbeilage**', '', `ID: ${p.id}. ${p.student.task}`, '', '**Praxis-Ausgangszustand**', '', state(p.student.initialTopology), '',
          '**Kabel (bleiben erhalten)**', '', bullet(p.student.initialTopology.links.map(l => `${l.id}: ${l.a.join('/')} ↔ ${l.b.join('/')}`)), '',
          '**Praxis-Referenzzustand**', '', state(p.review.reference.topology), '', p.review.reference.explanation, '',
          '**Praxis-Prüfungen**', '', bullet(p.review.assessments.map(a => `${a.id}: ${a.kind === 'engine' ? `ENGINE ${JSON.stringify(a.check)}` : `MANUELL: ${a.procedure} ${a.reason}`}`)), '',
          '**Praxis-Alternativen und Grenzen**', '', bullet(p.review.alternatives.map(a => a.description)), '', bullet(p.review.limitations), '');
      }
    }
    await writeFile(resolve(root, 'docs/network-exercise-catalog.md'), `${lines.join('\n').trimEnd()}\n`, 'utf8');
    console.log('Wrote docs/network-exercise-catalog.md (authoring only).');
  }
  if (args.includes('--check-bundle')) {
    const paths = (await readdir(resolve(root, 'dist/assets'))).filter(p => p.endsWith('.js'));
    if (!paths.length) throw new Error('Build first: no emitted JavaScript found');
    for (const path of paths) {
      const source = await readFile(resolve(root, 'dist/assets', path), 'utf8');
      for (const d of drafts) if (source.includes(d.id) || source.includes(d.student.title)) throw new Error(`Internal catalog leaked into ${path}`);
    }
    console.log(`No factory IDs/titles in ${paths.length} emitted JS chunks. Runtime graph still uses only beta projections.`);
  }
} finally { await vite.close(); }
