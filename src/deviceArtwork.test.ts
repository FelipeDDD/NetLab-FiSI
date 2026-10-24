import { expect, it } from 'vitest';
import { cableAttachmentBox, DEVICE_ARTWORK } from './deviceArtwork';
import { cableGeometry } from './cableGeometry';

it('leaves legacy equipment and the deferred Server geometry unchanged', () => {
  const box = { x: 40, y: 80, width: 96, height: 78 };
  for (const kind of ['host', 'server'] as const) {
    expect(cableAttachmentBox(box, kind)).toBe(box);
  }
});

it.each(['switch', 'router', 'firewall', 'ap'] as const)('%s lands inside the artwork, independently of label height', kind => {
  const box = { x: 100, y: 200, width: 152, height: 120 };
  const anchor = cableAttachmentBox(box, kind);
  expect(cableAttachmentBox({ ...box, height: 220 }, kind)).toEqual(anchor);
  expect(anchor.y).toBeGreaterThan(box.y + 6);
  expect(anchor.y + anchor.height).toBeLessThan(box.y + 6 + DEVICE_ARTWORK[kind].height);
  expect(cableAttachmentBox({ ...box, x: 120, y: 230 }, kind)).toEqual({ ...anchor, x: anchor.x + 20, y: anchor.y + 30 });
  expect(box).toEqual({ x: 100, y: 200, width: 152, height: 120 });
});

it.each(['straight', 'hybrid'] as const)('%s supports all four approach directions and reversed packet travel', style => {
  const a = cableAttachmentBox({ x: 300, y: 300, width: 152, height: 89 }, 'switch');
  for (const [x, y] of [[0, 200], [600, 400], [200, 0], [400, 600]]) {
    const b = cableAttachmentBox({ x, y, width: 132, height: 127 }, 'router');
    const path = cableGeometry(a, b, style), reverse = cableGeometry(b, a, style);
    const start = path.pointAt(0), end = path.pointAt(1);
    expect(start.x).toBeGreaterThanOrEqual(a.x - 1e-9);
    expect(start.x).toBeLessThanOrEqual(a.x + a.width + 1e-9);
    expect(start.y).toBeGreaterThanOrEqual(a.y - 1e-9);
    expect(start.y).toBeLessThanOrEqual(a.y + a.height + 1e-9);
    expect(end.x).toBeGreaterThanOrEqual(b.x - 1e-9);
    expect(end.x).toBeLessThanOrEqual(b.x + b.width + 1e-9);
    expect(path.path).not.toMatch(/NaN|Infinity/);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(path.pointAt(t).x).toBeCloseTo(reverse.pointAt(1 - t).x, 5);
      expect(path.pointAt(t).y).toBeCloseTo(reverse.pointAt(1 - t).y, 5);
    }
  }
});

import { linkAttachment } from './deviceArtwork';
it('allocates 16 distinct visual slots, stable under array reorder, with fallback through 24 links', () => {
  const sw = { id: 'sw', position: { x: 300, y: 300 }, data: { kind: 'switch' as const }, measured: { width: 152, height: 89 } };
  const peers = Array.from({ length: 24 }, (_, i) => ({ id: `pc${i}`, position: { x: i % 2 ? 700 : 0, y: i * 30 }, data: { kind: 'host' as const } }));
  const nodes = [sw, ...peers];
  const edges = peers.map((n, i) => ({ id: `link-${i}`, source: sw.id, target: n.id }));
  const boxes = edges.map(e => linkAttachment(sw, e.id, nodes, edges));
  expect(new Set(boxes.slice(0, 16).map(b => `${b.x},${b.y}`)).size).toBe(16);
  for (let i = 0; i < 24; i++) expect(linkAttachment(sw, edges[i].id, nodes, [...edges].reverse())).toEqual(boxes[i]);
  expect(boxes[16]).toEqual(cableAttachmentBox({ ...sw.position, ...sw.measured }, 'switch'));
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
});

it('keeps above-switch cables behind the PNG and gives side arrivals a downward front approach', () => {
  const sw = { id: 'sw', position: { x: 300, y: 300 }, data: { kind: 'switch' as const }, measured: { width: 152, height: 89 } };
  const peer = { id: 'pc', position: { x: 320, y: 0 }, data: { kind: 'host' as const } };
  const edges = [{ id: 'link', source: peer.id, target: sw.id }];
  expect(linkAttachment(sw, 'link', [sw, peer], edges).front).toBeUndefined();
  expect(linkAttachment(sw, 'link', [sw, { ...peer, position: { x: 0, y: 310 } }], edges).front).toEqual({ x: -24, y: 26 });
});

it('fills the bottom row first and reaches below that row when using an upper socket', () => {
  const sw = { id: 'sw', position: { x: 300, y: 300 }, data: { kind: 'switch' as const }, measured: { width: 152, height: 89 } };
  const peers = Array.from({ length: 9 }, (_, i) => ({ id: `pc${i}`, position: { x: 300 + i * 4, y: 0 }, data: { kind: 'host' as const } }));
  const nodes = [sw, ...peers], edges = peers.map((p, i) => ({ id: `link-${i}`, source: p.id, target: sw.id }));
  const boxes = edges.map(e => linkAttachment(sw, e.id, nodes, edges));
  expect(boxes.slice(0, 8).every(b => b.visualSlot! >= 8)).toBe(true);
  expect(boxes[8].visualSlot).toBeLessThan(8);
  expect(boxes[8].rearBelow).toBeGreaterThan(8);
  expect(boxes[8].y + boxes[8].rearBelow!).toBeCloseTo(boxes[0].y + boxes[0].rearBelow!, 5);
});

it('fans lower arrivals across a wider range while keeping left and rear approaches unchanged', () => {
  const sw = { id: 'sw', position: { x: 300, y: 300 }, data: { kind: 'switch' as const }, measured: { width: 152, height: 89 } };
  const peers = [-220, -110, 0, 110, 220].map((dx, i) => ({ id: `pc${i}`, position: { x: 328 + dx, y: 650 }, data: { kind: 'host' as const } }));
  const nodes = [sw, ...peers], edges = peers.map((p, i) => ({ id: `link-${i}`, source: p.id, target: sw.id }));
  const boxes = edges.map(e => linkAttachment(sw, e.id, nodes, edges));
  expect(boxes.map(b => b.visualSlot)).toEqual([9, 10, 11, 13, 14]);
  expect(boxes[0].front!.x).toBeLessThan(-16); expect(boxes[4].front!.x).toBeGreaterThan(16);
  expect(boxes.every(b => b.front!.y === 38)).toBe(true);
  for (const style of ['straight', 'hybrid'] as const) {
    const port = boxes[0], peer = { x: 108, y: 650, width: 96, height: 78 };
    const g = cableGeometry(port, peer, style), reversed = cableGeometry(peer, port, style);
    let previous = g.pointAt(0);
    // The entire local approach progresses downward without a kink back upward.
    for (let i = 1; i <= 40; i++) {
      const t = i / g.length;
      const p = g.pointAt(t);
      expect(p.y).toBeGreaterThanOrEqual(previous.y - 0.001);
      expect(p.x).toBeCloseTo(reversed.pointAt(1 - t).x, 4);
      expect(p.y).toBeCloseTo(reversed.pointAt(1 - t).y, 4);
      previous = p;
    }
  }
});
