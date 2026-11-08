import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset, reconcilePrintOptions } from './options';
import { studioLayout, studioDiagram } from './diagram';
import { compactStudioLayout } from './compactLayout';
import { center, overlaps, pathLength } from './geometry';
import { newRoutingBlock } from './routingBlocks';
import { studioReport } from './report';

for (const scene of ['four-routers', 'vertical', 'small-horizontal', 'triangle', 'long-names', 'close']) {
  it(`conservatively compacts ${scene} across physical page formats without altering the source`, () => {
    const snap = geometryFixture(scene);
    // Deliberate excess space, including two remote PCs around one switch.
    for (const device of snap.devices) { device.x *= 2.5; device.y *= 2.5; }
    const source = structuredClone(snap);
    let moves = 0;
    for (const paper of ['A4', 'A3'] as const) for (const orientation of ['portrait', 'landscape'] as const) for (const preset of ['clean', 'technical', 'presentation'] as const) {
      const o = printPreset(preset, snap); Object.assign(o, { paper, orientation });
      const before = studioLayout(snap, o, 'en'), result = compactStudioLayout(snap, o, 'en', before);
      const after = studioLayout(snap, { ...o, compactOffsets: result.positions }, 'en'); moves += result.moved.length;
      expect(compactStudioLayout(snap, o, 'en', before)).toEqual(result);
      expect([after.tx, after.ty, after.scale, after.areas]).toEqual([before.tx, before.ty, before.scale, before.areas]);
      expect(after.cables.map(c => c.link)).toEqual(before.cables.map(c => c.link));
      expect(after.cables.filter(c => c.obstructed).length).toBeLessThanOrEqual(before.cables.filter(c => c.obstructed).length);
      expect(after.documentCables.reduce((n, p) => n + pathLength(p), 0)).toBeLessThanOrEqual(before.documentCables.reduce((n, p) => n + pathLength(p), 0) + .01);
      for (let i = 0; i < after.boxes.length; i++) {
        const rect = after.documentCards[i], old = before.documentCards[i];
        expect(Math.hypot(center(rect).x - center(old).x, center(rect).y - center(old).y)).toBeLessThanOrEqual(32.01);
        expect(rect.x).toBeGreaterThanOrEqual(after.page.area.x - .01); expect(rect.y + rect.height).toBeLessThanOrEqual(after.page.area.y + after.page.area.height + .01);
        for (let j = i + 1; j < after.boxes.length; j++) {
          if (!overlaps(old, before.documentCards[j])) expect(overlaps(rect, after.documentCards[j])).toBe(false);
          for (const axis of ['x', 'y'] as const) {
            const delta = center(old)[axis] - center(before.documentCards[j])[axis];
            if (Math.abs(delta) > 1) expect((center(rect)[axis] - center(after.documentCards[j])[axis]) * Math.sign(delta)).toBeGreaterThan(0);
          }
        }
      }
    }
    if (scene !== 'close' && scene !== 'long-names') expect(moves).toBeGreaterThan(0);
    expect(snap).toEqual(source);
  });
}

it('pins manual cards, keeps tables fixed and restores only compaction while retaining later edits', () => {
  const s = geometryFixture('vertical'); s.devices.forEach(d => d.y *= 4);
  const o = printPreset('clean', s); o.orientation = 'portrait'; o.diagramScale = .7;
  o.devicePositions.B = center(studioLayout(s, o, 'en').documentCards[1]);
  o.routingBlocks.push({ ...newRoutingBlock(s.devices[0], 'table'), position: { x: 380, y: 180 } });
  const before = studioLayout(s, o, 'en'), undo = o.compactOffsets;
  o.compactOffsets = compactStudioLayout(s, o, 'en', before).positions;
  const after = studioLayout(s, o, 'en'); expect(after.documentCards[1]).toEqual(before.documentCards[1]);
  expect(after.blocks.map(b => [b.x, b.y, b.width, b.height])).toEqual(before.blocks.map(b => [b.x, b.y, b.width, b.height]));
  o.devicePositions.A = { x: 200, y: 200 }; o.routingBlocks[0].position.x = 350; o.compactOffsets = undo;
  const restored = studioLayout(s, o, 'en'), chosen = center(restored.documentCards[0]); expect(chosen.x).toBeCloseTo(200, 9); expect(chosen.y).toBeCloseTo(200, 9); expect(o.devicePositions.A).toEqual({ x: 200, y: 200 });
  expect(restored.documentCards[2]).toEqual(before.documentCards[2]); expect(o.routingBlocks[0].position.x).toBe(350);
});

