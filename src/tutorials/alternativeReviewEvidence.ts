import { alternativeFinalProved, type AlternativePathsProgress } from './alternativePathsProgress';
/** Historical evidence is distinct from the live network. */
export function alternativeReviewEvidence(p:AlternativePathsProgress){
  const via=p.completed.includes(12)&&!!p.viaReplies.ab&&p.viaReplies.ab===p.viaReplies.ba;
  return {via,hop:p.completed.includes(13)&&p.hopUnderstood&&via,failure:p.completed.includes(14)&&!!p.failure&&p.storm!=='pending',direct:p.completed.includes(16)&&alternativeFinalProved(p)};
}
