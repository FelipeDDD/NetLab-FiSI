import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { makeCards, measureText } from './geometry';
import { printPreset } from './options';
import { reportTables } from './report';

it.each(['clean', 'technical', 'presentation'] as const)('%s: separates gateway addresses from both interface controls', preset => {
  const s = geometryFixture(), o = printPreset(preset, s), d = s.devices.find(d => d.id === 'D')!;
  expect(o.diagram.gatewayInterfaces).toBe(preset === 'technical');
  d.interfaces[0].gateway = '172.16.0.1'; d.interfaces[1].gateway = '172.16.0.1';
  d.interfaces[2].gateway = '172.16.0.9';
  d.routes = [{ destination: '0.0.0.0', prefix: 0, via: '172.16.0.1', iface: 'eth0', origin: 'interface' },
    { destination: '0.0.0.0', prefix: 0, via: '172.16.0.1', iface: 'eth1', origin: 'static' }];
  const original = structuredClone(s), tables = reportTables(s, o, 'en'); o.diagram.gateways = true;
  const card = () => makeCards(s, o, 'Gateway', measureText, 'Default').find(c => c.device.id === 'D')!;
  for (const interfaces of [false, true]) {
    o.diagram.interfaces = interfaces; o.diagram.gatewayInterfaces = false;
    expect(card().footer.join('')).not.toMatch(/eth[012]/);
    expect(card().footer.join('')).toContain('Gateway: 172.16.0.9');
    expect(card().footer.join('').match(/Default: 172\.16\.0\.1/g)).toHaveLength(2);
    o.diagram.gatewayInterfaces = true;
    expect(card().footer.join('')).toContain('Default: 172.16.0.1 (eth0)');
    expect(card().footer.join('')).toContain('Default: 172.16.0.1 (eth1)');
    expect(card().footer.join('')).toContain('Gateway: 172.16.0.9 (eth2)');
  }
  o.diagram.gateways = false; expect(card().footer).toEqual([]);
  expect(s).toEqual(original); expect(reportTables(s, o, 'en')).toEqual(tables);
});

it.each(['small', 'normal', 'large'] as const)('%s: measures separate text groups with clear icon, divider and card bounds', textSize => {
  for (const preset of ['clean', 'technical', 'presentation'] as const) for (const kind of ['host', 'switch', 'router'] as const)
    for (const count of [1, 2, 3, 4]) for (const technical of [false, true]) {
      const s = geometryFixture(), o = printPreset(preset, s), d = s.devices.find(d => d.id === 'D')!;
      d.kind = kind; d.name = 'Long device name / Distribution ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      d.interfaces = Array.from({ length: count }, (_, i) => ({ ...d.interfaces[0], name: `eth${i}`, gateway: `172.16.${i}.1` }));
      o.textSize = textSize; o.diagram.ipv4 = technical; o.diagram.interfaces = technical; o.diagram.gateways = technical;
      const c = makeCards(s, o, 'Gateway').find(c => c.device.id === 'D')!;
      let bottom = 48;
      for (const row of c.textRows) {
        expect(row.y - row.ascent).toBeGreaterThanOrEqual(bottom + 2.99);
        expect(row.y + row.descent).toBeLessThanOrEqual(c.height - 9.99);
        expect(measureText(row.text, row.size, row.role === 'name', ['gateway', 'interface'].includes(row.role))).toBeLessThanOrEqual(c.width - 23.99);
        bottom = row.y + row.descent;
      }
      if (c.footerY !== undefined) {
        const lastBody = c.textRows.filter(r => r.role !== 'gateway').at(-1);
        expect(c.footerY).toBeGreaterThan((lastBody ? lastBody.y + lastBody.descent : 48) + 7.99);
        expect(c.textRows.find(r => r.role === 'gateway')!.y - c.textRows.find(r => r.role === 'gateway')!.ascent).toBeGreaterThanOrEqual(c.footerY + 7.99);
      }
      if (kind === 'switch') expect(c.info).toEqual([]);
    }
});