it('does nothing for pinned/already close cards, respects containing areas and reconciles separate positions', () => {
  const s = geometryFixture('vertical'), o = printPreset('clean', s); o.diagram.areas = true;
  s.areas.push({ id: 'a', name: 'Area', color: '#123456', intensity: 20, textSize: 18, title: { x: 0, y: -100 }, rects: [{ x: -200, y: -100, width: 400, height: 900 }] });
  const l = studioLayout(s, o, 'en'); o.devicePositions = Object.fromEntries(l.boxes.map((b, i) => [b.device.id, center(l.documentCards[i])]));
  expect(compactStudioLayout(s, o, 'en', studioLayout(s, o, 'en')).moved).toEqual([]);
  o.compactOffsets = { A: { x: 10, y: 20 }, missing: { x: 1, y: 1 } };
  expect(reconcilePrintOptions(o, s).compactOffsets).toEqual({ A: { x: 10, y: 20 } });
  expect(studioReport(s, o, 'en').html).toContain(studioDiagram(s, o, 'en'));
});

it('compacts two remote PCs towards a switch even when cables are hidden, and leaves tight gaps alone', () => {
  const s = geometryFixture('small-horizontal'), o = printPreset('clean', s);
  s.devices[2].kind = 'host'; s.devices[0].x = -2000; s.devices[1].x = 0; s.devices[2].x = 2000;
  o.diagram.cables = false;
  const before = studioLayout(s, o, 'en'), result = compactStudioLayout(s, o, 'en', before), after = studioLayout(s, { ...o, compactOffsets: result.positions }, 'en');
  expect(result.moved).toHaveLength(2); expect(center(after.documentCards[0]).x).toBeGreaterThan(center(before.documentCards[0]).x);
  expect(center(after.documentCards[2]).x).toBeLessThan(center(before.documentCards[2]).x);
  expect(after.documentCards[1]).toEqual(before.documentCards[1]);
  s.devices.forEach((d, i) => { d.x = i * 25; }); const tight = studioLayout(s, o, 'en');
  expect(compactStudioLayout(s, o, 'en', tight).moved).toEqual([]);
});

it('keeps cards inside their original containing area and creates no label/card overlap', () => {
  const s = geometryFixture('four-routers'), o = printPreset('technical', s); s.devices.forEach(d => { d.x *= 3; d.y *= 3; }); o.diagram.areas = true;
  s.areas.push({ id: 'a', name: 'A', color: '#123456', intensity: 20, textSize: 18, title: { x: -200, y: -100 }, rects: [{ x: -200, y: -100, width: 410, height: 500 }] });
  const before = studioLayout(s, o, 'en'), result = compactStudioLayout(s, o, 'en', before), after = studioLayout(s, { ...o, compactOffsets: result.positions }, 'en');
  const pc = after.boxes.find(b => b.device.id === 'PC-A')!; expect(pc.x).toBeGreaterThanOrEqual(-200); expect(pc.y + pc.height).toBeLessThanOrEqual(400);
  for (let j = 0; j < after.documentLabels.length; j++) for (let k = 0; k < after.documentCards.length; k++) if (!overlaps(before.documentLabels[j], before.documentCards[k], 3)) expect(overlaps(after.documentLabels[j], after.documentCards[k], 3)).toBe(false);
});

it('scales compact offsets with the automatic geometry on paper/scale changes while manual centres stay fixed', () => {
  const s = geometryFixture('four-routers'), o = printPreset('clean', s); s.devices.forEach(d => { d.x *= 3; d.y *= 3; });
  o.orientation = 'portrait'; const before = studioLayout(s, o, 'en'); o.compactOffsets = compactStudioLayout(s, o, 'en', before).positions;
  const offsets = structuredClone(o.compactOffsets); expect(Object.keys(offsets).length).toBeGreaterThan(0);
  for (const paper of ['A4', 'A3'] as const) for (const orientation of ['portrait', 'landscape'] as const) for (const diagramScale of [.5, 1]) {
    Object.assign(o, { paper, orientation, diagramScale }); const actual = studioLayout(s, o, 'en');
    actual.boxes.forEach((box, i) => {
      expect(box.x - actual.automatic.boxes[i].x).toBeCloseTo(offsets[box.device.id]?.x ?? 0, 6);
      expect(box.y - actual.automatic.boxes[i].y).toBeCloseTo(offsets[box.device.id]?.y ?? 0, 6);
    });
    const d = actual.boxes.find(b => b.device.id === 'D')!;
    for (const id of ['A', 'B', 'C']) expect(center(d).y).toBeGreaterThan(center(actual.boxes.find(b => b.device.id === id)!).y);
    expect(o.compactOffsets).toEqual(offsets);
  }
  o.devicePositions.D = { x: 300, y: 300 }; const pinned = studioLayout(s, o, 'en');
  const pinnedCenter = center(pinned.documentCards[pinned.boxes.findIndex(b => b.device.id === 'D')]);
  expect(pinnedCenter.x).toBeCloseTo(300, 10); expect(pinnedCenter.y).toBeCloseTo(300, 10);
});
