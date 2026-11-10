import { expect, it } from 'vitest';
import { alternativeReviewEvidence } from './alternativeReviewEvidence';
import { emptyLpm } from './alternativeLpm';
import { emptyNeighborProofs, type AlternativePathsProgress } from './alternativePathsProgress';
import { ALTERNATIVE_IDS as I } from './alternativePathsChapter';

const hash = `sha256-v1:${'a'.repeat(64)}`;
function record(): AlternativePathsProgress {
  return { schemaVersion:1,chapterId:'alternative-paths',chapterVersion:4,draftId:'draft',attemptId:crypto.randomUUID(),prepared:true,stage:'lans',step:19,completed:[],
    extension:{a:'02:00:00:00:00:01',b:'02:00:00:00:00:02'},neighbors:emptyNeighborProofs(),remoteUnderstood:false,hopUnderstood:false,lpmUnderstood:false,
    viaReplies:{ab:null,ba:null},directReplies:{ab:null,ba:null},viaBaseline:null,failure:null,investigated:null,returnInvestigated:null,lpm:emptyLpm(),storm:'pending' };
}
it('does not infer observations, causes or commands from the current step, answers or old waivers',()=>{
  const p=record();p.lpm.legacy=p.lpm.experiment.legacy=p.lpmUnderstood=p.hopUnderstood=true;p.investigated=p.returnInvestigated=hash;
  expect(Object.values(alternativeReviewEvidence(p))).toEqual(Array(6).fill(false));
  expect(alternativeReviewEvidence(p)).not.toHaveProperty('investigation');
  expect(alternativeReviewEvidence(p)).not.toHaveProperty('command');
});
it('requires the saved bidirectional proof as well as the completed next-hop answer',()=>{
  const p=record();p.completed=[12,13];p.hopUnderstood=true;
  expect(alternativeReviewEvidence(p).hop).toBe(false);p.viaReplies={ab:hash,ba:hash};
  expect(alternativeReviewEvidence(p)).toMatchObject({via:true,hop:true});
  p.hopUnderstood=false;expect(alternativeReviewEvidence(p).hop).toBe(false);
});
it('keeps recorded LPM observations separate from live state and retains the actual asymmetric return',()=>{
  const p=record();p.completed=[16,17,18,19];p.lpm.pc={id:'c',mac:'02:00:00:00:00:03'};p.lpm.stage='ready';p.lpm.baseline=Object.values(I);p.lpmUnderstood=true;
  const e=p.lpm.experiment;e.r2={hash,reply:['c',I.r3,I.r2]};e.broad={hash,reply:['c',I.r3,I.r2,I.r1,I.a]};e.specific={hash,reply:['c',I.r3,I.r1,I.a]};
  const before=structuredClone(p);p.storm='applied';expect(alternativeReviewEvidence(p)).toMatchObject({broad:true,comparison:true});
  expect(p.lpm).toEqual(before.lpm);e.specific=null;expect(alternativeReviewEvidence(p).comparison).toBe(false);
  e.legacy=true;expect(alternativeReviewEvidence(p).broad).toBe(false);
});
it('does not turn another completed task or a lone receipt into credit for an unperformed task',()=>{
  const p=record();p.completed=[14,15,16];p.lpm.pc={id:'c',mac:'02:00:00:00:00:03'};p.lpm.experiment.broad={hash,reply:['c',I.r3,I.r1,I.a]};
  expect(alternativeReviewEvidence(p)).toMatchObject({broad:false,comparison:false});
});
it('reveals the storm explanation only for a recorded failure with the known incident, not a legacy failure of unknown origin',()=>{
  const p=record();p.completed=[20];p.failure=hash;
  expect(alternativeReviewEvidence(p).failure).toBe(false);p.storm='applied';expect(alternativeReviewEvidence(p).failure).toBe(true);
  p.storm='legacy';expect(alternativeReviewEvidence(p).failure).toBe(false);
});
