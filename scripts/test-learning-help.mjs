// Disposable Chromium profile/database; shares the existing repository review harness.
process.env.NETLAB_LEARNING_HELP_REVIEW = '1';
await import('./test-project-repository.mjs');
