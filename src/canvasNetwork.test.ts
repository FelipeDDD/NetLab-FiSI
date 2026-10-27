import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { canvasNetwork, networkLabelScale, deviceLabelLayout, DEVICE_LABEL_MAX_SCALE } from './canvasNetwork';
import { parseCidr } from './engine/ip';
it('prefers operational IPv4 and retains all configured addresses in the tooltip', () => {
  const net=new Network(), nb=createDevice(net,'notebook'), ap=createDevice(net,'ap');
  nb.interfaces[0].ip=parseCidr('192.0.2.10/24');nb.interfaces[1].ip=parseCidr('10.0.0.10/24');
  net.associate(nb.id,ap.id);const s=canvasNetwork(nb)!;
  expect(s.address).toBe('10.0.0.10');expect(s.icon).toBeNull();expect(s.tooltip).toContain('eth0: 192.0.2.10/24 · Kein Link · gespeichert');
  expect(s.addresses).toMatchObject([
    { interfaceName: 'wlan0', address: '10.0.0.10', active: true, stored: false },
    { interfaceName: 'eth0', address: '192.0.2.10', active: false, stored: true },
  ]);
  nb.position.x=600;const outside=canvasNetwork(nb)!;expect(outside.address).toBe(s.address);expect(outside.state).toBe('Außer Reichweite');expect(outside.icon).toBe('wifi-off');
  nb.position.x=0;expect(canvasNetwork(nb)!.icon).toBeNull();
});
it('lists every configured router interface without inventing addresses for empty ports', () => {
  const net = new Network(), router = createDevice(net, 'router');
  router.interfaces[0].ip = parseCidr('192.168.1.1/24');
  router.interfaces[1].ip = parseCidr('10.0.0.1/24');
  const summary = canvasNetwork(router)!;
  expect(summary.addresses.map(a => [a.interfaceName, a.address])).toEqual([['eth0', '192.168.1.1'], ['eth1', '10.0.0.1']]);
  expect(summary.addresses.every(a => a.stored)).toBe(true);
  expect(summary.addresses[1].tooltip).toContain('10.0.0.1/24');
});
it('distinguishes unplugged Ethernet, missing IPv4 and pending DHCP without losing stored IP', () => {
  const net=new Network(), h=createDevice(net,'host'), sw=createDevice(net,'switch');
  h.interfaces[0].ip=parseCidr('192.0.2.1/24');expect(canvasNetwork(h)!.icon).toBe('unplug');expect(canvasNetwork(h)!.stored).toBe(true);
  net.connect(h.id,sw.id);h.interfaces[0].ip=null;expect(canvasNetwork(h)!.state).toBe('IPv4 nicht konfiguriert');
  h.interfaces[0].configureIpv4({mode:'dhcp',ip:null,gateway:null,dns:null});expect(canvasNetwork(h)!.state).toBe('DHCP ausstehend');
  h.interfaces[0].ip=parseCidr('192.0.2.2/24');expect(canvasNetwork(h)!.icon).toBeNull();
  expect(canvasNetwork(sw)).toBeNull();
});
it('remembers the displayed interface when both notebook adapters disconnect', () => {
  const net=new Network(), nb=createDevice(net,'notebook');nb.interfaces[0].ip=parseCidr('10.0.0.1/24');nb.interfaces[1].ip=parseCidr('10.0.0.2/24');
  expect(canvasNetwork(nb,'wlan0')!.address).toBe('10.0.0.2');expect(canvasNetwork(nb,'wlan0')!.icon).toBe('wifi-off');
});
it('bounds partial zoom compensation and does not shrink high-zoom labels', () => {
  expect(networkLabelScale(.25)).toBe(DEVICE_LABEL_MAX_SCALE);expect(networkLabelScale(.5)).toBe(DEVICE_LABEL_MAX_SCALE);
  expect(networkLabelScale(1)).toBe(1);expect(networkLabelScale(2)).toBe(1);
});

it('keeps captions readable at half zoom with bounded continuous compensation', () => {
  expect(14 * .5 * networkLabelScale(.5)).toBeGreaterThanOrEqual(12.5);
  expect(13 * .5 * networkLabelScale(.5)).toBeGreaterThanOrEqual(12);
  for (const zoom of [.01, .1, .25, .5, .75, 1, 1.25, 2.5]) {
    expect(networkLabelScale(zoom)).toBeGreaterThanOrEqual(1);
    expect(networkLabelScale(zoom)).toBeLessThanOrEqual(DEVICE_LABEL_MAX_SCALE);
    expect(Math.abs(networkLabelScale(zoom) - networkLabelScale(zoom + .0001))).toBeLessThan(.002);
  }
});

it('bounds neighboring captions without moving nodes or changing their geometry', () => {
  const a = { id: 'a', position: { x: 0, y: 0 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } };
  const b = { ...a, id: 'b', position: { x: 120, y: 0 } };
  const nodes = [a, b], before = structuredClone(nodes);
  for (const zoom of [.5, .75, 1, 1.25]) {
    const layout = deviceLabelLayout(a, nodes, zoom);
    expect(layout.maxWidth * layout.scale).toBeLessThanOrEqual(108);
    expect(deviceLabelLayout(a, [a, { ...b, position: { x: 120, y: 220 } }], zoom).maxWidth).toBe(180);
  }
  expect(nodes).toEqual(before);
});

it('measures caption neighborhoods using actual node heights across different device shapes', () => {
  const a = { id: 'a', position: { x: 0, y: 0 }, measured: { width: 124, height: 111 }, data: { kind: 'host' as const } };
  const server = { id: 's', position: { x: 130, y: -34 }, measured: { width: 100, height: 145 }, data: { kind: 'server' as const } };
  expect(deviceLabelLayout(a, [a, server], .5).maxWidth).toBeLessThan(180);
  expect(deviceLabelLayout(a, [a, { ...server, position: { x: 130, y: 300 } }], .5).maxWidth).toBe(180);
});

it('uses available room beside short bridge captions instead of truncating IPv4 unnecessarily', () => {
  const router = { id: 'r1', position: { x: 0, y: 0 }, measured: { width: 132, height: 127 }, data: { kind: 'router' as const } };
  const ap = { id: 'ap1', position: { x: 250, y: 12 }, measured: { width: 124, height: 115 }, data: { kind: 'ap' as const } };
  expect(deviceLabelLayout(router, [router, ap], .5).maxWidth).toBe(180);
});
