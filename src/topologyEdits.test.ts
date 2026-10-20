import { expect, it, vi } from 'vitest';
import { Network } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import { parseCidr, parseIp } from './engine/ip';
import { restoreNetwork, serializeNetwork } from './engine/serialize';
import { Shell } from './commands/shell';
import { applyLinkEdit, captureCreation, captureLink, restoreCreation, restoreDeletedDevices } from './topologyEdits';

it.each(['host', 'server', 'switch', 'router', 'firewall', 'ap'] as const)('restores a fresh %s with its exact identity and initial configuration, leaving survivors intact', (kind) => {
  const net = new Network(), survivor = createDevice(net, 'host'), device = createDevice(net, kind);
  const creation = captureCreation(net, device, { x: 13, y: 47 }, 1);
  const initial = structuredClone(creation);
  net.removeDevice(device.id);
  const restored = restoreCreation(net, creation);
  expect(restored).not.toBe(device);
  expect(device.disposed).toBe(true);
  expect(restored.disposed).toBe(false);
  expect(captureCreation(net, restored, { x: 13, y: 47 }, 1)).toEqual(initial);
  expect(net.devices.get(survivor.id)).toBe(survivor);
  expect(() => restoreCreation(net, creation)).toThrow('device ID already exists');
});

it.each(['duplicate ID', 'duplicate MAC', 'bad configuration', 'missing port', 'busy port', 'duplicate link', 'existing link ID'])(
  'rejects an entire deletion restoration before touching the live network: %s', (conflict) => {
    const net = new Network(), a = createDevice(net, 'host'), b = createDevice(net, 'router'), survivor = createDevice(net, 'switch');
    const links = [net.connect(a.id, b.id), net.connect(b.id, survivor.id)].map(captureLink);
    const devices = [a, b].map((d, index) => captureCreation(net, d, { x: index * 100, y: 40 }, index));
    net.removeDevice(a.id); net.removeDevice(b.id);
    switch (conflict) {
      case 'duplicate ID': devices[1].saved.id = devices[0].saved.id; break;
      case 'duplicate MAC': devices[1].macs.eth0 = survivor.interfaces[0].mac; break;
      case 'bad configuration': devices[1].saved.ifaces[0].ip = 'invalid'; break;
      case 'missing port': links[1].b[1] = 'eth99'; break;
      case 'busy port': {
        const other = createDevice(net, 'host'); net.connect(survivor.id, other.id, { aIface: links[1].b[1] }); break;
      }
      case 'duplicate link': links.push(structuredClone(links[0])); break;
      case 'existing link ID': {
        const other = createDevice(net, 'host'); net.connect(survivor.id, other.id, { id: links[0].id, aIface: 'eth7' }); break;
      }
    }
    const before = serializeNetwork(net, {}), identities = [...net.devices.values()], pending = net.scheduler.pending;
    expect(restoreDeletedDevices(net, devices, links)).toBe(false);
    expect(serializeNetwork(net, {})).toEqual(before);
    expect([...net.devices.values()]).toEqual(identities);
    expect(net.devices.get(survivor.id)).toBe(survivor); expect(net.scheduler.pending).toBe(pending);
  },
);

it('keeps saved MACs and link latencies across reloads, allocates unique new MACs and accepts legacy files', () => {
  const net = new Network(), deleted = createDevice(net, 'switch'), survivor = createDevice(net, 'host');
  const link = net.connect(deleted.id, survivor.id); link.latency = 175;
  const snapshot = captureCreation(net, deleted, { x: 80, y: 90 }, 0), cable = captureLink(link);
  net.removeDevice(deleted.id);
  expect(restoreDeletedDevices(net, [snapshot], [cable])).toBe(true);
  const saved = serializeNetwork(net, { [deleted.id]: { x: 80, y: 90 } }), reloaded = restoreNetwork(saved);
  expect(serializeNetwork(reloaded, { [deleted.id]: { x: 80, y: 90 } })).toEqual(saved);
  createDevice(reloaded, 'switch'); // Restored MACs need not follow map order.
  const macs = [...reloaded.devices.values()].flatMap((d) => d.interfaces.map((i) => i.mac));
  expect(new Set(macs).size).toBe(macs.length);
  for (const device of saved.devices) for (const iface of device.ifaces) delete iface.mac;
  for (const link of saved.links) delete link.latency;
  const legacy = restoreNetwork(saved);
  expect(legacy.links.get(cable.id)?.latency).toBe(80);
  expect(legacy.devices.size).toBe(2);
});

