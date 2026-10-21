import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { InterfaceConnection, interfaceConnection } from './InterfaceConnection';

function pair() {
  const net = new Network(), a = createDevice(net, 'router'), b = createDevice(net, 'server');
  const link = net.connect(a.id, b.id); return { net, a: a.interfaces[0], b: b.interfaces[0], link };
}
it('reports an active modeled link only when both ends are UP', () => {
  const { a, b } = pair(); expect(interfaceConnection(a).state).toBe('connected');
  a.up = false; expect(interfaceConnection(a)).toMatchObject({ state: 'inactive', text: expect.stringContaining('lokale Schnittstelle DOWN') });
  a.up = true; b.up = false; expect(interfaceConnection(a)).toMatchObject({ state: 'inactive', text: expect.stringContaining('Gegenstelle DOWN') });
  a.up = false; expect(interfaceConnection(a).text).toContain('beide Schnittstellen DOWN');
});
it('distinguishes no cable from a cable disabled at an endpoint', () => {
  const { a, b, net, link } = pair(); b.up = false;
  let html = renderToStaticMarkup(createElement(InterfaceConnection, { iface: a }));
  expect(html).toContain('is-inactive'); expect(html).not.toContain('is-connected'); expect(html).toContain(b.device.name);
  net.disconnect(link.id); expect(interfaceConnection(a).state).toBe('disconnected');
  html = renderToStaticMarkup(createElement(InterfaceConnection, { iface: a })); expect(html).toContain('kein Kabel');
});
it('uses a neutral unknown state for inconsistent or disposed endpoints', () => {
  const { net, a, b, link } = pair(); net.links.delete(link.id);
  expect(interfaceConnection(a).state).toBe('unknown'); net.links.set(link.id, link);
  b.device.dispose(); expect(interfaceConnection(a).state).toBe('unknown');
});
