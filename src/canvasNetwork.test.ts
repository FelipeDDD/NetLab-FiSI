import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { canvasNetwork, networkLabelScale } from './canvasNetwork';
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
  expect(networkLabelScale(.25)).toBe(1.5);expect(networkLabelScale(.5)).toBeGreaterThan(1);
  expect(networkLabelScale(1)).toBe(1);expect(networkLabelScale(2)).toBe(1);
});