it('restores the original ports and link IDs, rejects collisions atomically and never falls back to another port', () => {
  const net = new Network(), a = createDevice(net, 'switch'), b = createDevice(net, 'router'), c = createDevice(net, 'host');
  const link = net.connect(a.id, b.id, { aIface: 'eth4', bIface: 'eth2' }); link.latency = 123;
  const saved = captureLink(link);
  expect(applyLinkEdit(net, [saved], false)).toBe(true);
  expect(applyLinkEdit(net, [saved], true)).toBe(true);
  expect(captureLink(net.links.get(saved.id)!)).toEqual(saved);
  expect(applyLinkEdit(net, [saved], true)).toBe(false);
  expect(() => net.connect(a.id, c.id, { id: saved.id })).toThrow('link ID already exists');
  expect(net.links.size).toBe(1);
  net.disconnect(saved.id);
  const blocker = net.connect(a.id, c.id, { aIface: 'eth4' });
  const spare = { ...saved, id: 'spare', a: [a.id, 'eth3'] as [string, string], b: [b.id, 'eth1'] as [string, string] };
  expect(applyLinkEdit(net, [spare, saved], true)).toBe(false);
  expect([...net.links.keys()]).toEqual([blocker.id]);
  net.disconnect(blocker.id);
  expect(applyLinkEdit(net, [saved, { ...saved, id: 'duplicate-port' }], true)).toBe(false);
  expect(net.links.size).toBe(0);
  expect(applyLinkEdit(net, [saved], true)).toBe(true);
  expect(applyLinkEdit(net, [saved, { ...spare, id: 'missing' }], false)).toBe(false);
  expect(net.links.size).toBe(1);
});

it('discards frames already in flight when a link is removed and recreated with the same ID', () => {
  const net = new Network(), a = createDevice(net, 'host') as IpDevice, b = createDevice(net, 'host') as IpDevice;
  a.interfaces[0].ip = parseCidr('10.0.0.1/24'); b.interfaces[0].ip = parseCidr('10.0.0.2/24');
  const link = net.connect(a.id, b.id), saved = captureLink(link);
  const receive = vi.spyOn(b, 'receiveFrame');
  a.sendEcho(parseIp('10.0.0.2')!, 1, 1);
  expect(net.scheduler.pending).toBeGreaterThan(0);
  net.disconnect(link.id);
  expect(applyLinkEdit(net, [saved], true)).toBe(true);
  net.scheduler.advanceTo(100); // The original ARP frame would have arrived at 80ms.
  expect(receive).not.toHaveBeenCalled();
  net.scheduler.advanceTo(1000); // A later ARP retry is allowed on the restored cable.
  expect(receive).toHaveBeenCalled();
  link.transmit(link.a, {} as never); // Stale references cannot emit new traffic.
});

it('disposes RIP, ARP, DNS, command timers and callbacks only for the removed device', () => {
  const net = new Network(), removed = createDevice(net, 'router') as IpDevice, survivor = createDevice(net, 'host') as IpDevice;
  removed.interfaces[0].ip = parseCidr('10.0.0.1/24');
  survivor.interfaces[0].ip = parseCidr('10.0.0.2/24');
  net.connect(removed.id, survivor.id);
  removed.enableRip(true);
  const dns = vi.fn(), stale = vi.fn(), live = vi.fn();
  removed.resolveDns('example.test', parseIp('10.0.0.99')!, dns);
  const shell = new Shell(removed), write = vi.fn(), done = vi.fn();
  shell.exec('ping 10.0.0.99', { write }, done);
  const event = removed.schedule(5000, stale);
  survivor.schedule(6000, live);
  expect(net.scheduler.pending).toBeGreaterThan(1);
  net.removeDevice(removed.id);
  expect(net.scheduler.pending).toBe(1);
  const count = write.mock.calls.length;
  event.fn();
  net.scheduler.advanceTo(120_000);
  expect(stale).not.toHaveBeenCalled(); expect(dns).not.toHaveBeenCalled();
  expect(write).toHaveBeenCalledTimes(count); expect(done).not.toHaveBeenCalled();
  expect(live).toHaveBeenCalledOnce(); expect(net.scheduler.pending).toBe(0);
  expect(removed.ripEnabled).toBe(false);
  expect(serializeNetwork(net, {}).devices.map((d) => d.id)).toEqual([survivor.id]);
});

it.each(['traceroute 10.0.0.99', 'dhclient eth0'])('cancels pending %s events when removing a device, including same-ID recreation', (command) => {
  const net = new Network(), device = createDevice(net, 'host') as IpDevice;
  const peer = createDevice(net, 'host'); net.connect(device.id, peer.id);
  device.interfaces[0].ip = parseCidr('10.0.0.1/24');
  const creation = captureCreation(net, device, { x: 0, y: 0 }, 0);
  const write = vi.fn(), done = vi.fn();
  new Shell(device).exec(command, { write }, done);
  expect(net.scheduler.pending).toBeGreaterThan(0);
  expect(done).not.toHaveBeenCalled();
  net.removeDevice(device.id);
  const restored = restoreCreation(net, creation) as IpDevice, count = write.mock.calls.length;
  net.scheduler.advanceTo(60_000);
  expect(net.scheduler.pending).toBe(0);
  expect(write).toHaveBeenCalledTimes(count); expect(done).not.toHaveBeenCalled();
  expect(restored.dhcpListeners.size).toBe(0); expect(device.dhcpListeners.size).toBe(0);
});
