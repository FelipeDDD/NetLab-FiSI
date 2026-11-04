import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { linkPresentation, linkTooltipEndpoints } from './linkPresentation';

it('reads actual endpoint names, high numbered ports, status and latency without mutation', () => {
  const net = new Network(), sw = createDevice(net, 'switch', { switchPorts: 24 }), host = createDevice(net, 'host');
  const link = net.connect(host.id, sw.id, { bIface: 'eth18' });
  expect(linkPresentation(net, link.id)?.title).toBe('pc1 / eth0 ↔ sw1 / eth18');
  link.b.up = false; link.latency = 125; host.name = 'Client';
  expect(linkPresentation(net, link.id)).toEqual({ title: 'Client / eth0 ↔ sw1 / eth18', a: 'Client / eth0 · UP', b: 'sw1 / eth18 · DOWN', latency: 125 });
  expect(sw.interfaces[18].link).toBe(link); expect(net.links.size).toBe(1);
  net.disconnect(link.id); expect(linkPresentation(net, link.id)).toBeNull();
});

it('orders tooltip endpoints only along an unambiguous canvas axis', () => {
  const net = new Network(), router = createDevice(net, 'router'), sw = createDevice(net, 'switch', { switchPorts: 24 });
  const link = net.connect(router.id, sw.id, { aIface: 'eth1', bIface: 'eth4' });
  const node = (id: string, x: number, y: number) => ({ id, position: { x, y }, measured: { width: 100, height: 100 } });
  const names = (nodes: ReturnType<typeof node>[]) => linkTooltipEndpoints(net, link.id, nodes)?.map(e => `${e.name} / ${e.interfaceName}`);
  const original = [`${router.name} / eth1`, `${sw.name} / eth4`];
  expect(names([node(router.id, 400, 0), node(sw.id, 0, 0)])).toEqual([...original].reverse());
  expect(names([node(router.id, 0, 400), node(sw.id, 0, 0)])).toEqual([...original].reverse());
  expect(names([node(router.id, 400, 400), node(sw.id, 0, 0)])).toEqual(original);
  expect(names([node(router.id, 20, 0), node(sw.id, 0, 0)])).toEqual(original);
  expect(names([node(router.id, 400, 0)])).toEqual(original);
  expect(link.a.device).toBe(router); expect(link.b.device).toBe(sw);
  net.disconnect(link.id); expect(linkTooltipEndpoints(net, link.id, [])).toBeNull();
});

it('ignores missing, inconsistent and disposed links', () => {
  const net = new Network(), a = createDevice(net, 'host'), b = createDevice(net, 'switch');
  expect(linkPresentation(net, null)).toBeNull();
  const link = net.connect(a.id, b.id);
  link.b.link = null; expect(linkPresentation(net, link.id)).toBeNull();
  link.b.link = link; a.dispose(); expect(linkPresentation(net, link.id)).toBeNull();
});
