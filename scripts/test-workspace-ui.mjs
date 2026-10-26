// Reuse the native Chromium harness and its fresh-profile safety assertions.
process.env.NETLAB_WORKSPACE_UI_REVIEW = '1';
await import('./test-project-repository.mjs');
