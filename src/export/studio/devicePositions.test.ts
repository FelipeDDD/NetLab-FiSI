import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset, reconcilePrintOptions } from './options';
import { studioAutomaticLayout, studioDiagram, studioLayout, positionStudioDevices } from './diagram';
import { studioReport } from './report';
import { center, overlaps } from './geometry';
import { documentRect, manualDevicePosition, toDocument, toTopology } from './devicePositions';
import { newRoutingBlock } from './routingBlocks';

it('round trips topology/document coordinates independently of preview zoom', () => {
  const transform = { tx: 231, ty: 154, scale: .63 }, p = { x: -180, y: 360 };
  expect(toTopology(toDocument(p, transform), transform).x).toBeCloseTo(p.x, 9);
  expect(toTopology(toDocument(p, transform), transform).y).toBeCloseTo(p.y, 9);
  expect(documentRect({ ...p, width: 200, height: 150 }, transform)).toEqual({ x: 117.6, y: 380.8, width: 126, height: 94.5 });
});

it('applies a manual document center after auto fit, keeping all other cards, tables and areas fixed', () => {
  const snap = geometryFixture(), original = structuredClone(snap), o = printPreset('presentation', snap);
  snap.areas.push({ id: 'lan', name: 'LAN', color: '#598fb9', intensity: 18, rects: [{ x: -60, y: -50, width: 520, height: 700 }], title: { x: -40, y: -20 }, textSize: 18 });
  o.diagramScale = .8;
  o.routingBlocks.push(newRoutingBlock(snap.devices.find(d => d.id === 'A')!, 'table-a'), newRoutingBlock(snap.devices.find(d => d.id === 'D')!, 'table-d'));
  const automatic = studioAutomaticLayout(snap, o, 'en'), before = positionStudioDevices(automatic, snap, o, 'en');
  const index = snap.devices.findIndex(d => d.id === 'B'), target = { x: center(before.documentCards[index]).x + 70, y: center(before.documentCards[index]).y - 24 };
  o.devicePositions.B = target; const after = positionStudioDevices(automatic, snap, o, 'en');
  expect(center(after.documentCards[index]).x).toBeCloseTo(target.x, 9); expect(center(after.documentCards[index]).y).toBeCloseTo(target.y, 9);
  before.documentCards.forEach((rect, i) => { if (i !== index) expect(after.documentCards[i]).toEqual(rect); });
  expect(after.blocks.map(b => [b.x,b.y,b.width,b.height])).toEqual(before.blocks.map(b => [b.x,b.y,b.width,b.height]));
  expect([after.tx,after.ty,after.scale,after.bounds,after.areas]).toEqual([before.tx,before.ty,before.scale,before.bounds,before.areas]);
  expect(after.cables.map(c => [c.link.id,c.link.a,c.link.b])).toEqual(before.cables.map(c => [c.link.id,c.link.a,c.link.b]));
  for (const c of after.cables.filter(c => c.link.a[0] === 'B' || c.link.b[0] === 'B')) expect(c.points).not.toEqual(before.cables.find(b => b.link.id === c.link.id)!.points);
  expect(snap.devices).toEqual(original.devices);
});

it('warns about manual collisions instead of displacing a neighbour', () => {
  const snap = geometryFixture('line'), o = printPreset('clean', snap), before = studioLayout(snap, o, 'en');
  o.devicePositions.B = center(before.documentCards[0]); const after = studioLayout(snap, o, 'en');
  expect(after.manualOverlap).toBe(true); expect(overlaps(after.documentCards[0],after.documentCards[1])).toBe(true);
  expect(after.documentCards[0]).toEqual(before.documentCards[0]); expect(after.documentCards[2]).toEqual(before.documentCards[2]);
});

