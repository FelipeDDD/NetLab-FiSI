import { describe, expect, it } from 'vitest';
import { addReference, boundReference, placeReference, referenceSection, type ReferenceTarget } from './floatingReferences';

const route = (operationIndex: number): ReferenceTarget => ({ entryId: 'linux-ip-route', operationIndex });
describe('floating command references', () => {
  it('resolves operations from the existing catalog without copying content', () => {
    const section = referenceSection(route(1))!;
    expect(section.operation.syntax).toBe('ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]');
    expect(section.operation.example).toContain('10.72.254.2 dev eth1');
  });
  it('allows two different operations, rejects duplicates even at capacity, and frees a closed slot', () => {
    const first = addReference([], route(0));
    const second = addReference(first.items, route(1));
    expect(second.status).toBe('added');
    expect(first.items).toEqual([route(0)]);
    expect(addReference(second.items, route(0)).status).toBe('duplicate');
    expect(addReference(second.items, route(2)).status).toBe('limit');
    expect(addReference(second.items.slice(1), route(2)).status).toBe('added');
  });
  it('does not expose unsupported commands or invalid operation indexes', () => {
    for (const target of [route(-1), route(1.5), route(99), { entryId: 'windows-route', operationIndex: 0 }]) {
      expect(addReference([], target)).toEqual({ status: 'unsupported', items: [] });
    }
  });
  it('bounds dragged positions after resize, including a viewport smaller than the preferred panel', () => {
    expect(boundReference({ x: 1300, y: 800 }, { width: 700, height: 600 }, { width: 420, height: 450 })).toEqual({ x: 272, y: 142 });
    expect(boundReference({ x: -40, y: -50 }, { width: 320, height: 240 }, { width: 304, height: 224 })).toEqual({ x: 8, y: 8 });
  });
  it('chooses free canvas space and avoids an existing floating reference when room is available', () => {
    const viewport = { width: 1440, height: 960 }, size = { width: 420, height: 440 };
    const canvas = { x: 200, y: 100, width: 960, height: 800 };
    const first = placeReference(viewport, size, canvas, []);
    const second = placeReference(viewport, size, canvas, [{ ...first, ...size }]);
    expect(second.x + size.width <= first.x || second.x >= first.x + size.width || second.y + size.height <= first.y || second.y >= first.y + size.height).toBe(true);
    expect(boundReference(second, viewport, size)).toEqual(second);
  });
});
