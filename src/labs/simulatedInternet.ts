import type { SaveFile, SavedDevice } from '../engine/serialize';

const iface = (name: string, ip: string | null, gateway?: string) => ({ name, ip, up: true, ...(ip ? { ipv4Mode: 'static' as const } : {}), ...(gateway ? { gateway } : {}) });
const device = (id: string, kind: SavedDevice['kind'], x: number, y: number, extra: Partial<SavedDevice> = {}): SavedDevice => ({
  id, name: id, kind, x, y, forwarding: kind === 'router', ifaces: [], routes: [], ...extra,
});
const switchPorts = () => Array.from({ length: 8 }, (_, i) => iface(`eth${i}`, null));

/** Ready-to-open practice, with no assessment or invented traffic evidence. */
export const simulatedInternet: SaveFile = {
  app: 'netsim', version: 1,
  devices: [
    device('PC1', 'host', 80, 100, { ifaces: [iface('eth0', '192.168.10.10/24', '192.168.10.1')], nameserver: '198.51.100.53' }),
    device('PC2', 'host', 80, 420, { ifaces: [iface('eth0', '192.168.10.20/24', '192.168.10.1')], nameserver: '198.51.100.53' }),
    device('LAN Switch', 'switch', 320, 260, { ifaces: switchPorts() }),
    device('Router', 'router', 560, 260, {
      ifaces: [iface('eth0', '192.168.10.1/24'), iface('eth1', '192.0.2.2/30')],
      routes: [{ dest: '0.0.0.0/0', via: '192.0.2.1', dev: 'eth1' }],
      firewall: { tables: { filter: false, nat: true }, filter: {}, nat: { postrouting: { name: 'postrouting', rules: [{ match: { oif: 'eth1' }, action: { type: 'masquerade' } }] } } },
    }),
    device('Modem', 'modem', 800, 260, { ifaces: [iface('eth0', null), iface('eth1', null)] }),
    device('Provider', 'router', 1040, 260, { ifaces: [iface('eth0', '192.0.2.1/30'), iface('eth1', '198.51.100.1/24')] }),
    device('External Switch', 'switch', 1280, 260, { ifaces: switchPorts() }),
    device('DNS Server', 'server', 1520, 100, { ifaces: [iface('eth0', '198.51.100.53/24', '198.51.100.1')], dnsServer: { enabled: true, records: [['www.example.test', '198.51.100.10'], ['example.test', '198.51.100.10']] } }),
    device('Web Server', 'server', 1520, 420, { ifaces: [iface('eth0', '198.51.100.10/24', '198.51.100.1')], httpServer: { enabled: true, port: 80, body: '<h1>Internet simuliert · Simulated Internet · Internet simulada</h1><p>www.example.test — HTTP / DNS / NAT/PAT / Modem Bridge</p>' } }),
  ],
  links: [
    ['PC1', 'eth0', 'LAN Switch', 'eth0'], ['PC2', 'eth0', 'LAN Switch', 'eth1'],
    ['LAN Switch', 'eth2', 'Router', 'eth0'], ['Router', 'eth1', 'Modem', 'eth0'],
    ['Modem', 'eth1', 'Provider', 'eth0'], ['Provider', 'eth1', 'External Switch', 'eth0'],
    ['External Switch', 'eth1', 'DNS Server', 'eth0'], ['External Switch', 'eth2', 'Web Server', 'eth0'],
  ].map(([a, ai, b, bi], i) => ({ id: `internet-link-${i}`, a: [a, ai], b: [b, bi] })),
};
