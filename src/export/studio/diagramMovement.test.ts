import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { positionStudioDevices, studioLayout } from './diagram';
import { moveStudioDiagram } from './diagramMovement';
import { center, type Point } from './geometry';
import { newRoutingBlock } from './routingBlocks';
import { activePageOptions, createPageSession, updatePageSession } from './pageLayouts';
import { saveStudioPresentation, readStudioPresentation } from '../../studioPresentation';
import { restoreStudioPresentation } from './persistence';

it('moves different manually placed cards by one vector, leaving tables and hidden canvas markings intact', () => {
  const snap = geometryFixture(), original = structuredClone(snap); snap.areas.push({ id: 'lan', name: 'LAN', color: '#598fb9', intensity: 18, rects: [{ x: -50, y: -50, width: 800, height: 900 }], title: { x: -30, y: -20 }, textSize: 18 });
  const options = printPreset('presentation', snap); options.diagramScale = .5; options.names.A = 'Router A / Distribution'; options.routingBlocks = [newRoutingBlock(snap.devices[0], 'table')];
  let l = studioLayout(snap, options, 'en'); options.devicePositions.A = { x: center(l.documentCards[0]).x + 12, y: center(l.documentCards[0]).y - 5 }; l = studioLayout(snap, options, 'en');
  const result = moveStudioDiagram(l, options, { x: -20, y: 30 }), after = positionStudioDevices(l.automatic, snap, { ...options, devicePositions: result.positions, areaOffset: result.areaOffset }, 'en');
  expect(result.delta).toEqual({ x: -20, y: 30 });
  after.documentCards.forEach((r, i) => { expect(r.x - l.documentCards[i].x).toBeCloseTo(-20, 9); expect(r.y - l.documentCards[i].y).toBeCloseTo(30, 9); expect([r.width, r.height]).toEqual([l.documentCards[i].width, l.documentCards[i].height]); });
  expect(after.blocks.map(b => [b.x,b.y,b.width,b.height])).toEqual(l.blocks.map(b => [b.x,b.y,b.width,b.height]));
  expect(after.areas).toEqual([]); expect(after.documentCables).not.toEqual(l.documentCables);
  expect(after.cables.map(c => c.link)).toEqual(l.cables.map(c => c.link)); expect(snap.devices).toEqual(original.devices); expect(snap.areas[0].rects[0].x).toBe(-50);
});
it('constrains the vector as a group rather than clamping individual cards or moving blocks', () => {
  const snap = geometryFixture(), options = printPreset('clean', snap); options.diagramScale = .6; const l = studioLayout(snap, options, 'en');
  for (const desired of [{ x: 1e5, y: 1e5 }, { x: -1e5, y: -1e5 }]) {
    const result = moveStudioDiagram(l, options, desired), after = positionStudioDevices(l.automatic, snap, { ...options, devicePositions: result.positions }, 'en');
    after.documentCards.forEach((r, i) => { expect(r.x).toBeGreaterThanOrEqual(l.page.area.x - .001); expect(r.y).toBeGreaterThanOrEqual(l.page.area.y - .001); expect(r.x + r.width).toBeLessThanOrEqual(l.page.area.x + l.page.area.width + .001); expect(r.y + r.height).toBeLessThanOrEqual(l.page.area.y + l.page.area.height + .001); expect(r.x - l.documentCards[i].x).toBeCloseTo(result.delta.x, 8); expect(r.y - l.documentCards[i].y).toBeCloseTo(result.delta.y, 8); });
  }
});
it('persists centres and area offset only in the active page and defaults/repairs old metadata safely', () => {
  const snap = geometryFixture(), options = printPreset('presentation', snap); options.diagramScale = .5;
  snap.areas.push({ id: 'a', name: 'Area', color: '#256080', intensity: 10, rects: [{ x: 0, y: 0, width: 600, height: 800 }], title: { x: 4, y: 20 }, textSize: 18 });
  let session = createPageSession(options);
  for (const paper of ['A4','A3'] as const) for (const orientation of ['portrait','landscape'] as const) {
    session = updatePageSession(session, o => ({ ...o, paper, orientation }), snap, 'en'); const otherPages = structuredClone(session.layouts), o = activePageOptions(session), l = studioLayout(snap, o, 'en'), m = moveStudioDiagram(l, o, { x: -8, y: 10 });
    session = updatePageSession(session, o => ({ ...o, devicePositions: m.positions, areaOffset: m.areaOffset }), snap, 'en');
    for (const [key, page] of Object.entries(otherPages)) if (key !== `${paper}-${orientation}`) expect(session.layouts[key as keyof typeof session.layouts]).toEqual(page);
    const data = saveStudioPresentation(session, true), restored = restoreStudioPresentation(data, snap, 'en'); expect(activePageOptions(restored.session)).toEqual(activePageOptions(session));
    expect(JSON.stringify(data)).not.toMatch(/moveUndo|snapshot|dragging/);
  }
  const data = saveStudioPresentation(session, true); data.layouts['A3-landscape']!.areaOffset = { x: NaN, y: 0 } as Point;
  const repaired = readStudioPresentation(data, snap.devices); expect(repaired.warning).toBe(true); expect(repaired.data!.layouts['A3-landscape']!.areaOffset).toBeUndefined(); expect(repaired.data!.layouts['A4-portrait']!.devicePositions).toEqual(data.layouts['A4-portrait']!.devicePositions);
  const o=activePageOptions(session);expect(studioLayout(snap,{...o,areaOffset:{x:1e6,y:1e6}},'en').areaOutside).toBe(false);
  expect(snap.areas).toHaveLength(1);
});
