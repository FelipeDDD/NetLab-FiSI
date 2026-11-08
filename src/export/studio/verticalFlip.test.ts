import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { center } from './geometry';
import { flippedDevicePositions } from './verticalFlip';
import { activePageOptions, createPageSession, updatePageSession } from './pageLayouts';
import { newRoutingBlock } from './routingBlocks';
import { saveStudioPresentation } from '../../studioPresentation';
import { restoreStudioPresentation } from './persistence';

it('reflects real card edges within the original extent, preserving x, sizes and hidden positions', () => {
  const cards = [{ id: 'top', x: 120, y: 80, width: 100, height: 70 }, { id: 'bottom', x: 300, y: 400, width: 170, height: 130 }];
  const positions = { hidden: { x: 1, y: 2 } }, before = structuredClone(cards), sum = 610;
  const first = flippedDevicePositions(cards, positions);
  for (const r of cards) { expect(first[r.id].x).toBe(center(r).x); expect(first[r.id].y).toBe(sum - center(r).y); }
  const next = cards.map(r => ({ ...r, y: first[r.id].y - r.height / 2 }));
  expect(Math.min(...next.map(r => r.y))).toBe(80); expect(Math.max(...next.map(r => r.y + r.height))).toBe(530);
  expect(flippedDevicePositions(next, first)).toEqual({ ...positions, ...Object.fromEntries(cards.map(r => [r.id, center(r)])) }); expect(cards).toEqual(before);
});
it('keeps tables, areas, source network and cable identity; reflected output survives all four persisted formats', () => {
  const snap = geometryFixture(), original = structuredClone(snap);
  let session = createPageSession(printPreset('technical', snap));
  for (const paper of ['A4', 'A3'] as const) for (const orientation of ['portrait', 'landscape'] as const) {
    session = updatePageSession(session, o => ({ ...o, paper, orientation, diagramScale: .6 }), snap, 'en');
    let options = activePageOptions(session); const block = newRoutingBlock(snap.devices[0], 'table'); block.position = { x: 12, y: 90 };
    session = updatePageSession(session, o => ({ ...o, routingBlocks: [block] }), snap, 'en'); options = activePageOptions(session);
    const before = studioLayout(snap, options, 'en'), variants = structuredClone(session.layouts);
    const positions = flippedDevicePositions(before.documentCards.map((r, i) => ({ ...r, id: before.boxes[i].device.id })), options.devicePositions);
    session = updatePageSession(session, o => ({ ...o, devicePositions: positions }), snap, 'en');
    for (const [key, page] of Object.entries(variants)) if (key !== `${paper}-${orientation}`) expect(session.layouts[key as keyof typeof session.layouts]).toEqual(page);
    const after = studioLayout(snap, activePageOptions(session), 'en');
    expect(after.blocks).toEqual(before.blocks); expect(after.areas).toEqual(before.areas);
    expect(after.cables.map(c => [c.link.id, c.link.a, c.link.b])).toEqual(before.cables.map(c => [c.link.id, c.link.a, c.link.b]));
    expect(after.documentCables).not.toEqual(before.documentCables);
    after.documentCards.forEach((r, i) => { expect(r.x).toBeCloseTo(before.documentCards[i].x, 10); expect(r.y).toBeGreaterThanOrEqual(after.page.area.y - .001); expect(r.y + r.height).toBeLessThanOrEqual(after.page.area.y + after.page.area.height + .001); });
    const restored = restoreStudioPresentation(saveStudioPresentation(session, true), snap, 'en');
    expect(studioLayout(snap, activePageOptions(restored.session), 'en').documentCards).toEqual(after.documentCards);
    expect(studioDiagram(snap, activePageOptions(restored.session), 'en')).not.toContain('data-distance-guide');
  }
  expect(snap).toEqual(original);
});
