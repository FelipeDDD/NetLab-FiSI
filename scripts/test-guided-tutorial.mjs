// Isolated browser/profile; exercises remain regression checks, not tutorial graders.
process.env.NETLAB_EXERCISE_REVIEW = '1';
process.env.NETLAB_PRACTICAL_REVIEW = '1';
process.env.NETLAB_GUIDED_TUTORIAL_REVIEW = '1';
await import('./test-project-repository.mjs');
