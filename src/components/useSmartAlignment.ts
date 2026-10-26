import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeChange } from '@xyflow/react';
import { useStore } from '../store';
import type { DevNode } from '../store';
import { alignNodeAnchors } from '../alignmentGuides';
import type { AlignmentGuide, AlignmentLocks } from '../alignmentGuides';
import { useAlignmentPreference } from '../alignmentPreferences';

export function useSmartAlignment(reconnecting: boolean) {
  const enabled = useAlignmentPreference(s => s.enabled);
  const { getZoom } = useReactFlow();
  const session = useRef<{ ids: Set<string>; locks: AlignmentLocks; alt: boolean } | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const clearLines = useCallback(() => setGuides(previous => previous.length ? [] : previous), []);
  const reset = useCallback(() => { session.current = null; clearLines(); }, [clearLines]);
  const begin = useCallback((event: { altKey?: boolean }, moving: DevNode[]) => {
    session.current = { ids: new Set(moving.map(n => n.id)), locks: {}, alt: event.altKey === true };
    clearLines();
  }, [clearLines]);

  useEffect(() => {
    if (!enabled) { if (session.current) session.current.locks = {}; clearLines(); }
    if (reconnecting) reset();
  }, [enabled, reconnecting, clearLines, reset]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!session.current || event.key !== 'Alt') return;
      session.current.alt = event.type === 'keydown';
      if (session.current.alt) { session.current.locks = {}; clearLines(); }
    };
    const move = (event: MouseEvent) => { if (session.current) session.current.alt = event.altKey; };
    window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    // Registered before the native drag listener so each update sees Alt now.
    window.addEventListener('mousemove', move, true);
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      window.removeEventListener('mousemove', move, true);
    };
  }, [clearLines]);

  const onNodesChange = useCallback((changes: NodeChange<DevNode>[]) => {
    const current = session.current, state = useStore.getState();
    if (!current) { state.onNodesChange(changes); return; }
    const positions = changes.flatMap(change => change.type === 'position' && change.position && current.ids.has(change.id)
      ? [{ id: change.id, position: change.position }] : []);
    if (!positions.length) { state.onNodesChange(changes); return; }
    if (!useAlignmentPreference.getState().enabled || state.reconnectingCable || current.alt) {
      current.locks = {}; clearLines(); state.onNodesChange(changes); return;
    }
    const aligned = alignNodeAnchors(state.nodes, positions, getZoom(), current.locks, current.ids);
    current.locks = aligned.locks;
    const corrected = changes.map(change => change.type === 'position' && change.position && current.ids.has(change.id)
      ? { ...change, position: { x: change.position.x + aligned.offset.x, y: change.position.y + aligned.offset.y } } : change);
    // The final dragging:false coordinates are corrected too, before history
    // records the movement. Native drag internals keep their raw cursor offset.
    state.onNodesChange(corrected);
    if (changes.some(c => c.type === 'position' && current.ids.has(c.id) && c.dragging === false)) clearLines();
    else setGuides(aligned.guides);
  }, [getZoom, clearLines]);
  return { begin, reset, onNodesChange, guides: enabled && !reconnecting ? guides : [] };
}
