import { expect, it } from 'vitest';
import { readStudioPresentation, saveStudioPresentation } from './studioPresentation';
import { restoreStudioPresentation } from './export/studio/persistence';
import { geometryFixture } from './export/studio/geometry.fixture';
import { blocksFixture } from './export/studio/blocks.fixture';
import { printPreset } from './export/studio/options';
import { activePageOptions, activePresentation, createPageSession, updateActivePresentation, updatePageSession } from './export/studio/pageLayouts';
import { newRoutingBlock } from './export/studio/routingBlocks';
import { studioLayout } from './export/studio/diagram';
import { normalizeProjectDocument } from './projects/projectDocument';

function presentation() {
  const snapshot = geometryFixture(); let session = createPageSession(printPreset('technical', snapshot));
  session = updatePageSession(session, o => ({ ...o, routingBlocks: [newRoutingBlock(snapshot.devices.find(d => d.id === 'A')!, 'a'), newRoutingBlock(snapshot.devices.find(d => d.id === 'D')!, 'd')], title: 'Saved presentation', names: { A: 'Core A' }, diagramScale: .6, annotation: 'A note' }), snapshot, 'en');
  for (const [i, [paper, orientation]] of ([['A4', 'landscape'], ['A4', 'portrait'], ['A3', 'landscape'], ['A3', 'portrait']] as const).entries()) {
    session = updatePageSession(session, o => ({ ...o, paper, orientation }), snapshot, 'en');
    session = updatePageSession(session, o => ({ ...o, devicePositions: { A: { x: 210 + i * 20, y: 200 + i * 20 } }, compactOffsets: { D: { x: 0, y: -20 - i } }, routingBlocks: o.routingBlocks.map((b, j) => ({ ...b, width: 'normal', customWidth: 320 + i * 15, scale: 1 - i * .05, position: { x: 10 + j * 350, y: 100 + i * 10 } })) }), snapshot, 'en');
    session = updateActivePresentation(session, p => ({ ...p, compactUndo: { D: { x: 0, y: 0 } }, compactNotice: true }));
  }
  return { snapshot, session, data: saveStudioPresentation(session, false) };
}

it('round trips all four layouts, shared options and filters without persisting snapshots or temporary interaction', () => {
  const { snapshot, session, data } = presentation(), raw = JSON.stringify(data);
  expect(raw).not.toMatch(/compactUndo|compactNotice|capturedAt|192\.168\.|selectedDevice|viewport|dragging/);
  const restored = restoreStudioPresentation(JSON.parse(raw), snapshot, 'en'); expect(restored.warning).toBe(false); expect(restored.alignmentGuides).toBe(false);
  expect(JSON.parse(JSON.stringify(saveStudioPresentation(restored.session, false)))).toEqual(JSON.parse(raw));
  expect(restored.session.shared).toEqual(session.shared);
  for (const layout of Object.values(restored.session.layouts)) { expect(layout.compactUndo).toBeNull(); expect(layout.compactNotice).toBe(false); }
  expect(studioLayout(snapshot, activePageOptions(restored.session), 'en').documentCards).toEqual(studioLayout(snapshot, activePageOptions(session), 'en').documentCards);
  data.shared.names.A = 'Changed externally'; expect(restored.session.shared.names.A).toBe('Core A');
});

it('repairs invalid dimensions/points individually while retaining the other devices and formats', () => {
  const { snapshot, data } = presentation(), damaged = JSON.parse(JSON.stringify(data));
  damaged.layouts['A4-portrait'].devicePositions = { A: { x: 210, y: 230 }, B: { x: Infinity, y: 2 }, missing: { x: 1, y: 2 } };
  damaged.layouts['A4-portrait'].blocks.a.customWidth = -1; damaged.layouts['A4-portrait'].blocks.a.scale = 999;
  damaged.layouts['A4-portrait'].blocks.d.position.x = NaN;
  const result = readStudioPresentation(damaged, snapshot.devices); expect(result.warning).toBe(true);
  expect(result.data!.layouts['A4-portrait']!.devicePositions).toEqual({ A: { x: 210, y: 230 } });
  expect(result.data!.layouts['A4-portrait']!.blocks.a.customWidth).toBeUndefined(); expect(result.data!.layouts['A4-portrait']!.blocks.a.scale).toBeUndefined(); expect(result.data!.layouts['A4-portrait']!.blocks.d).toBeUndefined();
  expect(result.data!.layouts['A3-landscape']).toEqual(data.layouts['A3-landscape']);
  expect(() => restoreStudioPresentation(damaged, snapshot, 'en')).not.toThrow();
});

