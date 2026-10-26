import { expect, it } from 'vitest';
import { alignNodeAnchors, getVisualAlignmentPoint, type AlignmentNode } from './alignmentGuides';
import { cableAttachmentBox } from './deviceArtwork';
import { cableGeometry } from './cableGeometry';

const moving: AlignmentNode = { id: 'moving', position: { x: 10, y: 20 }, measured: { width: 100, height: 60 } };
const horizontal: AlignmentNode = { id: 'horizontal', position: { x: 300, y: 0 }, measured: { width: 140, height: 100 } };
const vertical: AlignmentNode = { id: 'vertical', position: { x: 40, y: 300 }, measured: { width: 60, height: 120 } };
const proposed = [{ id: moving.id, position: { x: 17, y: 24 } }];

it('aligns measured centers of unequal nodes horizontally, leaving X free', () => {
  const result = alignNodeAnchors([moving, horizontal], proposed, 1);
  expect(result.offset).toEqual({ x: 0, y: -4 });
  expect(result.guides).toEqual([{ axis: 'horizontal', movingId: 'moving', targetId: 'horizontal', from: { x: 67, y: 50 }, to: { x: 370, y: 50 } }]);
});
it('aligns vertical centers without modifying Y', () => {
  const result = alignNodeAnchors([moving, vertical], proposed, 1);
  expect(result.offset).toEqual({ x: 3, y: 0 });
  expect(result.guides[0]).toMatchObject({ axis: 'vertical', from: { x: 70, y: 54 }, to: { x: 70, y: 360 } });
});
it('aligns both axes with at most two bounded center-to-center lines', () => {
  const nodes = [moving, horizontal, vertical], before = structuredClone(nodes);
  const result = alignNodeAnchors(nodes, proposed, 1);
  expect(result.offset).toEqual({ x: 3, y: -4 }); expect(result.guides).toHaveLength(2);
  expect(result.guides.map(g => g.from)).toEqual([{ x: 70, y: 50 }, { x: 70, y: 50 }]);
  expect(nodes).toEqual(before); expect(proposed[0].position).toEqual({ x: 17, y: 24 });
});
it.each([.25, .5, 1, 2, 2.5])('uses an 8 screen-pixel tolerance at zoom %s', zoom => {
  const target = { ...vertical, position: { x: 37 + 7 / zoom, y: 300 } }; // center X = 67 + 7/zoom
  expect(alignNodeAnchors([moving, target], proposed, zoom).offset.x * zoom).toBeCloseTo(7);
  target.position.x = 37 + 8.5 / zoom;
  expect(alignNodeAnchors([moving, target], proposed, zoom).offset.x).toBe(0);
});
it('ignores coincident edges and nodes without valid measured dimensions', () => {
  const edgeMatch = { ...horizontal, position: { ...proposed[0].position }, measured: { width: 160, height: 120 } };
  expect(alignNodeAnchors([moving, edgeMatch], proposed, 1).guides).toEqual([]);
  for (const target of [{ ...horizontal, measured: undefined }, { ...horizontal, measured: { width: 0, height: 100 } }, { ...horizontal, hidden: true }]) {
    expect(alignNodeAnchors([moving, target], proposed, 1).guides).toEqual([]);
  }
});
it('retains a target inside tolerance to avoid jitter, but releases immediately outside 8px', () => {
  const a = { ...vertical, id: 'a', position: { x: 70, y: 300 } }, b = { ...vertical, id: 'b', position: { x: 72, y: 300 } };
  const first = alignNodeAnchors([moving, a, b], [{ id: 'moving', position: { x: 49, y: 24 } }], 1);
  expect(first.locks.x?.targetId).toBe('a');
  const retained = alignNodeAnchors([moving, a, b], [{ id: 'moving', position: { x: 51.8, y: 24 } }], 1, first.locks);
  expect(retained.locks.x?.targetId).toBe('a');
  const released = alignNodeAnchors([moving, a], [{ id: 'moving', position: { x: 59, y: 24 } }], 1, first.locks);
  expect(released.offset.x).toBe(0); expect(released.guides).toEqual([]);
});
it('keeps equal-distance choices stable regardless of node array order', () => {
  const a = { ...vertical, id: 'a', position: { x: 70, y: 300 } }, b = { ...vertical, id: 'b', position: { x: 72, y: 300 } };
  const positions = [{ id: 'moving', position: { x: 51, y: 24 } }];
  expect(alignNodeAnchors([moving, a, b], positions, 1)).toEqual(alignNodeAnchors([b, moving, a], positions, 1));
});
it('uses a common group translation and excludes every moving node as a target', () => {
  const a = { ...moving, position: { x: 0, y: 0 } }, b = { ...vertical, id: 'group-b', position: { x: 200, y: 0 } };
  const target = { ...horizontal, position: { x: 300, y: -16 } };
  const positions = [{ id: a.id, position: { x: 10, y: 0 } }, { id: b.id, position: { x: 210, y: 0 } }];
  const result = alignNodeAnchors([a, b, target], positions, 1);
  expect(result.offset).toEqual({ x: 0, y: 4 }); expect(result.guides).toHaveLength(1);
  expect(alignNodeAnchors([a, b], positions, 1).guides).toEqual([]);
});

