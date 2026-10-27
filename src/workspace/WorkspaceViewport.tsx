import { useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow, useStore as useFlowStore } from '@xyflow/react';
import { useStore } from '../store';

/** Fit once after activating/measuring a document. Resizing panels or the
 * browser must never override the user's pan/zoom. Manual Fit View is separate. */
export function WorkspaceViewport() {
  const { fitView } = useReactFlow();
  const width = useFlowStore(s => s.width), height = useFlowStore(s => s.height);
  const initialized = useNodesInitialized();
  const generation = useStore(s => s.topologyGeneration);
  const empty = useStore(s => s.nodes.length === 0);
  const fitted = useRef<number>();
  useEffect(() => {
    if (fitted.current === generation || !width || !height) return;
    // An empty document has nothing to frame. Adding its first device later is
    // an editor action, not a new document activation.
    if (empty) { fitted.current = generation; return; }
    if (!initialized) return;
    // React Flow's own measured dimensions and node initialization must settle
    // before fitting; a DOM resize can precede its internal store update.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        fitted.current = generation;
        void fitView({ padding: .25, maxZoom: 1.25 });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [generation, empty, width, height, initialized, fitView]);
  return null;
}
