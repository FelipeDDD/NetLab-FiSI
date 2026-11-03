// Reuses the isolated profile/database harness and the complete real Chapter 1.
process.env.NETLAB_SUBNET_TUTORIAL_REVIEW = '1';
await import('./test-guided-tutorial.mjs');