it('preserves a chosen center as card content changes and clamps predictably for paper/margins/scale', () => {
  const snap = geometryFixture(), o = printPreset('clean', snap); o.devicePositions.B = { x: 350, y: 270 };
  const card = () => { const l = studioLayout(snap,o,'en'); return { l, box:l.documentCards[l.boxes.findIndex(b=>b.device.id==='B')] }; };
  const before = card(); o.diagram.ipv4 = true; o.diagram.interfaces = true; o.diagram.gateways = true;
  const after = card(); expect(center(after.box).x).toBeCloseTo(350); expect(center(after.box).y).toBeCloseTo(270); expect(after.box.height).not.toBe(before.box.height);
  for(const paper of ['A4','A3'] as const)for(const orientation of ['landscape','portrait'] as const)for(const diagramScale of [.5,1]){
    Object.assign(o,{paper,orientation,margin:20,diagramScale});o.devicePositions.B={x:-500,y:5000};const {l,box}=card();
    expect(box.x).toBeGreaterThanOrEqual(l.page.area.x-.001);expect(box.y+box.height).toBeLessThanOrEqual(l.page.area.y+l.page.area.height+.001);
  }
});

it('restores only requested manual positions and reconciles refresh by stable ID', () => {
  const snap=geometryFixture(),o=printPreset('clean',snap),auto=studioLayout(snap,o,'en');o.devicePositions={B:{x:350,y:240},D:{x:450,y:420}};
  const table=newRoutingBlock(snap.devices[0],'table');table.position={x:40,y:120};o.routingBlocks.push(table);
  const before=studioLayout(snap,o,'en');delete o.devicePositions.B;const restored=studioLayout(snap,o,'en');
  const b=restored.boxes.findIndex(b=>b.device.id==='B'),d=restored.boxes.findIndex(b=>b.device.id==='D');
  expect(restored.documentCards[b]).toEqual(auto.documentCards[b]);expect(restored.documentCards[d]).toEqual(before.documentCards[d]);expect(o.routingBlocks[0]).toEqual(table);
  const next={...snap,devices:snap.devices.filter(d=>d.id!=='D')};const refreshed=reconcilePrintOptions(o,next);expect(refreshed.devicePositions).toEqual({});expect(o.devicePositions.D).toEqual({x:450,y:420});
  o.devicePositions={};expect(studioLayout(snap,o,'en').documentCards).toEqual(auto.documentCards);
});

it('keeps identity-safe presentation maps and the same geometry in SVG and HTML', () => {
  const snap=geometryFixture('line');snap.devices[0].id='__proto__';const o=printPreset('clean',snap);
  o.devicePositions=Object.fromEntries([['__proto__',{x:260,y:160}],['constructor',{x:0,y:0}]]);
  expect(manualDevicePosition({},'constructor')).toBeUndefined();expect(manualDevicePosition(o.devicePositions,'__proto__')).toEqual({x:260,y:160});
  const svg=studioDiagram(snap,o,'en');expect(studioReport(snap,o,'en').html).toContain(svg);expect(reconcilePrintOptions(o,snap).devicePositions).toEqual(Object.fromEntries([['__proto__',{x:260,y:160}]]));
});

it('keeps recomputed cable points and labels printable when a card is dragged to the page boundary', () => {
  const snap=geometryFixture('line'),o=printPreset('technical',snap);o.devicePositions.A={x:-500,y:-500};const l=studioLayout(snap,o,'en'),area=l.page.area;
  for(const cable of l.documentCables)for(const p of cable){expect(p.x).toBeGreaterThanOrEqual(area.x-.02);expect(p.y).toBeGreaterThanOrEqual(area.y-.02);expect(p.x).toBeLessThanOrEqual(area.x+area.width+.02);expect(p.y).toBeLessThanOrEqual(area.y+area.height+.02);}
  for(const label of l.documentLabels){expect(label.x).toBeGreaterThanOrEqual(area.x-.02);expect(label.y).toBeGreaterThanOrEqual(area.y-.02);expect(label.x+label.width).toBeLessThanOrEqual(area.x+area.width+.02);expect(label.y+label.height).toBeLessThanOrEqual(area.y+area.height+.02);}
});
