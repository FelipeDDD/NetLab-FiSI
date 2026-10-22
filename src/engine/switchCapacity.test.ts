import { expect, it } from 'vitest';
import { Network } from './network';
import { createDevice } from './factory';
import { SwitchDevice } from './switch';
import { Host, type IcmpEvent } from './ipdevice';
import { parseCidr, parseIp } from './ip';
import { restoreNetwork, serializeNetwork } from './serialize';
import { applyAccessVlan, applyInspectorEdit, captureCreation, restoreDeletedDevices } from '../topologyEdits';
import type { InspectorOperation } from '../topologyHistory';

const setup = () => { const net = new Network(); return { net, sw: createDevice(net, 'switch') as SwitchDevice }; };
const ping = (net: Network, host: Host, destination: string) => {
  const events: IcmpEvent[] = [], id = host.allocIcmpId();
  host.onIcmp(id, e => events.push(e)); host.sendEcho(parseIp(destination)!, id, 1);
  net.scheduler.advanceTo(net.now + 15000); host.offIcmp(id);
  return events.some(e => e.type === 'reply');
};

it('adds and removes only the last real interface, preserving survivors and enforcing limits', () => {
  const { net, sw } = setup(), existing = [...sw.interfaces];
  const macs = existing.map(i => i.mac);
  sw.vlans.set('eth0', 42);
  const host = createDevice(net, 'host'); const link = net.connect(sw.id, host.id);
  expect(sw.addPort().name).toBe('eth8');
  expect(new Set([...net.devices.values()].flatMap(d => d.interfaces.map(i => i.mac))).size).toBe(10);
  sw.removeLastPort(); sw.removeLastPort(); expect(sw.interfaces).toHaveLength(7);
  sw.interfaces.forEach((p, index) => { expect(p).toBe(existing[index]); expect(p.mac).toBe(macs[index]); });
  expect(sw.interfaces[0].link).toBe(link); expect(sw.vlanOf('eth0')).toBe(42);
  while (sw.interfaces.length < 24) sw.addPort();
  expect(() => sw.addPort()).toThrow('24');
  while (sw.interfaces.length > 1) sw.removeLastPort();
  expect(() => sw.removeLastPort()).toThrow('Mindestens');
  const ap = createDevice(net, 'ap') as SwitchDevice;
  expect(() => ap.addPort()).toThrow(); expect(ap.interfaces).toHaveLength(8);
});

it('blocks cable, VLAN, administrative state, imported IP settings and learned MAC dependencies', () => {
  const { net, sw } = setup(), last = sw.interfaces[7], host = createDevice(net, 'host');
  const link = net.connect(sw.id, host.id, { aIface: last.name });
  expect(() => sw.removeLastPort()).toThrow('Kabel'); net.disconnect(link.id);
  sw.vlans.set(last.name, 20); expect(() => sw.removeLastPort()).toThrow('VLAN'); sw.vlans.clear();
  last.up = false; expect(() => sw.removeLastPort()).toThrow('UP'); last.up = true;
  last.ip = parseCidr('192.0.2.1/24'); expect(() => sw.removeLastPort()).toThrow('IP'); last.ip = null;
  last.dns = 1; expect(() => sw.removeLastPort()).toThrow('IP'); last.dns = null;
  sw.macTable.set('1|aa:bb:cc:dd:ee:ff', last); expect(() => sw.removeLastPort()).toThrow('MAC');
  expect(sw.interfaces[7]).toBe(last); expect(sw.macTable.size).toBe(1);
});

it('forwards real traffic on eth8, learns its MAC and respects access VLAN isolation', () => {
  const { net, sw } = setup(), port = sw.addPort();
  const a = createDevice(net, 'host') as Host, b = createDevice(net, 'host') as Host;
  a.interfaces[0].ip = parseCidr('192.0.2.1/24'); b.interfaces[0].ip = parseCidr('192.0.2.2/24');
  net.connect(a.id, sw.id, { bIface: 'eth0' }); net.connect(b.id, sw.id, { bIface: port.name });
  expect(ping(net, a, '192.0.2.2')).toBe(true);
  expect(sw.macTable.get(`1|${b.interfaces[0].mac}`)).toBe(port);
  applyAccessVlan(sw, port.name, 20); expect(ping(net, a, '192.0.2.2')).toBe(false);
  applyAccessVlan(sw, 'eth0', 20); expect(ping(net, a, '192.0.2.2')).toBe(true);
  expect(sw.macTable.get(`20|${b.interfaces[0].mac}`)).toBe(port);
});

it.each([1, 7, 8, 9, 24])('round-trips %i ports before restoring configuration and links', count => {
  const { net, sw } = setup();
  while (sw.interfaces.length < count) sw.addPort();
  while (sw.interfaces.length > count) sw.removeLastPort();
  const last = sw.interfaces.at(-1)!; sw.vlans.set(last.name, 20); last.up = false;
  const host = createDevice(net, 'host'); net.connect(sw.id, host.id, { aIface: last.name });
  const saved = serializeNetwork(net, {}), restored = restoreNetwork(JSON.parse(JSON.stringify(saved)));
  expect(serializeNetwork(restored, {})).toEqual(saved);
  expect(restored.devices.get(sw.id)!.interfaces).toHaveLength(count);
  expect(restored.devices.get(sw.id)!.getInterface(last.name)!.link).toBeTruthy();
  const copy = restored.devices.get(sw.id) as SwitchDevice;
  if (count < 24) {
    const added = copy.addPort();
    expect([...restored.devices.values()].flatMap(d => d.interfaces).filter(i => i.mac === added.mac)).toHaveLength(1);
  }
});

it('accepts legacy eight-port saves without MAC fields', () => {
  const { net, sw } = setup(), saved = serializeNetwork(net, {});
  saved.devices[0].ifaces.forEach(i => delete i.mac);
  const restored = restoreNetwork(saved);
  expect(restored.devices.get(sw.id)!.interfaces).toHaveLength(8);
});

it.each([1, -1] as const)('replays capacity delta %i with the original MAC and without replacing survivors', delta => {
  const { net, sw } = setup(), survivor = sw.interfaces[0];
  const port = delta === 1 ? sw.addPort() : sw.removeLastPort();
  const op: InspectorOperation = { type: 'resize-switch', label: 'Resize', deviceId: sw.id, before: 8, after: 8 + delta, port: { name: port.name, mac: port.mac } };
  expect(applyInspectorEdit(net, op, 'undo')).toBe(true); expect(sw.interfaces).toHaveLength(8);
  expect(applyInspectorEdit(net, op, 'redo')).toBe(true); expect(sw.interfaces).toHaveLength(8 + delta);
  expect(sw.interfaces[0]).toBe(survivor);
  if (delta === 1) {
    expect(sw.interfaces[8].mac).toBe(port.mac);
    net.connect(sw.id, createDevice(net, 'host').id, { aIface: port.name });
    expect(applyInspectorEdit(net, op, 'undo')).toBe(false);
    expect(sw.interfaces).toHaveLength(9);
  }
});

it('restores deleted custom switches without changing their interface identities', () => {
  const { net, sw } = setup(); sw.addPort();
  const snapshot = captureCreation(net, sw, { x: 0, y: 0 }, 0);
  net.removeDevice(sw.id);
  expect(restoreDeletedDevices(net, [snapshot], [])).toBe(true);
  expect(net.devices.get(sw.id)!.interfaces.map(i => [i.name, i.mac])).toEqual(Object.entries(snapshot.macs));
});
