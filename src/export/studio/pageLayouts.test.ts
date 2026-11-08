import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { activePageOptions, activePresentation, createPageSession, pageLayoutKey, reconcilePageSession, updateActivePresentation, updatePageSession, type StudioPageSession } from './pageLayouts';
import { compactStudioLayout } from './compactLayout';
import { center } from './geometry';
import { newRoutingBlock } from './routingBlocks';
import { studioReport } from './report';

const snap = () => { const s = geometryFixture('four-routers'); s.devices.forEach(d => { d.x *= 3; d.y *= 3; }); return s; };
const formats = [{ paper: 'A4', orientation: 'landscape' }, { paper: 'A4', orientation: 'portrait' }, { paper: 'A3', orientation: 'landscape' }, { paper: 'A3', orientation: 'portrait' }] as const;

it('first visits use original automatic geometry with no manual/compact coordinates or undo from another format', () => {
  const s = snap(), options = printPreset('clean', s); let session = createPageSession(options);
  session = updatePageSession(session, o => ({ ...o, devicePositions: { A: { x: 400, y: 250 } }, compactOffsets: { D: { x: 0, y: -60 } } }), s, 'en');
  session = updateActivePresentation(session, p => ({ ...p, compactUndo: {}, compactNotice: true }));
  const source = structuredClone(session);
  for (const format of formats.slice(1)) {
    const next = updatePageSession(session, o => ({ ...o, ...format }), s, 'en'), active = activePageOptions(next);
    expect(active.devicePositions).toEqual({}); expect(active.compactOffsets).toEqual({}); expect(activePresentation(next).compactUndo).toBeNull(); expect(activePresentation(next).compactNotice).toBe(false);
    expect(studioLayout(s, active, 'en').documentCards).toEqual(studioLayout(s, { ...options, ...format }, 'en').documentCards);
    expect(next.layouts['A4-landscape']).toEqual(source.layouts['A4-landscape']);
  }
  expect(session).toEqual(source);
});

it('restores exact independent card/table geometry in all four formats using one shared definition per table', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  session = updatePageSession(session, o => ({ ...o, routingBlocks: [newRoutingBlock(s.devices[0], 'a'), newRoutingBlock(s.devices.find(d => d.id === 'D')!, 'd')] }), s, 'en');
  const states = new Map<string, string>(), geometries = new Map<string, ReturnType<typeof studioLayout>>();
  for (const [i, format] of formats.entries()) {
    session = updatePageSession(session, o => ({ ...o, ...format }), s, 'en');
    session = updatePageSession(session, o => ({ ...o, devicePositions: { B: { x: 290 + i * 20, y: 240 + i * 25 } }, routingBlocks: o.routingBlocks.map((b, j) => ({ ...b, position: { x: 12 + j * 320, y: 110 + i * 20 }, width: 'normal', customWidth: 310 + i * 12, scale: .95 + i * .05 })) }), s, 'en');
    states.set(pageLayoutKey(format), JSON.stringify(activePresentation(session))); geometries.set(pageLayoutKey(format), studioLayout(s, activePageOptions(session), 'en'));
  }
  expect(session.shared.routingBlocks).toHaveLength(2);
  for (const block of session.shared.routingBlocks) for (const key of ['position', 'width', 'customWidth', 'scale']) expect(Object.hasOwn(block, key)).toBe(false);
  for (const format of [...formats].reverse()) {
    session = updatePageSession(session, o => ({ ...o, ...format }), s, 'en');
    expect(JSON.stringify(activePresentation(session))).toBe(states.get(pageLayoutKey(format)));
    expect(studioLayout(s, activePageOptions(session), 'en')).toEqual(geometries.get(pageLayoutKey(format)));
  }
});

