process.env.NETLAB_STUDIO_PERSISTENCE_REVIEW = '1';
if (process.env.NETLAB_STUDIO_PERSISTENCE_FULL === '1') {
  process.env.NETLAB_STUDIO_PAGE_LAYOUTS_FULL = '1';
  await import('./test-topology-page-layouts.mjs');
} else {
  process.env.NETLAB_STUDIO_CHECKPOINT = '2';
  await import('./test-topology-studio.mjs');
}