const artworkCases = [
  ['host', 124, 111, 55.5], ['server', 100, 145, 72.5],
  ['router', 132, 127, 69.14], ['firewall', 146, 119, 63.72],
  ['notebook', 128, 125, 46], ['smartphone', 80, 131, 49],
  ['ap', 124, 115, 48], ['switch', 152, 89, 44.5],
] as const;

it.each(artworkCases)('uses the %s visual anchor and retains the geometric X center', (kind, width, height, offsetY) => {
  const node = { id: kind, data: { kind }, position: { x: 10, y: 20 }, measured: { width, height } };
  expect(getVisualAlignmentPoint(node)!.x).toBe(10 + width / 2);
  expect(getVisualAlignmentPoint(node)!.y).toBeCloseTo(20 + offsetY);
  expect(getVisualAlignmentPoint(node, { x: 70, y: 90 })!.y).toBeCloseTo(90 + offsetY);
  if (kind !== 'switch') expect(getVisualAlignmentPoint({ ...node, measured: { width, height: height + 80 } })).toEqual(getVisualAlignmentPoint(node));
});

const pc = { id: 'pc', data: { kind: 'host' }, position: { x: 180, y: 344.5 }, measured: { width: 124, height: 111 } } satisfies AlignmentNode;
const notebook = { id: 'note', data: { kind: 'notebook' }, position: { x: 650, y: 337.5 }, measured: { width: 128, height: 125 } } satisfies AlignmentNode;

it('aligns a notebook to a PC by the cable band, rather than their coincident bounding-box centers', () => {
  expect(alignNodeAnchors([pc, notebook], [{ id: notebook.id, position: notebook.position }], 1).guides).toEqual([]);
  const result = alignNodeAnchors([pc, notebook], [{ id: notebook.id, position: { x: 650, y: 358 } }], 1);
  expect(result.offset).toEqual({ x: 0, y: -4 });
  expect(result.guides).toEqual([{ axis: 'horizontal', movingId: notebook.id, targetId: pc.id, from: { x: 714, y: 400 }, to: { x: 242, y: 400 } }]);
});

it.each(['straight', 'hybrid'] as const)('keeps %s cables level after optical alignment, without changing their geometry', style => {
  const router = { id: 'router', data: { kind: 'router' }, position: { x: 180, y: 126.5 }, measured: { width: 132, height: 127 } } satisfies AlignmentNode;
  const server = { id: 'server', data: { kind: 'server' }, position: { x: 650, y: 117.5 }, measured: { width: 100, height: 145 } } satisfies AlignmentNode;
  for (const [target, moving, y] of [[router, server, 125], [pc, notebook, 358]] as const) {
    const position = { x: moving.position.x, y };
    const result = alignNodeAnchors([target, moving], [{ id: moving.id, position }], 1);
    const a = cableAttachmentBox({ ...target.position, ...target.measured }, target.data.kind);
    const b = cableAttachmentBox({ ...position, y: position.y + result.offset.y, ...moving.measured }, moving.data.kind);
    const path = cableGeometry(a, b, style);
    expect(path.pointAt(0).y).toBeCloseTo(path.pointAt(1).y, 8);
  }
});

it('keeps the vertical guide endpoints at geometric centers for artwork nodes', () => {
  const node = { ...notebook, position: { x: 20, y: 100 } };
  const target = { ...pc, position: { x: 24, y: 300 } };
  const result = alignNodeAnchors([node, target], [{ id: node.id, position: node.position }], 1);
  expect(result.offset).toEqual({ x: 2, y: 0 });
  expect(result.guides).toEqual([{ axis: 'vertical', movingId: node.id, targetId: target.id, from: { x: 86, y: 162.5 }, to: { x: 86, y: 355.5 } }]);
});

it.each([.25, 1, 2.5])('preserves optical group snapping with an 8px visual threshold at zoom %s', zoom => {
  const group = { ...notebook, id: 'group', position: { x: 850, y: 540 } };
  const positions = [{ id: notebook.id, position: { x: 650, y: 354 + 7 / zoom } }, { id: group.id, position: { ...group.position } }];
  const result = alignNodeAnchors([pc, notebook, group], positions, zoom);
  expect(result.offset.y * zoom).toBeCloseTo(-7);
  expect(result.guides[0].from.y).toBe(400);
  positions[0].position.y = 354 + 8.5 / zoom;
  expect(alignNodeAnchors([pc, notebook, group], positions, zoom).guides).toEqual([]);
});
