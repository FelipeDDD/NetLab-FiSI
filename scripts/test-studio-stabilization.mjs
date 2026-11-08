process.env.NETLAB_STABILITY_CANVAS_REVIEW='1';
process.env.NETLAB_STUDIO_STABILIZATION_REVIEW='1';
if(process.env.NETLAB_STABILITY_CANVAS_ONLY==='1'){
  await import('./test-project-repository.mjs');
}else if(process.env.NETLAB_STABILITY_FULL==='1'){
  process.env.NETLAB_STUDIO_MOVE_FOOTER_FULL='1';
  await import('./test-studio-move-footer.mjs');
}else{
  process.env.NETLAB_STUDIO_CHECKPOINT='2';
  await import('./test-topology-studio.mjs');
}
