// Existing disposable Chromium/IndexedDB harness; never opens a user's browser profile.
process.env.NETLAB_EXERCISE_REVIEW='1';
process.env.NETLAB_PRACTICAL_REVIEW='1';
await import('./test-project-repository.mjs');
