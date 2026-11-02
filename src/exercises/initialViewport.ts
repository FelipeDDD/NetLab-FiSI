import { create } from 'zustand';
import { createContext } from 'react';

/** Scoped to the exercise controller's validated attempt metadata. */
export const ExerciseViewportContext = createContext<{ loading: boolean; draftIds: ReadonlySet<string> } | null>(null);

/** One-shot presentation hint; never part of a saved topology or attempt. */
export const useExerciseViewport = create<{ draftId: string | null }>(() => ({ draftId: null }));
export function requestExerciseViewport(draftId: string) { useExerciseViewport.setState({ draftId }); }
export const NEW_EXERCISE_MAX_ZOOM = 0.65;
export const RESTORED_EXERCISE_MAX_ZOOM = 0.65;
