process.env.NETLAB_STUDIO_COMPACT_REVIEW = '1';
if (process.env.NETLAB_STUDIO_COMPACT_FULL === '1') await import('./test-topology-refinement.mjs');
else {
  process.env.NETLAB_STUDIO_CHECKPOINT = '2';
  await import('./test-topology-studio.mjs');
}
