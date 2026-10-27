import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const { EXERCISE_DRAFTS } = await vite.ssrLoadModule('/src/exercises/drafts.ts');
  const { validateDraftCollection } = await vite.ssrLoadModule('/src/exercises/validate.ts');
  const errors = validateDraftCollection(EXERCISE_DRAFTS); if (errors.length) throw Error(errors.join('\n'));
  const selected = EXERCISE_DRAFTS.filter(d => ['fisi-office-warehouse-routing', 'fisi-service-portal'].includes(d.id));
  if (selected.length !== 2 || selected.some(d => d.review.assessments.some(a => a.kind !== 'engine'))) throw Error('Beta requires two fully automated drafts.');
  for (const [name, data] of [
    ['betaStudents', selected.map(({ id, contentVersion, student }) => ({ id, contentVersion, student }))],
    ['betaChecks', Object.fromEntries(selected.map(d => [d.id, d.review.assessments]))],
  ]) await writeFile(new URL(`../src/exercises/${name}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
} finally { await vite.close(); }
