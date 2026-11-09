import { expect, it } from 'vitest';
import { readPingAnimationPosition } from './pingAnimationPosition';
import { createEmptyProjectDocument, normalizeProjectDocument } from './projects/projectDocument';
import { prepareTopologyDocument } from './persistence/topologyDocument';
import { disposeNetwork } from './engine/networkLifecycle';

it('defaults legacy/invalid values without accepting malformed positions', () => {
  for (const value of [undefined, null, [], true, { remember: false, position: { x: 10, y: 20 } }]) expect(readPingAnimationPosition(value)).toEqual({ remember: false });
  for (const point of [{ x: -1, y: 3 }, { x: NaN, y: 3 }, { x: '4', y: 5 }, { x: 4, y: Infinity }]) expect(readPingAnimationPosition({ remember: true, position: point })).toEqual({ remember: true });
});
it('round-trips independent positions through canonical v1 documents and owns its data', () => {
  const a = createEmptyProjectDocument(), b = createEmptyProjectDocument();
  const preference = { remember: true, position: { x: 170.5, y: 92 } };
  a.topology.ui!.pingAnimationPosition = preference;
  b.topology.ui!.pingAnimationPosition = { remember: true, position: { x: 20, y: 210 } };
  const normalized = normalizeProjectDocument(JSON.parse(JSON.stringify(a)));
  preference.position.x = 999;
  expect(normalized.topology.ui!.pingAnimationPosition).toEqual({ remember: true, position: { x: 170.5, y: 92 } });
  expect(normalizeProjectDocument(b).topology.ui!.pingAnimationPosition?.position?.x).toBe(20);
  const legacy = prepareTopologyDocument(createEmptyProjectDocument().topology);
  try { expect(legacy.presentation.pingAnimationPosition).toEqual({ remember: false }); }
  finally { disposeNetwork(legacy.network); }
  expect(normalizeProjectDocument(createEmptyProjectDocument()).topology.ui!.pingAnimationPosition).toBeUndefined();
});
