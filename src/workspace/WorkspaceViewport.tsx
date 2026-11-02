import { useContext, useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow, useStore as useFlowStore } from '@xyflow/react';
import type { Viewport } from '@xyflow/react';
import { useStore } from '../store';
import { ExerciseViewportContext, NEW_EXERCISE_MAX_ZOOM, RESTORED_EXERCISE_MAX_ZOOM, useExerciseViewport } from '../exercises/initialViewport';

/** Fit once after activating/measuring a document. Resizing panels or the
 * browser must never override the user's pan/zoom. Manual Fit View is separate. */
export function WorkspaceViewport() {
  const { fitView, getViewport, setViewport } = useReactFlow();
  const width = useFlowStore(s => s.width), height = useFlowStore(s => s.height);
  const initialized = useNodesInitialized();
  const generation = useStore(s => s.topologyGeneration);
  const draftId = useStore(s => s.workspaceIdentity?.draftId);
  const documentKey = useStore(s => s.workspaceIdentity?.draftId ? `${s.workspaceIdentity.sessionId}:${s.workspaceIdentity.draftId}` : null);
  const exerciseDraft = useExerciseViewport(s => s.draftId);
  const exerciseInfo = useContext(ExerciseViewportContext);
  const loadingExercises = exerciseInfo?.loading ?? false;
  const betaExercise = !!draftId && !!exerciseInfo?.draftIds.has(draftId);
  const empty = useStore(s => s.nodes.length === 0);
  const viewports = useRef(new Map<string, Viewport>());
  const active = useRef<{ generation: number; key: string | null; framed: boolean }>();
  useEffect(() => {
    if (active.current?.generation !== generation || active.current.key !== documentKey) {
      const previous = active.current;
      if (previous?.key && previous.framed) viewports.current.set(previous.key, getViewport());
      // Replacing a document inside the same draft is different from returning
      // to an already open tab. Do not restore another topology's viewport.
      if (documentKey && previous?.key === documentKey) viewports.current.delete(documentKey);
      active.current = { generation, key: documentKey, framed: false };
    }
    const current = active.current;
    if (current.framed || !width || !height || loadingExercises) return;
    // An empty document has nothing to frame. Adding its first device later is
    // an editor action, not a new document activation.
    if (empty) { current.framed = true; return; }
    if (!initialized) return;
    const newExercise = !!draftId && exerciseDraft === draftId;
    // React Flow's own measured dimensions and node initialization must settle
    // before fitting; a DOM resize can precede its internal store update.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        current.framed = true;
        const saved = documentKey && viewports.current.get(documentKey);
        if (saved && !newExercise) void setViewport(saved);
        else void fitView({ padding: .25, maxZoom: newExercise ? NEW_EXERCISE_MAX_ZOOM : betaExercise ? RESTORED_EXERCISE_MAX_ZOOM : 1.25 });
        if (newExercise) useExerciseViewport.setState({ draftId: null });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [generation, empty, width, height, initialized, fitView, getViewport, setViewport, documentKey, draftId, exerciseDraft, loadingExercises, betaExercise]);
  return null;
}
