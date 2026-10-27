// Development only. Uses the project's installed Vite to load TypeScript; no
// browser, HTTP listener, database, AI API or publication step is involved.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  root, configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { EXERCISE_DRAFTS } = await vite.ssrLoadModule('/src/exercises/drafts.ts');
  const { validateDraftCollection } = await vite.ssrLoadModule('/src/exercises/validate.ts');
  const issues = validateDraftCollection(EXERCISE_DRAFTS);
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Structure/engine compatibility: ${EXERCISE_DRAFTS.length} drafts valid.`);
    for (const draft of EXERCISE_DRAFTS) {
      const manual = draft.review.assessments.filter(a => a.kind === 'manual').length;
      const automated = draft.review.assessments.length - manual;
      console.log(`${draft.id} v${draft.contentVersion}: ${automated} engine probes, ${manual} manual criteria`);
    }
    console.log('Not an approval of solutions or pedagogy. Run drafts.test.ts and human review before publication.');
  }
} finally { await vite.close(); }
