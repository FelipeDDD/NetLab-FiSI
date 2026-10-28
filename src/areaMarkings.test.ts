import { expect, it } from 'vitest';
import { unionLoops, unionPath } from './markingGeometry';
import { automaticMarkingBounds, DEFAULT_MARKING, MARKING_COLORS, markingBounds, offsetsFromBounds, pruneAreaMarkings, readAreaMarkings, type AreaMarking } from './areaMarkings';
import { createDevice } from './engine/factory';
import { Network } from './engine/network';
import { disposeNetwork } from './engine/networkLifecycle';
import { captureTopologyDocument, prepareTopologyDocument } from './persistence/topologyDocument';
import { normalizeProjectDocument } from './projects/projectDocument';
import { DEFAULT_TERMINAL_APPEARANCE } from './terminalAppearance';
import { serializeNetwork } from './engine/serialize';

const area: AreaMarking = { ...DEFAULT_MARKING, id: 'area-a', name: 'Büro / 東京', deviceIds: ['a', 'b'] };
it('offers exactly six colors and sanitizes optional metadata without interpreting names as IDs', () => {
  expect(Object.keys(MARKING_COLORS)).toHaveLength(6);
  expect(readAreaMarkings(undefined, ['a'])).toEqual([]);
  const bad = [{ ...area, id: 'bad-color', color: 'red; background:url(x)' }, { ...area, id: 'bad-intensity', intensity: 99 },
    { ...area, id: 'bad-members', deviceIds: ['missing'] }, { ...area, id: 'bad-name', name: 17 }];
  const input = [{ ...area, deviceIds: ['a', 'a', 'b', 'missing'] }, ...bad, area];
  expect(readAreaMarkings(input, ['a', 'b'])).toEqual([area]);
  expect(input[0].deviceIds).toEqual(['a', 'a', 'b', 'missing']);
  expect(pruneAreaMarkings([area], ['a'])).toEqual([{ ...area, deviceIds: ['a'] }]);
  expect(pruneAreaMarkings([area], [])).toEqual([]);
});

it('derives bounds from actual node sizes, moves individual members freely and includes nominal captions', () => {
  const nodes = [
    { id: 'a', position: { x: -80, y: 20 }, measured: { width: 100, height: 150 }, data: { kind: 'server' as const } },
    { id: 'b', position: { x: 260, y: 300 }, measured: { width: 152, height: 90 }, data: { kind: 'switch' as const } },
  ];
  const original = structuredClone(nodes), before = markingBounds(area, nodes)!;
  expect(before.x).toBeLessThan(-80); expect(before.y).toBeLessThan(20);
  expect(before.x + before.width).toBeGreaterThan(412); expect(before.y + before.height).toBeGreaterThan(390);
  expect(nodes).toEqual(original);
  nodes[1].position.x += 200;
  const moved = markingBounds(area, nodes)!;
  expect(moved.width).toBeGreaterThan(before.width); expect(nodes[0]).toEqual(original[0]);
  expect(markingBounds(area, nodes, .5)).toEqual(moved);
  expect(markingBounds({ ...area, deviceIds: [] }, nodes)).toBeNull();
  expect(markingBounds(area, nodes.map(({ measured: _measured, ...n }) => n))).not.toBeNull();
});

