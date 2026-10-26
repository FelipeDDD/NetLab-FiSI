import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { InterfaceConnection, InterfaceSummary, interfaceConnection } from './InterfaceConnection';
import type { CableAppearances } from '../cableAppearance';

const view = vi.hoisted(() => ({ hoveredLinkId: null as string | null, edges: [] as { id: string; selected?: boolean }[], cableColors: {} as CableAppearances }));
vi.mock('../store', () => ({ useStore: Object.assign((select: (s: typeof view) => unknown) => select(view), { getState: () => view }) }));

it('marks only the matching real interface for hovered or selected cables', () => {
  const { a, link } = pair();
  const render = () => renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  view.hoveredLinkId = 'different'; expect(render()).not.toContain('cable-interface-highlighted');
  view.hoveredLinkId = link.id; expect(render()).toContain('cable-interface-highlighted');
  expect(render()).not.toContain('data-link-selected');
  view.hoveredLinkId = null; view.edges = [{ id: link.id, selected: true }];
  expect(render()).toContain('cable-interface-highlighted');
  expect(render()).toContain('data-link-selected="true"');
  view.hoveredLinkId = link.id; view.edges = [];
  expect(render()).not.toContain('data-link-selected');
  view.hoveredLinkId = null;
  view.edges = [];
});

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
it('uses a decorative connector independently of the category-colored peer name', () => {
  const { a } = pair();
  const html = renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  expect(html).toMatch(/<svg class="interface-peer-connector"[^>]*aria-hidden="true"/);
  expect(html).toContain('var(--server, var(--text))');
  expect(html).toContain('</svg><strong');
  expect(html).toContain('class="sr-only">Verbunden mit </span>');
  expect(html).toContain('width="17" height="17"');
  expect(html).not.toContain('>Mit ');
  expect(html).toContain('is-connected');
});

it('uses the cable identity marker without replacing UP/DOWN status or the neighbor category color', () => {
  const { a } = pair(), link = a.link!;
  view.cableColors = { [link.id]: { mode: 'auto', color: '#f472b6' } };
  let html = renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  expect(html).toContain('data-cable-color="#f472b6"'); expect(html).toContain('--interface-cable-color:#f472b6');
  expect(html).toContain('is-connected'); expect(html).toContain('Link aktiv'); expect(html).toContain('var(--server, var(--text))');
  a.up = false; html = renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  expect(html).toContain('is-inactive'); expect(html).toContain('Link inaktiv'); expect(html).toContain('data-cable-color="#f472b6"');
  a.device.network.disconnect(link.id); html = renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  expect(html).not.toContain('data-cable-color='); expect(html).toContain('--interface-cable-color:var(--ui-link-empty)');
  view.cableColors = {};
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

it('separates neighbor identity, administrative state and derived link status', () => {
  const { a, b, net, link } = pair();
  b.device.name = 'server-with-a-long-name';
  b.up = false;
  const render = () => renderToStaticMarkup(createElement(InterfaceSummary, { iface: a }));
  expect(render()).toContain('Link inaktiv');
  expect(render()).toContain('Admin: UP');
  expect(render()).toContain('var(--server, var(--text))');
  expect(render()).toContain('server-with-a-long-name');
  b.up = true;
  expect(render()).toContain('Link aktiv');
  net.links.delete(link.id);
  expect(render()).toContain('Verbindung unbekannt');
  expect(render()).not.toContain('server-with-a-long-name');
  net.links.set(link.id, link); net.disconnect(link.id);
  expect(render()).toContain('Kein Kabel');
  expect(render()).toContain('Keine Verbindung');
});

it('uses wireless wording without changing how link and admin states are detected', () => {
  const { a, b, net, link } = pair();
  const render = () => renderToStaticMarkup(createElement(InterfaceSummary, { iface: a, medium: 'wireless' }));
  expect(render()).toContain('WLAN aktiv'); expect(render()).toContain('Admin: UP');
  b.up = false;
  expect(render()).toContain('WLAN inaktiv'); expect(render()).toContain('Gegenstelle DOWN');
  expect(render()).not.toContain('Kabel zu');
  net.disconnect(link.id);
  expect(render()).toContain('Kein WLAN-Link'); expect(render()).not.toContain('Kabel');
});

it('keeps an unclassified empty port neutral without changing known wired ports or unknown link states', () => {
  const { a, net, link } = pair();
  const render = () => renderToStaticMarkup(createElement(InterfaceSummary, { iface: a, medium: 'unspecified' }));
  net.links.delete(link.id);
  expect(render()).toContain('Unbekannt'); expect(render()).not.toContain('Nicht belegt');
  net.links.set(link.id, link); net.disconnect(link.id);
  a.up = false;
  expect(render()).toContain('Nicht belegt'); expect(render()).toContain('is-disconnected');
  expect(render()).toContain('Admin: DOWN'); expect(render()).not.toContain('Kabel');
  expect(renderToStaticMarkup(createElement(InterfaceSummary, { iface: a, medium: 'wired' }))).toContain('Kein Kabel');
});