it('uses defaults for incomplete/old data and preserves intentional empty selections', () => {
  const snapshot = geometryFixture();
  expect(readStudioPresentation(undefined, snapshot.devices)).toEqual({ data: null, warning: false });
  const restored = restoreStudioPresentation({ version: 1, shared: { paper: 'A4', orientation: 'portrait', diagram: { deviceIds: [] }, title: 'Old partial' } }, snapshot, 'en');
  expect(restored.session.shared.title).toBe('Old partial'); expect(restored.session.shared.diagram.deviceIds).toEqual([]); expect(activePresentation(restored.session).devicePositions).toEqual({});
  expect(restored.alignmentGuides).toBe(true);
});

it('keeps deleted block devices marked missing and never transfers old positions to another ID', () => {
  const { snapshot, data } = presentation(), next = { ...snapshot, devices: snapshot.devices.filter(d => d.id !== 'D') };
  const restored = restoreStudioPresentation(data, next, 'en');
  for (const page of Object.values(restored.session.layouts)) { expect(page.compactOffsets.D).toBeUndefined(); expect(page.devicePositions.A).toBeDefined(); }
  const layout = studioLayout(next, activePageOptions(restored.session), 'en'); expect(layout.blocks.find(b => b.content.block.id === 'd')!.content.missing).toBe(true); expect(layout.blocks.find(b => b.content.block.id === 'a')!.content.missing).toBe(false);
});

it('transports optional Studio JSON through canonical projects without changing the network or sharing references', () => {
  const { data } = presentation(), original = blocksFixture('four'), network = normalizeProjectDocument(original).topology;
  original.topology.ui = { ...original.topology.ui, topologyStudio: data };
  const normalized = normalizeProjectDocument(original), again = normalizeProjectDocument(JSON.parse(JSON.stringify(normalized)));
  expect(again).toEqual(normalized); expect(normalized.topology.ui!.topologyStudio).toEqual(data);
  const { ui, ...topology } = normalized.topology, { ui: _oldUi, ...expected } = network;
  expect(topology).toEqual(expected);
  data.shared.title = 'External edit'; expect((normalized.topology.ui!.topologyStudio as typeof data).shared.title).toBe('Saved presentation');
});

it('retains opaque future metadata through JSON while warning instead of silently overwriting it', () => {
  const original = blocksFixture('four'), future = { version: 99, payload: { custom: ['keep me'] } };
  original.topology.ui = { ...original.topology.ui, topologyStudio: future };
  const normalized = normalizeProjectDocument(original); expect(normalized.topology.ui!.topologyStudio).toEqual(future);
  const restored = restoreStudioPresentation(normalized.topology.ui!.topologyStudio, geometryFixture(), 'en'); expect(restored.warning).toBe(true); expect(restored.session.shared.preset).toBe('clean');
  expect(normalized.topology.ui!.topologyStudio).toEqual(future);
});

it('does not add Studio metadata to old files or store unsafe/unknown presentation fields', () => {
  const old = normalizeProjectDocument(blocksFixture('four')); expect(old.topology.ui?.topologyStudio).toBeUndefined();
  const { snapshot, data } = presentation(), extra = { ...data, snapshot: { doNotSave: true }, viewport: { zoom: 1.25 }, shared: { ...data.shared, unexpected: '<script>' } };
  const restored = restoreStudioPresentation(extra, snapshot, 'en'), saved = JSON.stringify(saveStudioPresentation(restored.session, true));
  expect(saved).not.toMatch(/doNotSave|viewport|unexpected|<script>/);
});
