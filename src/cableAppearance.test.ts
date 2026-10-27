import { expect, it } from 'vitest';
import { automaticCableAppearance, CABLE_COLORS, readCableColors, resolvedCableAppearances, interfaceCableColor, type CableAppearances } from './cableAppearance';
import { DEVICE_COLORS } from './deviceColors';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { NetInterface } from './engine/device';

it.each(['host', 'server', 'ap', 'switch', 'firewall'] as const)('prefers the existing %s identity over the router regardless of connection direction', kind => {
  for (const reversed of [true, false]) {
    const net = new Network(), router = createDevice(net, 'router'), peer = createDevice(net, kind);
    const link = reversed ? net.connect(peer.id, router.id) : net.connect(router.id, peer.id);
    expect(automaticCableAppearance(net, link.id, {})).toEqual({ mode: 'auto', color: DEVICE_COLORS[kind] });
  }
});

it('avoids colors already used at either router endpoint and never mutates existing manual assignments', () => {
  const net = new Network(), router = createDevice(net, 'router'), colors: CableAppearances = {};
  for (let i = 0; i < 4; i++) {
    const peer = createDevice(net, 'ap'), link = net.connect(router.id, peer.id);
    colors[link.id] = automaticCableAppearance(net, link.id, colors);
  }
  expect(new Set(Object.values(colors).map(c => c.color)).size).toBe(4);
  expect(Object.values(colors)[0].color).toBe(DEVICE_COLORS.ap);
  const id = [...net.links.keys()][0]; colors[id] = { mode: 'manual', color: CABLE_COLORS.yellow.value };
  const before = structuredClone(colors), link = [...net.links.values()][1];
  automaticCableAppearance(net, link.id, colors); expect(colors).toEqual(before);
});

it('checks both routers when picking an alternative for a connection between them', () => {
  const net = new Network(), a = createDevice(net, 'router'), b = createDevice(net, 'router');
  const left = net.connect(a.id, createDevice(net, 'host').id), right = net.connect(b.id, createDevice(net, 'host').id);
  const colors: CableAppearances = {
    [left.id]: { mode: 'manual', color: CABLE_COLORS.gray.value },
    [right.id]: { mode: 'manual', color: DEVICE_COLORS.router },
  };
  const link = net.connect(a.id, b.id);
  expect(automaticCableAppearance(net, link.id, colors)).toEqual({ mode: 'auto', color: CABLE_COLORS.red.value });
});

it('generates stable distinguishable colors after exhausting the palette and persists exact auto/manual metadata', () => {
  const net = new Network(), router = createDevice(net, 'router'), colors: CableAppearances = {};
  // Future-capacity fixture; production Router capacity is unchanged.
  for (let i = 4; i < 20; i++) router.interfaces.push(new NetInterface(router, `eth${i}`, net.nextMac()));
  for (let i = 0; i < 20; i++) {
    const link = net.connect(router.id, createDevice(net, 'ap').id);
    const first = automaticCableAppearance(net, link.id, colors);
    expect(automaticCableAppearance(net, link.id, colors)).toEqual(first);
    expect(first.color).toMatch(/^#[0-9a-f]{6}$/); colors[link.id] = first;
  }
  expect(new Set(Object.values(colors).map(c => c.color)).size).toBe(20);
  const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [.2126, .7152, .0722][i], 0);
  for (const { color } of Object.values(colors).slice(7)) {
    expect((1 + .05) / (luminance(color) + .05)).toBeGreaterThan(3);
    expect((luminance(color) + .05) / .055).toBeGreaterThan(3);
  }
  expect(readCableColors(JSON.parse(JSON.stringify(colors)), net.links.keys())).toEqual(colors);
});

it('migrates earlier user choices as manual and keeps default legacy links uncolored', () => {
  expect(readCableColors({ a: 'purple', b: { mode: 'auto', color: '#F472B6' }, c: 'invalid', orphan: 'red' }, ['a', 'b', 'c', 'd']))
    .toEqual({ a: { mode: 'manual', color: CABLE_COLORS.purple.value }, b: { mode: 'auto', color: '#f472b6' } });
  expect(readCableColors(undefined, ['a'])).toEqual({});
});

it('renders missing legacy colors using the existing rule without changing the saved document', () => {
  const net = new Network(), router = createDevice(net, 'router'), sw = createDevice(net, 'switch');
  const link = net.connect(router.id, sw.id), saved = Object.freeze({});
  const projected = resolvedCableAppearances(net, saved);
  expect(projected[link.id]).toEqual({ mode: 'auto', color: DEVICE_COLORS.switch });
  expect(saved).toEqual({}); expect(interfaceCableColor(link.a, projected)).toBe(DEVICE_COLORS.switch);
});

it('preserves saved manual gray and explicit automatic colors while filling only absent appearances', () => {
  const net = new Network(), router = createDevice(net, 'router');
  const links = Array.from({ length: 3 }, () => net.connect(router.id, createDevice(net, 'switch').id));
  const saved: CableAppearances = { [links[0].id]: { mode: 'manual', color: CABLE_COLORS.gray.value },
    [links[1].id]: { mode: 'auto', color: DEVICE_COLORS.switch } };
  const copy = structuredClone(saved), projected = resolvedCableAppearances(net, saved);
  expect(projected[links[0].id]).toEqual(saved[links[0].id]); expect(projected[links[1].id]).toEqual(saved[links[1].id]);
  expect(projected[links[2].id].color).not.toBe(DEVICE_COLORS.switch); expect(projected[links[2].id].color).not.toBe(CABLE_COLORS.gray.value);
  expect(saved).toEqual(copy); expect(resolvedCableAppearances(net, projected)).toBe(projected);
});

it('identifies a linked interface independently of UP/DOWN and returns neutral for disconnected or stale links', () => {
  const net = new Network(), a = createDevice(net, 'router'), b = createDevice(net, 'ap'); const link = net.connect(a.id, b.id);
  const colors = { [link.id]: automaticCableAppearance(net, link.id, {}) };
  expect(interfaceCableColor(link.a, colors)).toBe(DEVICE_COLORS.ap);
  link.b.up = false; expect(interfaceCableColor(link.a, colors)).toBe(DEVICE_COLORS.ap);
  net.disconnect(link.id); expect(interfaceCableColor(link.a, colors)).toBeUndefined();
  expect(interfaceCableColor(a.interfaces[2], colors)).toBeUndefined();
});
