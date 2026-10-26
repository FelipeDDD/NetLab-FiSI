// Existing native Chromium harness; a fresh, disposable user-data directory.
process.env.NETLAB_APPLICATION_BOOT_REVIEW = '1';
await import('./test-project-repository.mjs');
