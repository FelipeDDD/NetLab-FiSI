import { expect, it } from 'vitest';
import { readAlternativeProgress, emptyNeighborProofs } from './alternativePathsProgress';
import { alternativePathsCompletion } from './completion';
import { alternativePathsDocument } from './alternativePathsChapter';
import { readChapterCheckpoint } from './chapterCheckpoints';
import { emptyLpm } from './alternativeLpm';
import { ALTERNATIVE_IDS } from './alternativePathsChapter';

const hash = `sha256-v1:${'a'.repeat(64)}`, other = `sha256-v1:${'b'.repeat(64)}`;
const legacy = () => ({ schemaVersion: 1, chapterId: 'alternative-paths', chapterVersion: 1, draftId: 'draft', attemptId: '00000000-0000-4000-8000-000000000001',
  prepared: true, stage: 'triangle', step: 1, completed: [] as number[], extension: null as null | { a: string; b: string }, neighbors: emptyNeighborProofs(), remoteUnderstood: false,
  hopUnderstood: false, lpmUnderstood: false, viaReplies: { ab: null as string | null, ba: null as string | null }, viaBaseline: null as string | null,
  failure: null as string | null, directReplies: { ab: null as string | null, ba: null as string | null } });
function through(step: number, completed = Array.from({ length: step - 1 }, (_, i) => i + 1)) {
  const p = legacy(); p.step = step; p.completed = completed;
  if (step >= 3 || completed.includes(2)) for (const key of Object.keys(p.neighbors) as (keyof typeof p.neighbors)[]) p.neighbors[key] = hash;
  if (step >= 4 || completed.includes(3)) p.remoteUnderstood = true;
  if (step >= 4) { p.stage = 'lans'; p.extension = { a: '02:00:00:00:00:01', b: '02:00:00:00:00:02' }; }
  if (step >= 6 || completed.includes(5)) p.viaReplies = { ab: hash, ba: hash };
  if (step >= 7 || completed.includes(6)) { p.hopUnderstood = p.lpmUnderstood = true; p.viaBaseline = hash; }
  if (step >= 8 || completed.includes(7)) p.failure = other;
  if (completed.includes(8)) p.directReplies = { ab: other, ba: other };
  return p;
}
it.each([[1, 1], [2, 1], [3, 4], [4, 5], [5, 7], [6, 13], [7, 20], [8, 21]])('migrates legacy navigation %i → %i without changing its receipts or input', (oldStep, nextStep) => {
  const p = through(oldStep), before = structuredClone(p), result = readAlternativeProgress(p, 'draft');
  expect(result.step).toBe(nextStep); expect(result.chapterVersion).toBe(4); expect(p).toEqual(before);
  for (const field of ['attemptId', 'prepared', 'stage', 'extension', 'neighbors', 'viaReplies', 'viaBaseline', 'failure', 'directReplies'] as const) expect(result[field]).toEqual(p[field]);
  expect(readAlternativeProgress(result, 'draft')).toEqual(result);
});
it('keeps a completed old attempt complete with explicit historical LPM credit', () => {
  const p = through(8, [1, 2, 3, 4, 5, 6, 7, 8]), result = readAlternativeProgress(p, 'draft');
  expect(result.step).toBe(22); expect(result.completed).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,20,21,22]);
  expect(alternativePathsCompletion(result)).toEqual({ completed: 22, total: 22, complete: true });
  expect(result.investigated).toBe(hash); expect(result.returnInvestigated).toBe(hash);
});

it.each([[16, false], [17, false], [17, true], [18, true], [20, true]] as const)('migrates v3 task %i (LPM completed: %s) without inventing R2 or broad-path packets', (step, completed) => {
  const base = readAlternativeProgress(through(6), 'draft');
  const { experiment: _experiment, ...lpm } = emptyLpm();
  const old = { ...base, chapterVersion: 3, step, stage: 'lans', completed: Array.from({length: step === 20 || step === 17 && completed ? step : step - 1}, (_, i) => i + 1),
    remoteUnderstood: true, hopUnderstood: true, lpmUnderstood: completed, investigated: hash, returnInvestigated: hash,
    viaBaseline: completed ? hash : null, failure: step >= 19 ? other : null,
    directReplies: step === 20 ? {ab:other,ba:other} : {ab:null,ba:null},
    lpm: {...lpm,stage:'ready',baseline:Object.values(ALTERNATIVE_IDS),pc:{id:'new-c',mac:'02:00:00:00:00:03'},localReply:hash,pathReply:completed?hash:null} };
  const before = structuredClone(old), p = readAlternativeProgress(old, 'draft');
  expect(old).toEqual(before); expect(p.chapterVersion).toBe(4);
  expect(p.step).toBe(step <= 17 ? completed ? 19 : 16 : step + 2);
  expect(p.lpm.experiment).toEqual({legacy:completed,r2:null,broad:null,specific:null});
  expect(p.lpm.pc).toEqual(old.lpm.pc); expect(p.lpm.pathReply).toBe(old.lpm.pathReply);
  expect(readAlternativeProgress(p,'draft')).toEqual(p);
  if(step===20)expect(alternativePathsCompletion(p)).toEqual({completed:22,total:22,complete:true});
});

