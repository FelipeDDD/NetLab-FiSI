import type { ProjectDocument } from '../../projects/types';
import { geometryFixture } from './geometry.fixture';

/** Real project documents, opened only in the disposable browser review. */
export function blocksFixture(scene: 'simple' | 'four' | 'dense' = 'four'): ProjectDocument {
  const snap = geometryFixture(), simple = scene === 'simple';
  const chosen = simple ? ['A', 'PC-A', 'PC-B'] : snap.devices.map(d => d.id);
  const devices = snap.devices.filter(d => chosen.includes(d.id)).map(d => {
    const index = d.id.endsWith('B') ? 2 : d.id.endsWith('C') ? 3 : 1;
    const count = d.kind === 'switch' ? 8 : d.kind === 'router' ? 4 : 1;
    const ifaces = Array.from({ length: count }, (_, i) => {
      let ip: string | null = null, gateway: string | null = null;
      if (d.kind === 'host') { ip = `192.168.${index * 10}.10/24`; gateway = `192.168.${index * 10}.1`; }
      if (d.id === 'D' && i < 3) ip = `10.0.${i + 1}.2/30`;
      else if (d.kind === 'router' && d.id !== 'D' && i < 2) ip = i ? `10.0.${index}.1/30` : `192.168.${index * 10}.1/24`;
      if (simple && d.id === 'A' && i === 1) ip = '192.168.20.1/24';
      return { name: `eth${i}`, up: true, ip, gateway, ipv4Mode: ip ? 'static' as const : 'unconfigured' as const };
    });
    const routes = d.id === 'D' ? [1, 2, 3].map(i => ({ dest: `192.168.${i * 10}.0/24`, via: `10.0.${i}.1`, dev: `eth${i - 1}` }))
      : d.kind === 'router' && !simple ? [{ dest: '0.0.0.0/0', via: `10.0.${index}.2`, dev: 'eth1' }] : [];
    if (simple && d.id === 'A') routes.push({ dest: '172.16.0.0/16', via: '192.168.20.254', dev: 'eth1' });
    return { id: d.id, kind: d.kind, name: scene === 'dense' && d.kind === 'router' ? `${d.name} — Distribution Universität Gebäude Nord / Infrastructure` : d.name,
      x: simple ? d.id === 'A' ? 260 : 0 : d.x, y: simple ? d.id === 'PC-A' ? 0 : d.id === 'PC-B' ? 320 : 160 : d.y,
      forwarding: d.kind === 'router', ifaces, routes };
  });
  const links = simple ? [{ id: 'a-host', a: ['A', 'eth0'] as [string, string], b: ['PC-A', 'eth0'] as [string, string] }, { id: 'b-host', a: ['A', 'eth1'] as [string, string], b: ['PC-B', 'eth0'] as [string, string] }]
    : snap.links.map(l => ({ id: l.id, a: l.a, b: l.b }));
  return { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices, links } };
}
