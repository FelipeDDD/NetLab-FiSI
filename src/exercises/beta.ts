import students from './betaStudents.json';
import checks from './betaChecks.json';
import type { ExerciseDraft, Assessment } from './types';
import practicalStudents from './practicalStudents.json';
import practicalRules from './practicalRules.json';
import type { PracticalCriterion, PracticalExercise } from './practicalTypes';

export type StudentExercise = Pick<ExerciseDraft, 'id' | 'contentVersion' | 'student'>;
// Generated projections. This dependency graph never imports drafts.ts/review solutions.
export const BETA_EXERCISES = students as unknown as StudentExercise[];
export const betaChecks = checks as Record<string, Extract<Assessment, { kind: 'engine' }>[]>;
export const PRACTICAL_EXERCISES=practicalStudents as unknown as PracticalExercise[];
export const practicalChecks=practicalRules as unknown as Record<string,PracticalCriterion[]>;
export const AVAILABLE_EXERCISES:StudentExercise[]=[...BETA_EXERCISES,...PRACTICAL_EXERCISES];
export const practicalExercise=(id:string)=>PRACTICAL_EXERCISES.find(e=>e.id===id);
export const exerciseChecks=(id:string)=>practicalChecks[id]??betaChecks[id]??[];
