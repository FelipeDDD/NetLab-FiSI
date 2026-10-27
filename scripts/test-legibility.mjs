// Uses the existing disposable Chromium profile and isolated native IndexedDB.
process.env.NETLAB_LEGIBILITY_REVIEW = process.argv[2] === 'before' ? 'before' : 'after';
await import('./test-project-repository.mjs');
