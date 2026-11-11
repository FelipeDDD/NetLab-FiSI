import { expect, it } from 'vitest';
import { newAlternativeProgress, readAlternativeProgress, ALTERNATIVE_PROGRESS_PREFIX } from './alternativePathsProgress';
import { checkpointKey } from './chapterCheckpoints';
it.each([1,2,3,4])('does not interpret edition %i as v5 or mutate it',chapterVersion=>{const old={...newAlternativeProgress('draft'),chapterVersion,step:20},before=structuredClone(old);expect(()=>readAlternativeProgress(old,'draft')).toThrow();expect(old).toEqual(before);});
it('isolates chapter-5 keys without changing earlier chapter namespaces',()=>{expect(ALTERNATIVE_PROGRESS_PREFIX).toBe('guided:alternative-paths:v5:draft:');expect(checkpointKey('draft','alternative-paths')).toBe('guided:checkpoint:v5:draft:alternative-paths');expect(checkpointKey('draft','static-routing')).toBe('guided:checkpoint:v1:draft:static-routing');});
it('does not accept a final navigation step as packet evidence',()=>{const p=newAlternativeProgress('draft');expect(()=>readAlternativeProgress({...p,step:16,completed:[16]},'draft')).toThrow();expect(readAlternativeProgress(p,'draft')).toEqual(p);});
