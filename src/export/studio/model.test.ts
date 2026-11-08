import { describe, expect, it } from 'vitest';
import { studioFixture } from './studio.fixture';
import { serializeNetwork } from '../../engine/serialize';
import { capturePrintSnapshot } from './model';
import { pageSize, printPreset, reconcilePrintOptions } from './options';
import { ipToString } from '../../engine/ip';

describe('isolated print data and presets', () => {
  it('owns all data and documents exact interface, default and static routes without engine actions', () => {
    const { net, r1, visual } = studioFixture(), before = JSON.stringify(serializeNetwork(net, {})), now = net.now;
    const snap = capturePrintSnapshot(net, visual, 'fixed');
    expect(JSON.stringify(serializeNetwork(net, {}))).toBe(before); expect(net.now).toBe(now);
    const d = snap.devices.find(d => d.id === r1.id)!;
    expect(d.routes).toContainEqual({ destination: '192.168.20.0', prefix: 24, via: '10.0.12.2', iface: 'eth1', origin: 'static' });
    expect(d.routes).toContainEqual({ destination: '0.0.0.0', prefix: 0, via: '192.168.10.254', iface: 'eth0', origin: 'interface' });
    expect(d.interfaces[2].address).toBeNull();
    expect(d.routes.map(r => [r.destination, r.prefix, r.via, r.iface])).toEqual(r1.routes().map(r => [ipToString(r.dest), r.prefix, r.via === null ? null : ipToString(r.via), r.ifaceName]));
    r1.name = 'changed'; r1.getInterface('eth0')!.ip = null; visual.nodes[0].position.x = 999;
    expect(d.name).toContain('Universität'); expect(d.interfaces[0].address).toBe('192.168.10.1'); expect(snap.devices[0].x).toBe(0);
  });
  it('presets are independent and refreshing never selects new IDs or retains missing IDs', () => {
    const { net, visual } = studioFixture(), snap = capturePrintSnapshot(net, visual);
    const clean = printPreset('clean', snap), tech = printPreset('technical', snap);
    expect(clean.sections.routes.enabled).toBe(false); expect(tech.sections.routes.deviceIds).toEqual(['studio-2', 'studio-3', 'studio-4', 'studio-8']);
    clean.names['studio-2'] = 'Alias'; clean.diagram.deviceIds = ['studio-2'];
    const next = { ...snap, devices: snap.devices.filter(d => d.id !== 'studio-2') };
    expect(reconcilePrintOptions(clean, next).names).toEqual({}); expect(reconcilePrintOptions(clean, next).diagram.deviceIds).toEqual([]);
    expect(tech.names).toEqual({}); expect(pageSize(clean)).toEqual({ width: 297, height: 210 });
    expect(pageSize({ paper: 'A3', orientation: 'portrait', margin: 20 })).toEqual({ width: 297, height: 420 });
  });
});
