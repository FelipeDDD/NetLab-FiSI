import { expect, it } from 'vitest';
import { newAlternativeProgress } from './alternativePathsProgress';
import { alternativeReviewEvidence } from './alternativeReviewEvidence';
const hash='sha256-v1:'+'a'.repeat(64);
it('does not infer a cause or path from navigation alone',()=>{const p={...newAlternativeProgress('d'),step:16,completed:[12,13,14,16],hopUnderstood:true};expect(alternativeReviewEvidence(p)).toEqual({via:false,hop:false,failure:false,direct:false});});
it('retains real historical proof after network recovery',()=>{const p={...newAlternativeProgress('d'),stage:'lans' as const,step:16,completed:[12,13,14,15,16],hopUnderstood:true,viaBaseline:hash,failure:hash,storm:'applied' as const,viaReplies:{ab:hash,ba:hash},directReplies:{ab:hash,ba:hash}};expect(alternativeReviewEvidence(p)).toEqual({via:true,hop:true,failure:true,direct:true});expect(alternativeReviewEvidence({...p,directReplies:{ab:hash,ba:null}}).direct).toBe(false);});
