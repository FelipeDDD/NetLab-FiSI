process.env.NETLAB_STUDIO_PAGE_LAYOUTS_REVIEW = '1';
if (process.env.NETLAB_STUDIO_PAGE_LAYOUTS_FULL === '1') {
  process.env.NETLAB_STUDIO_COMPACT_FULL = '1';
  await import('./test-topology-compact.mjs');
}
else {
  process.env.NETLAB_STUDIO_CHECKPOINT = '2';
  await import('./test-topology-studio.mjs');
}
