// Test-only probe, injected by the disposable Chromium harness, never main.tsx.
import { useLayoutEffect } from 'react';
import { useReactFlow, type ReactFlowInstance } from '@xyflow/react';

let current: ReactFlowInstance | undefined;
export function getViewportProbe(): ReactFlowInstance {
  if (!current) throw Error('The isolated viewport probe has not mounted.');
  return current;
}
export function WorkspaceViewportProbe() {
  const flow = useReactFlow();
  useLayoutEffect(() => { current = flow; return () => { if (current === flow) current = undefined; }; }, [flow]);
  return null;
}
