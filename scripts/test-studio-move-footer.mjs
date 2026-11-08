process.env.NETLAB_STUDIO_MOVE_FOOTER_REVIEW = '1';
if (process.env.NETLAB_STUDIO_MOVE_FOOTER_FULL === '1') {
  process.env.NETLAB_STUDIO_DISTANCE_FLIP_FULL = '1';
  await import('./test-studio-distance-flip.mjs');
} else {
  process.env.NETLAB_STUDIO_CHECKPOINT = '2';
  await import('./test-topology-studio.mjs');
}
