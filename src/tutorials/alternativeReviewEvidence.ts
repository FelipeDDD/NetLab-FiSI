import { alternativeFinalProved, type AlternativePathsProgress } from './alternativePathsProgress';

/** Presentation only: saved completion is distinct from live route validation.
 * Old waivers allow navigation, but cannot supply missing packet observations.
 * Investigation digests (steps 7/10) do not record a cause or an exact command.
 */
export function alternativeReviewEvidence(p: AlternativePathsProgress) {
  const earned = (step: number) => p.completed.includes(step);
  const via = earned(12) && !!p.viaReplies.ab && p.viaReplies.ab === p.viaReplies.ba;
  const e = p.lpm.experiment;
  const experiment = !p.lpm.legacy && !e.legacy && !!p.lpm.pc;
  return {
    via,
    hop: earned(13) && p.hopUnderstood && via,
    broad: experiment && earned(17) && !!e.broad,
    comparison: experiment && earned(19) && p.lpmUnderstood && !!e.r2 && !!e.broad && !!e.specific,
    failure: earned(20) && !!p.failure && (p.storm === 'applied' || p.storm === 'adopted'),
    direct: earned(22) && alternativeFinalProved(p),
  };
}