it('shares device, route/interface/column filters and block identity while keeping dimensions independent', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  session = updatePageSession(session, o => ({ ...o, routingBlocks: [{ ...newRoutingBlock(s.devices[0], 'a'), customWidth: 510, scale: 1.3, position: { x: 200, y: 150 } }] }), s, 'en');
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en');
  expect(activePageOptions(session).routingBlocks[0]).toMatchObject({ id: 'a', width: 'compact', customWidth: undefined, scale: undefined });
  session = updatePageSession(session, o => ({ ...o, routingBlocks: o.routingBlocks.map(b => ({ ...b, deviceId: 'D', deviceName: 'D', filter: 'static', interfaceNames: ['eth0'], columns: { nextHop: true, iface: false, origin: true }, scale: .85, customWidth: 300 })) }), s, 'en');
  session = updatePageSession(session, o => ({ ...o, orientation: 'landscape' }), s, 'en');
  expect(activePageOptions(session).routingBlocks[0]).toMatchObject({ id: 'a', deviceId: 'D', filter: 'static', interfaceNames: ['eth0'], columns: { nextHop: true, iface: false, origin: true }, customWidth: 510, scale: 1.3, position: { x: 200, y: 150 } });
});

it('adds tables once, safely places them on visited/unvisited pages and removes stale geometry everywhere', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait', diagramScale: .4 }), s, 'en');
  session = updatePageSession(session, o => ({ ...o, orientation: 'landscape', routingBlocks: [{ ...newRoutingBlock(s.devices[0], 'a'), position: { x: 8, y: 105 } }] }), s, 'en');
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en');
  const before = structuredClone(activePresentation(session)); const layout = studioLayout(s, activePageOptions(session), 'en');
  expect(layout.blocks[0].overlap).toBe(false); expect(layout.blocks[0].oversized).toBe(false);
  session = updatePageSession(session, o => ({ ...o, routingBlocks: [...o.routingBlocks, newRoutingBlock(s.devices.find(d => d.id === 'D')!, 'd')] }), s, 'en');
  expect(activePresentation(session).blocks.a).toEqual(before.blocks.a);
  session = updatePageSession(session, o => ({ ...o, orientation: 'landscape' }), s, 'en');
  expect(activePageOptions(session).routingBlocks.map(b => b.id)).toEqual(['a', 'd']);
  expect(studioLayout(s, activePageOptions(session), 'en').blocks.find(b => b.content.block.id === 'd')!.overlap).toBe(false);
  session = updatePageSession(session, o => ({ ...o, routingBlocks: o.routingBlocks.filter(b => b.id !== 'a') }), s, 'en');
  for (const page of Object.values(session.layouts)) expect(Object.hasOwn(page.blocks, 'a')).toBe(false);
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en'); expect(activePageOptions(session).routingBlocks.map(b => b.id)).toEqual(['d']);
});

it('keeps compact/undo and restore operations exclusive to the active page', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  const compact = (value: StudioPageSession) => {
    const o = activePageOptions(value), result = compactStudioLayout(s, o, 'en', studioLayout(s, o, 'en'));
    const saved = updateActivePresentation(value, p => ({ ...p, compactUndo: p.compactOffsets }));
    return updatePageSession(saved, options => ({ ...options, compactOffsets: result.positions }), s, 'en');
  };
  session = compact(session); const landscape = structuredClone(activePresentation(session));
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en'); expect(activePresentation(session).compactUndo).toBeNull();
  session = compact(session); session = updatePageSession(session, o => ({ ...o, compactOffsets: activePresentation(session).compactUndo!, devicePositions: {} }), s, 'en');
  session = updateActivePresentation(session, p => ({ ...p, compactUndo: null })); expect(activePageOptions(session).compactOffsets).toEqual({});
  session = updatePageSession(session, o => ({ ...o, orientation: 'landscape' }), s, 'en'); expect(activePresentation(session)).toEqual(landscape);
});

