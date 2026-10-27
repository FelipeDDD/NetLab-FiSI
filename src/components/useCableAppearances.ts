import { useMemo } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import type { Network } from '../engine/network';
import { resolvedCableAppearances, type CableAppearances } from '../cableAppearance';

// Share the projection between edges, RJ45 tips and interface labels. An edge
// snapshot is replaced on topology edits; weak keys do not retain old layouts.
const cache = new WeakMap<object, { net: Network; saved: CableAppearances; colors: CableAppearances }>();
export function useCableAppearances(net = sim.net): CableAppearances {
  const saved = useStore(s => s.cableColors), edges = useStore(s => s.edges);
  return useMemo(() => {
    const previous = cache.get(edges);
    if (previous?.net === net && previous.saved === saved) return previous.colors;
    const colors = resolvedCableAppearances(net, saved);
    cache.set(edges, { net, saved, colors }); return colors;
  }, [net, saved, edges]);
}
