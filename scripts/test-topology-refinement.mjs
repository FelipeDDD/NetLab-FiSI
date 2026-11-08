process.env.NETLAB_STUDIO_REFINEMENT_REVIEW = '1';
if (process.env.NETLAB_STUDIO_REFINEMENT_ONLY === '1') {
  process.env.NETLAB_STUDIO_CHECKPOINT = '2';
  await import('./test-topology-studio.mjs');
} else await import('./test-topology-usability.mjs');