it('round-trips optional visual metadata through canonical documents while the network engine stays identical', () => {
  const net = new Network(); createDevice(net, 'host', { id: 'a', name: 'Other label' }); createDevice(net, 'router', { id: 'b', name: 'Büro' });
  try {
    const before = serializeNetwork(net, {});
    const adjusted = { ...area, baseOffsets: { left: 15, top: -8, right: 30, bottom: 20 } };
    const captured = captureTopologyDocument(net, { nodes: [], areaMarkings: [adjusted], terminalAppearance: { ...DEFAULT_TERMINAL_APPEARANCE }, terminalColors: {}, cableColors: {}, terminalLayoutMode: 'free', lab: null, labStep: 0, labResults: {}, quizAnswers: {} });
    const canonical = normalizeProjectDocument({ schemaVersion: 1, topology: captured });
    expect(canonical.topology.ui?.areaMarkings).toEqual([adjusted]);
    expect(serializeNetwork(net, {})).toEqual(before);
    const restored = prepareTopologyDocument(canonical.topology);
    try { expect(restored.presentation.areaMarkings).toEqual([adjusted]); expect(serializeNetwork(restored.network, {})).toEqual(before); }
    finally { disposeNetwork(restored.network); }
    expect(normalizeProjectDocument({ schemaVersion: 1, topology: before }).topology.ui?.areaMarkings).toBeUndefined();
    area.deviceIds.push('missing');
    expect(captured.ui?.areaMarkings?.[0].deviceIds).toEqual(['a', 'b']); area.deviceIds.pop();
  } finally { disposeNetwork(net); }
});

