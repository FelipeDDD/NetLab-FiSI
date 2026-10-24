import { expect, it, vi } from 'vitest';
// The shared status helper is pure; do not initialize browser terminal sessions.
vi.mock('./store', () => ({ useStore: vi.fn() }));
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { linkAttachment, type VisualNode } from './deviceArtwork';
import { switchPortLeds } from './switchPortLeds';

it('uses the visual slot for eth23 and follows both endpoints and disconnection', () => {
  const net = new Network(), sw = createDevice(net, 'switch', { switchPorts: 24 }), host = createDevice(net, 'host');
  const node: VisualNode = { id: sw.id, position: { x: 300, y: 200 }, data: { kind: 'switch' } };
  const nodes: VisualNode[] = [node, { id: host.id, position: { x: 0, y: 200 }, data: { kind: 'host' } }];
  const link = net.connect(host.id, sw.id, { bIface: 'eth23' });
  const edges = [{ id: link.id, source: host.id, target: sw.id }];
  const slot = linkAttachment(node, link.id, nodes, edges).visualSlot!;
  const leds = () => switchPortLeds(node, nodes, edges, net);
  expect(slot).toBeLessThan(16); expect(leds()[slot].active).toBe(true);
  expect(leds().filter(s => s.active)).toHaveLength(1);
  link.a.up = false; expect(leds()[slot].active).toBe(false);
  link.a.up = true; link.b.up = false; expect(leds()[slot].active).toBe(false);
  link.b.up = true; expect(leds()[slot].active).toBe(true);
  net.disconnect(link.id); expect(leds().some(s => s.active)).toBe(false);
  expect(switchPortLeds(node, nodes, [], net).every(s => !s.active && !s.linkId)).toBe(true);
});

it('does not alias the eight overflow connections onto the sixteen illustrated sockets', () => {
  const net = new Network(), sw = createDevice(net, 'switch', { switchPorts: 24 });
  const node: VisualNode = { id: sw.id, position: { x: 300, y: 200 }, data: { kind: 'switch' } };
  const nodes: VisualNode[] = [node];
  const edges = Array.from({ length: 24 }, (_, i) => {
    const host = createDevice(net, 'host');
    nodes.push({ id: host.id, position: { x: i % 2 ? 600 : 0, y: 200 }, data: { kind: 'host' } });
    const link = net.connect(host.id, sw.id);
    link.a.up = i >= 16;
    return { id: link.id, source: host.id, target: sw.id };
  });
  const leds = switchPortLeds(node, nodes, edges, net);
  expect(leds.filter(s => s.linkId)).toHaveLength(16);
  expect(leds.some(s => s.active)).toBe(false);
  for (const e of edges.slice(16)) expect(leds.some(s => s.linkId === e.id)).toBe(false);
  expect(sw.interfaces).toHaveLength(24); expect(net.links.size).toBe(24);
});