it('rejects a v4 completion without fresh receipts or a receipt with the wrong return endpoint', () => {
  const p=readAlternativeProgress(through(6),'draft');
  p.step=16;p.completed=[16];p.lpm={...emptyLpm(),stage:'ready',baseline:Object.values(ALTERNATIVE_IDS),pc:{id:'new-c',mac:'02:00:00:00:00:03'}};
  expect(()=>readAlternativeProgress(p,'draft')).toThrow('Incompatible');
  p.lpm.experiment.r2={hash,reply:['new-c',ALTERNATIVE_IDS.r3]};
  expect(()=>readAlternativeProgress(p,'draft')).toThrow('Incompatible');
});

it('adopts old Part 4 attempts without retroactive storms and keeps pre-incident attempts pending', () => {
  const start=readAlternativeProgress(through(6),'draft');
  const {storm:_storm,...oldStart}=start;
  expect(readAlternativeProgress(oldStart,'draft').storm).toBe('pending');
  const finished=readAlternativeProgress(through(8,[1,2,3,4,5,6,7,8]),'draft');
  const {storm:_oldStorm,...oldFinished}=finished;
  expect(readAlternativeProgress(oldFinished,'draft').storm).toBe('legacy');
  expect(alternativePathsCompletion(readAlternativeProgress(oldFinished,'draft')).complete).toBe(true);
  expect(()=>readAlternativeProgress({...oldFinished,storm:'pending'},'draft')).toThrow('Incompatible');
  expect(()=>readAlternativeProgress({...oldStart,storm:'unexpected'},'draft')).toThrow('Incompatible');
  expect(()=>readAlternativeProgress({...oldStart,storm:null},'draft')).toThrow('Incompatible');
});
it('does not invent ping evidence for an old addressing-only task or an unfinished route task', () => {
  const addressed = readAlternativeProgress(through(2, [1]), 'draft');
  expect(addressed.completed).toEqual([]); expect(addressed.neighbors).toEqual(emptyNeighborProofs());
  const partial = readAlternativeProgress(through(5), 'draft');
  expect(partial.completed).toEqual([1, 2, 3, 4, 5, 6]); expect(partial.investigated).toBeNull(); expect(partial.returnInvestigated).toBeNull();
});
it('recovers an old pending PC insertion at its mapped transition and retains initial checkpoints', () => {
  const pending = through(3, [1, 2, 3]); pending.stage = 'adding-pcs';
  expect(readAlternativeProgress(pending, 'draft')).toMatchObject({ stage: 'adding-pcs', step: 4, extension: null });
  const document = alternativePathsDocument(), checkpoint = { schemaVersion: 1, kind: 'chapter-checkpoint', chapter: 'alternative-paths', draftId: 'draft', attemptId: legacy().attemptId,
    before: document, initial: document, progress: legacy() };
  const before = structuredClone(checkpoint), read = readChapterCheckpoint(checkpoint, 'draft', 'alternative-paths');
  expect(read.progress).toMatchObject({ chapterVersion: 4, step: 1, completed: [] }); expect(checkpoint).toEqual(before);
});
it('rejects invalid old evidence before migrating and incomplete new final claims', () => {
  const bad = through(8, [1, 2, 3, 4, 5, 6, 7, 8]); bad.directReplies.ba = hash;
  expect(() => readAlternativeProgress(bad, 'draft')).toThrow('Incompatible');
  const p = through(3); p.neighbors.n21 = other;
  expect(() => readAlternativeProgress(p, 'draft')).toThrow('Incompatible');
  const next = readAlternativeProgress(legacy(), 'draft'); next.completed = [22];
  expect(() => readAlternativeProgress(next, 'draft')).toThrow('Incompatible');
  expect(() => readAlternativeProgress({ ...legacy(), chapterVersion: 5 }, 'draft')).toThrow('Incompatible');
});

it.each([false,true])('preserves an old step 14 without inventing LAN C or ping receipts (old theory completed: %s)',completed=>{
  const {lpm: _lpm,...base}=readAlternativeProgress(through(7),'draft');
  const old={...base,chapterVersion:2,step:14,completed:Array.from({length:completed?14:13},(_,i)=>i+1),lpmUnderstood:completed,viaBaseline:completed?hash:null};
  const before=structuredClone(old),p=readAlternativeProgress(old,'draft');
  expect(old).toEqual(before);expect(p.step).toBe(14);expect(p.lpm).toEqual({stage:'unprepared',baseline:null,pc:null,localReply:null,pathReply:null,legacy:completed,experiment:{legacy:completed,r2:null,broad:null,specific:null}});
  expect(p.completed).toEqual(Array.from({length:13},(_,i)=>i+1));expect(p.viaReplies).toEqual(old.viaReplies);expect(p.attemptId).toBe(old.attemptId);
  expect(readAlternativeProgress(p,'draft')).toEqual(p);
});
