import students from './betaStudents.json';
import checks from './betaChecks.json';
import type { ExerciseDraft, Assessment } from './types';

export type StudentExercise = Pick<ExerciseDraft, 'id' | 'contentVersion' | 'student'>;
// Generated projections. This dependency graph never imports drafts.ts/review solutions.
export const BETA_EXERCISES = students as unknown as StudentExercise[];
export const betaChecks = checks as Record<string, Extract<Assessment, { kind: 'engine' }>[]>;