it('reconciles IDs in every variant and its undo without assigning removed positions to another device', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  for (const format of formats) {
    session = updatePageSession(session, o => ({ ...o, ...format }), s, 'en');
    session = updatePageSession(session, o => ({ ...o, devicePositions: { A: { x: 200, y: 200 }, D: { x: 300, y: 300 } }, compactOffsets: { A: { x: 0, y: 5 }, D: { x: 0, y: -5 } } }), s, 'en');
    session = updateActivePresentation(session, p => ({ ...p, compactUndo: p.compactOffsets }));
  }
  const next = { ...s, devices: s.devices.filter(d => d.id !== 'D') };
  const refreshed = reconcilePageSession(session, next, 'en');
  for (const page of Object.values(refreshed.layouts)) {
    expect(page.devicePositions).toEqual({ A: { x: 200, y: 200 } }); expect(page.compactOffsets).toEqual({ A: { x: 0, y: 5 } }); expect(page.compactUndo).toEqual({ A: { x: 0, y: 5 } });
  }
  expect(session.layouts['A4-landscape']!.devicePositions.D).toBeDefined();
});

it('retains requested geometry on margins/content/scale changes, warns for deliberate collisions, and exports the active variant', () => {
  const s = snap(); let session = createPageSession(printPreset('clean', s));
  session = updatePageSession(session, o => ({ ...o, devicePositions: { A: { x: 300, y: 240 }, B: { x: 300, y: 240 } }, routingBlocks: [{ ...newRoutingBlock(s.devices[0], 'a'), position: { x: 600, y: 400 }, customWidth: 420, scale: 1.2 }] }), s, 'en');
  const saved = structuredClone(activePresentation(session));
  session = updatePageSession(session, o => ({ ...o, margin: 20, textSize: 'large', diagramScale: .6, title: 'Shared title', diagram: { ...o.diagram, ipv4: true } }), s, 'en');
  expect(activePresentation(session)).toEqual(saved); const o = activePageOptions(session), l = studioLayout(s, o, 'en');
  expect(l.manualOverlap).toBe(true); expect(studioReport(s, o, 'en').html).toContain(studioDiagram(s, o, 'en'));
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en'); expect(activePageOptions(session).title).toBe('Shared title'); expect(activePageOptions(session).diagram.ipv4).toBe(true);
  session = updatePageSession(session, o => ({ ...o, orientation: 'landscape', margin: 15, textSize: 'normal', diagramScale: 1, diagram: { ...o.diagram, ipv4: false } }), s, 'en');
  expect(activePresentation(session)).toEqual(saved); const restoredCenter = center(studioLayout(s, activePageOptions(session), 'en').documentCards[0]); expect(restoredCenter.x).toBeCloseTo(300, 9); expect(restoredCenter.y).toBeCloseTo(240, 9);
});

it('keeps all routes and the existing oversize warning when a table cannot fit on a first visit', () => {
  const s = snap(), device = s.devices.find(d => d.id === 'D')!;
  device.routes = Array.from({ length: 90 }, (_, i) => ({ destination: `172.${i}.0.0`, prefix: 16, via: '10.0.1.1', iface: 'eth0', origin: 'static' as const }));
  let session = createPageSession(printPreset('clean', s));
  session = updatePageSession(session, o => ({ ...o, routingBlocks: [newRoutingBlock(device, 'd')] }), s, 'en');
  session = updatePageSession(session, o => ({ ...o, orientation: 'portrait' }), s, 'en');
  const block = studioLayout(s, activePageOptions(session), 'en').blocks[0];
  expect(block.oversized).toBe(true); expect(block.content.rows).toHaveLength(90); expect(block.content.rows.at(-1)!.cells.flat().join('')).toContain('172.89.0.0/16');
  session = updatePageSession(session, o => ({ ...o, routingBlocks: o.routingBlocks.map(b => ({ ...b, filter: 'connected' })) }), s, 'en');
  expect(studioLayout(s, activePageOptions(session), 'en').blocks[0].oversized).toBe(false);
});
