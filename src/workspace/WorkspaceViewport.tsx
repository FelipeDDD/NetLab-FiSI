import { useEffect } from 'react';
import { useNodesInitialized, useReactFlow, useStore as useFlowStore } from '@xyflow/react';
import { useWorkspaceUI } from './WorkspaceUI';

/** The opt-in workspace fits a newly activated document or resized canvas;
 * engine, history, editor and terminal instances are never remounted here. */
export function WorkspaceViewport() {
  const { fitView } = useReactFlow(); const workspace = useWorkspaceUI();
  const width = useFlowStore(s => s.width), height = useFlowStore(s => s.height);
  const initialized = useNodesInitialized();
  const active = workspace?.state.activeDraftId;
  useEffect(() => {
    if (!initialized || !width || !height) return;
    // React Flow's own measured dimensions and node initialization must settle
    // before fitting; a DOM resize can precede its internal store update.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { void fitView({ padding: .25, maxZoom: 1.25 }); });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, width, height, initialized, fitView]);
  return null;
}
