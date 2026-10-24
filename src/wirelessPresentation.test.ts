import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { inactiveWireless } from './wirelessPresentation';
it('tracks wireless liveness without dimming Ethernet, including range loss and recovery', () => {
  const net = new Network(), host = createDevice(net, 'host'), ap = createDevice(net, 'ap');
  net.enableWireless(host.id); const link = net.associate(host.id, ap.id);
  expect(inactiveWireless(link)).toBe(false);
  host.position.x = 500; expect(inactiveWireless(link)).toBe(true);
  host.position.x = 0; expect(inactiveWireless(link)).toBe(false);
  link.b.up = false; expect(inactiveWireless(link)).toBe(true);
  link.b.up = true; link.ssid = 'other'; expect(inactiveWireless(link)).toBe(true);
  const a = createDevice(net,'host'), b = createDevice(net,'switch');
  const wired = net.connect(a.id,b.id); wired.a.up=false;
  expect(inactiveWireless(wired)).toBe(false); expect(inactiveWireless(undefined)).toBe(false);
});
