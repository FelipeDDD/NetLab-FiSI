import { describe, expect, it } from 'vitest';
import { AVAILABLE_EXERCISES, exerciseChecks } from './beta';
import { EXERCISE_PANEL_INTRO, summarizeExerciseChecks } from './panelContent';

describe('compact exercise panel content', () => {
  it('provides a short, exercise-specific introduction for all six published exercises', () => {
    expect(AVAILABLE_EXERCISES).toHaveLength(6);
    for (const exercise of AVAILABLE_EXERCISES) {
      const intro = EXERCISE_PANEL_INTRO[exercise.id];
      expect(intro, exercise.id).toBeTruthy();
      expect(intro.match(/[.!?](?:\s|$)/g)?.length, exercise.id).toBeGreaterThanOrEqual(2);
      expect(intro.match(/[.!?](?:\s|$)/g)?.length, exercise.id).toBeLessThanOrEqual(4);
    }
    expect(Object.keys(EXERCISE_PANEL_INTRO)).toHaveLength(6);
  });

  it('counts passed requirement groups only after every check in that group has a result', () => {
    const exercise = AVAILABLE_EXERCISES.find(item => item.id === 'pilot-d02-v1')!;
    const checks = exerciseChecks(exercise.id);
    const requirements = exercise.student.requirements;
    expect(summarizeExerciseChecks(requirements, checks, {})).toEqual({ passed: 0, checked: 0, total: 4 });

    const results = Object.fromEntries(checks.map((check, index) => [check.id, { pass: index !== 0 }]));
    expect(summarizeExerciseChecks(requirements, checks, results)).toEqual({ passed: 3, checked: 4, total: 4 });

    const partial = { ...results };
    delete partial[checks.find(check => check.requirementId === 'traffic')!.id];
    expect(summarizeExerciseChecks(requirements, checks, partial)).toEqual({ passed: 2, checked: 3, total: 4 });
  });
});