it.each(['L', 'U', 'T'])('keeps %s bounds and union joins identical in world coordinates across zoom changes', shape => {
  const nodes = [
    { id: 'a', position: { x: 70, y: 80 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
    { id: 'b', position: { x: 285, y: 80 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
    { id: 'c', position: { x: 70, y: 250 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
    { id: 'd', position: { x: 285, y: 250 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
  ];
  const marking = { ...area, deviceIds: nodes.map(n => n.id) }, base = markingBounds(marking, nodes)!;
  const leg = { id: 'left', x: base.x, y: base.y + base.height - 12, width: 120, height: 155 };
  const extensions = shape === 'L' ? [leg] : shape === 'U'
    ? [leg, { ...leg, id: 'right', x: base.x + base.width - leg.width }]
    : [{ ...leg, id: 'center', x: base.x + (base.width - leg.width) / 2 }];
  const composed = { ...marking, extensions }, before = JSON.stringify({ composed, nodes });
  const expected = unionPath([base, ...extensions]);
  for (const zoom of [.5, .75, 1, 1.5, 2, .5, 2, 1]) {
    const actual = markingBounds(composed, nodes, zoom)!;
    expect(actual).toEqual(base);
    expect(unionPath([actual, ...extensions])).toBe(expected);
    expect(unionLoops([actual, ...extensions])).toHaveLength(1);
    expect(JSON.stringify({ composed, nodes })).toBe(before);
  }
  // Movement still updates the automatic region, without translating saved extensions.
  nodes[3].position.x += 80;
  const moved = markingBounds(composed, nodes, .5)!;
  expect(moved.width).toBeGreaterThan(base.width);
  expect(markingBounds(composed, nodes, 2)).toEqual(moved);
  expect(composed.extensions).toEqual(extensions);
  nodes[3].measured.height += 40;
  expect(markingBounds(composed, nodes)!.height).toBeGreaterThan(moved.height);
});

it('preserves optional edge offsets, omits zeros, rejects invalid offsets without losing old areas', () => {
  const offsets = { left: 12.5, top: -10, right: 45, bottom: -20 };
  const input = { ...area, baseOffsets: offsets };
  expect(readAreaMarkings([input], area.deviceIds)).toEqual([input]);
  const loaded = readAreaMarkings([input], area.deviceIds)[0]; offsets.left = 999;
  expect(loaded.baseOffsets!.left).toBe(12.5);
  for (const baseOffsets of [null, [], {}, { left: NaN, top: 0, right: 0, bottom: 0 }, { left: 0, top: Infinity, right: 0, bottom: 0 }, { left: '1', top: 0, right: 0, bottom: 0 }, { left: 0, top: 0, right: 0, bottom: 0 }]) {
    expect(readAreaMarkings([{ ...area, baseOffsets }], area.deviceIds)).toEqual([area]);
  }
});

it('applies edge adjustments over moving automatic bounds, clamps crossed edges without rewriting saved values', () => {
  const nodes = [
    { id: 'a', position: { x: 50, y: 90 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
    { id: 'b', position: { x: 350, y: 90 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } },
  ];
  const automatic = automaticMarkingBounds(area, nodes)!;
  const adjusted = { x: automatic.x - 25, y: automatic.y + 10, width: automatic.width + 65, height: automatic.height - 30 };
  const offsets = offsetsFromBounds(automatic, adjusted);
  expect(offsets).toEqual({ left: 25, top: -10, right: 40, bottom: -20 });
  const extension = { id: 'e', x: adjusted.x, y: adjusted.y + adjusted.height - 10, width: 60, height: 80 };
  const marking = { ...area, baseOffsets: offsets, extensions: [extension] }, stored = JSON.stringify(marking);
  for (const zoom of [.5, 1, 2]) {
    expect(markingBounds(marking, nodes, zoom)).toEqual(adjusted);
    expect(unionLoops([markingBounds(marking, nodes, zoom)!, extension])).toHaveLength(1);
  }
  nodes[1].position.x += 120;
  expect(markingBounds(marking, nodes)!.width).toBe(adjusted.width + 120);
  expect(marking.extensions).toEqual([extension]); expect(JSON.stringify(marking)).toBe(stored);
  const inset = { ...area, baseOffsets: { left: 0, top: 0, right: -10000, bottom: -10000 } };
  expect(markingBounds(inset, nodes)).toMatchObject({ width: 12, height: 12 });
  expect(inset.baseOffsets.right).toBe(-10000);
});

it('keeps empty free areas while sanitizing geometry and preserving the legacy member-derived format', () => {
  const free: AreaMarking = { ...area, id: 'free', deviceIds: [], geometry: 'free', bounds: { x: -50, y: 10.5, width: 200, height: 100 } };
  const old = structuredClone(area), stored = readAreaMarkings([old, free], area.deviceIds);
  expect(stored).toEqual([old, free]);
  expect(pruneAreaMarkings(stored, [])).toEqual([free]);
  expect(readAreaMarkings([{ ...free, bounds: { ...free.bounds, width: -1 } }, { ...free, geometry: 'unknown' }, { ...free, bounds: null }], [])).toEqual([]);
  free.bounds!.x = 999; expect(stored[1].bounds!.x).toBe(-50);
  expect(markingBounds(stored[1], [])).toEqual({ x: -50, y: 10.5, width: 200, height: 100 });
  const nodes = [{ id: 'a', position: { x: 900, y: 900 }, data: { kind: 'host' as const } }];
  for (const zoom of [.5, 1, 2]) expect(markingBounds({ ...stored[1], deviceIds: ['a'] }, nodes, zoom)).toEqual(stored[1].bounds);
  expect(old.geometry).toBeUndefined(); expect(old.bounds).toBeUndefined();
});

it('round-trips an empty free area and L/U/T parts through the canonical document without requiring engine members', () => {
  const net = new Network(), bounds = { x: 0, y: 0, width: 200, height: 100 };
  const free: AreaMarking = { ...area, deviceIds: [], geometry: 'free', bounds,
    extensions: [{ id: 'leg', x: 0, y: 90, width: 60, height: 150 }] };
  try {
    const captured = captureTopologyDocument(net, { nodes: [], areaMarkings: [free], terminalAppearance: { ...DEFAULT_TERMINAL_APPEARANCE }, terminalColors: {}, cableColors: {}, terminalLayoutMode: 'free', lab: null, labStep: 0, labResults: {}, quizAnswers: {} });
    const document = normalizeProjectDocument(JSON.parse(JSON.stringify({ schemaVersion: 1, topology: captured })));
    const restored = prepareTopologyDocument(document.topology);
    try { expect(restored.presentation.areaMarkings).toEqual([free]); expect(restored.network.devices.size).toBe(0); }
    finally { disposeNetwork(restored.network); }
  } finally { disposeNetwork(net); }
});
