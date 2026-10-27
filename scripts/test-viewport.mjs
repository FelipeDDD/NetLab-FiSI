// Reuse the native Chromium harness and its isolated profile/storage assertions.
process.env.NETLAB_VIEWPORT_REVIEW = '1';
await import('./test-project-repository.mjs');
