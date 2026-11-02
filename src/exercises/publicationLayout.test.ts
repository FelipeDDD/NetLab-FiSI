import { expect, it, vi } from 'vitest';
import { AVAILABLE_EXERCISES, PRACTICAL_EXERCISES } from './beta';
import { EXERCISE_MENU_GROUPS } from './menuGroups';
import { publishedExerciseLayout } from './publicationLayout';
import { structureMatches } from './practicalChecker';
import { PRACTICAL_SOURCES } from './practicalPublication';
import { NEW_EXERCISE_MAX_ZOOM, RESTORED_EXERCISE_MAX_ZOOM, requestExerciseViewport, useExerciseViewport } from './initialViewport';

it('groups every published exercise once, without adding internal factory drafts', () => {
  const ids = EXERCISE_MENU_GROUPS.flatMap(g => g.exercises);
  expect(ids.sort()).toEqual(AVAILABLE_EXERCISES.map(e => e.id).sort());
  expect(new Set(ids).size).toBe(ids.length);
});
it.each(PRACTICAL_EXERCISES)('spaces $id without changing any network data or the source', exercise => {
  const source = PRACTICAL_SOURCES[exercise.id].student.initialTopology;
  const before = structuredClone(source), spaced = publishedExerciseLayout(source);
  expect(source).toEqual(before);
  expect(structureMatches(source, spaced, { editable: {} })).toBe(true);
  const [a,b] = source.devices;
  expect(spaced.devices[1].x - spaced.devices[0].x).toBeCloseTo((b.x-a.x)*1.18);
  expect(exercise.student.initialTopology.devices.every(d => d.y === 100)).toBe(true);
});
it('uses the same 0.65 maximum framing for new and restored Beta attempts', () => {
  const listener = vi.fn(), release = useExerciseViewport.subscribe(listener);
  requestExerciseViewport('new-attempt');
  expect(NEW_EXERCISE_MAX_ZOOM).toBe(.65);
  expect(RESTORED_EXERCISE_MAX_ZOOM).toBe(.65);
  expect(useExerciseViewport.getState().draftId).toBe('new-attempt');
  useExerciseViewport.setState({ draftId: null });
  expect(listener).toHaveBeenCalledTimes(2); release();
});
