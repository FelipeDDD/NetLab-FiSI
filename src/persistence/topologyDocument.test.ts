import { expect, it, vi } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { serializeNetwork } from '../engine/serialize';
import { DEFAULT_TERMINAL_APPEARANCE } from '../terminalAppearance';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { captureTopologyDocument, prepareTopologyDocument } from './topologyDocument';
import { sim } from '../sim';

it.each([...LABS, ...EXAMPLES.map(e => e.file)])('prepares built-in and legacy v1 documents without mutating the input or the live network (%#)', input => {
  const before = structuredClone(input), live = sim.net;
  const prepared = prepareTopologyDocument(input);
  expect(input).toEqual(before); expect(sim.net).toBe(live);
  expect(prepared.network).not.toBe(live);
  expect(prepared.network.devices.size).toBe(input.devices.length);
  expect(prepared.network.links.size).toBe(input.links.length);
  const captured = serializeNetwork(prepared.network, Object.fromEntries(input.devices.map(d => [d.id, { x: d.x, y: d.y }])));
  expect(serializeNetwork(prepareTopologyDocument(captured).network, Object.fromEntries(input.devices.map(d => [d.id, { x: d.x, y: d.y }])))).toEqual(captured);
});

it('owns nested Lab, firewall and presentation snapshots independently of subsequent edits', () => {
  const prepared = prepareTopologyDocument(LABS[0]);
  const state = {
    nodes: prepared.document.devices.map(d => ({ id: d.id, position: { x: d.x, y: d.y } })),
    terminalColors: {}, terminalAppearance: { ...DEFAULT_TERMINAL_APPEARANCE },
    cableColors: {}, terminalLayoutMode: 'free' as const, lab: structuredClone(LABS[0].lab!),
    labStep: 0, labResults: { check: { pass: true, detail: 'initial' } }, quizAnswers: { '0': 1 },
  };
  const captured = captureTopologyDocument(prepared.network, state), original = structuredClone(captured);
  state.lab.steps[0].title = 'changed'; state.labResults.check.detail = 'changed'; state.quizAnswers['0'] = 2;
  state.terminalAppearance.fontSize = 18; state.nodes[0].position.x += 200;
  prepared.network.devices.values().next().value!.name = 'changed';
  expect(captured).toEqual(original);
});

it('rejects invalid Lab metadata before any live network changes', () => {
  const live = sim.net, document = structuredClone(LABS[0]);
  (document.lab as unknown as { steps: unknown }).steps = null;
  expect(() => prepareTopologyDocument(document)).toThrow('Invalid Lab metadata'); expect(sim.net).toBe(live);
});

it('disposes a partially restored network when a later link fails', () => {
  const net = new Network(); const a = createDevice(net, 'host'), b = createDevice(net, 'host');
  net.connect(a.id, b.id); const data = serializeNetwork(net, {});
  data.links.push({ id: 'bad', a: [a.id, 'eth99'], b: [b.id, 'eth99'] });
  const dispose = vi.spyOn(a.constructor.prototype, 'dispose');
  try { expect(() => prepareTopologyDocument(data)).toThrow('Invalid link'); expect(dispose).toHaveBeenCalled(); }
  finally { dispose.mockRestore(); }
});

it('retains implicit legacy AP virtual ports but rejects a nonexistent physical AP endpoint', () => {
  const net = new Network(), host = createDevice(net, 'host'), ap = createDevice(net, 'ap');
  net.enableWireless(host.id); net.associate(host.id, ap.id);
  const data = serializeNetwork(net, {});
  data.devices.find(d => d.id === ap.id)!.ifaces = data.devices.find(d => d.id === ap.id)!.ifaces.filter(i => i.medium !== 'wireless');
  expect(prepareTopologyDocument(data).network.links.size).toBe(1);
  data.links[0].b[1] = 'eth999';
  expect(() => prepareTopologyDocument(data)).toThrow('Unknown wireless AP interface');
});
