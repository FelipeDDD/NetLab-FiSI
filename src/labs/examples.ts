// Example networks — not labs, just loadable starting points: one showing
// good practice (segmented, stateful firewall, DMZ) and one showing what not
// to do (flat, everything exposed). Useful for critique exercises and as
// bases for building your own scenarios.
import type { SaveFile, SavedDevice, SavedLink } from '../engine/serialize';
import type { DeviceKind } from '../engine/device';

function dev(
  kind: DeviceKind,
  name: string,
  x: number,
  y: number,
  extra: Partial<SavedDevice> = {},
): SavedDevice {
  return {
    id: name,
    kind,
    name,
    x,
    y,
    forwarding: kind === 'router' || kind === 'firewall',
    ifaces: [],
    routes: [],
    ...extra,
  };
}

function link(a: string, ai: string, b: string, bi: string): SavedLink {
  return { id: `${a}.${ai}-${b}.${bi}`, a: [a, ai], b: [b, bi] };
}

// A segmented small-office network done properly: LAN and DMZ behind a
// stateful firewall, masquerade towards the internet, only tcp/80 published
// inbound (DNAT to the DMZ web server). Look at fw1's ruleset and log.
export const goodNetwork: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 60, 120, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      nameserver: '10.10.10.80',
    }),
    dev('host', 'pc2', 60, 320, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.11/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      nameserver: '10.10.10.80',
    }),
    dev('switch', 'sw1', 280, 220),
    dev('firewall', 'fw1', 500, 220, {
      ifaces: [
        { name: 'eth0', ip: '192.168.1.1/24', up: true },
        { name: 'eth1', ip: '203.0.113.1/24', up: true },
        { name: 'eth2', ip: '10.10.10.1/24', up: true },
      ],
      firewall: {
        tables: { filter: true, nat: true },
        filter: {
          input: { name: 'input', policy: 'accept', rules: [] },
          forward: {
            name: 'forward',
            policy: 'drop',
            rules: [
              { match: { ct: ['established', 'related'] }, verdict: 'accept' },
              { match: { src: '192.168.1.0/24', ct: ['new'] }, verdict: 'accept' },
              {
                match: { dst: '10.10.10.80/32', proto: 'tcp', dport: [80, 80], ct: ['new'] },
                verdict: 'accept',
              },
            ],
          },
          output: { name: 'output', policy: 'accept', rules: [] },
        },
        nat: {
          prerouting: {
            name: 'prerouting',
            rules: [
              {
                match: { iif: 'eth1', proto: 'tcp', dport: [80, 80] },
                action: { type: 'dnat', addr: '10.10.10.80' },
              },
            ],
          },
          postrouting: {
            name: 'postrouting',
            rules: [{ match: { oif: 'eth1' }, action: { type: 'masquerade' } }],
          },
        },
      },
    }),
    dev('server', 'srv1', 720, 340, {
      ifaces: [{ name: 'eth0', ip: '10.10.10.80/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '10.10.10.1', dev: 'eth0' }],
      dnsServer: { enabled: true, records: [['web.corp', '10.10.10.80']] },
      httpServer: { enabled: true, port: 80, body: '<h1>Corporate web — served from the DMZ</h1>' },
    }),
    dev('host', 'inet1', 720, 100, {
      ifaces: [{ name: 'eth0', ip: '203.0.113.66/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '203.0.113.1', dev: 'eth0' }],
    }),
  ],
  links: [
    link('pc1', 'eth0', 'sw1', 'eth0'),
    link('pc2', 'eth0', 'sw1', 'eth1'),
    link('sw1', 'eth2', 'fw1', 'eth0'),
    link('fw1', 'eth1', 'inet1', 'eth0'),
    link('fw1', 'eth2', 'srv1', 'eth0'),
  ],
};

// The same office done badly: one flat segment, server beside the clients,
// telnet and ssh open, a router with no rules at all. The internet can reach
// everything. Load it and start counting the problems.
export const badNetwork: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 60, 120, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
    }),
    dev('host', 'pc2', 60, 320, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.11/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
    }),
    dev('server', 'srv1', 280, 400, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.20/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      services: { tcp: [22, 23], udp: [] },
      httpServer: { enabled: true, port: 80, body: '<h1>intranet — also visible to the whole internet</h1>' },
    }),
    dev('switch', 'sw1', 280, 220),
    dev('router', 'r1', 500, 220, {
      ifaces: [
        { name: 'eth0', ip: '192.168.1.1/24', up: true },
        { name: 'eth1', ip: '203.0.113.1/24', up: true },
      ],
    }),
    dev('host', 'inet1', 720, 220, {
      ifaces: [{ name: 'eth0', ip: '203.0.113.66/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '203.0.113.1', dev: 'eth0' }],
    }),
  ],
  links: [
    link('pc1', 'eth0', 'sw1', 'eth0'),
    link('pc2', 'eth0', 'sw1', 'eth1'),
    link('srv1', 'eth0', 'sw1', 'eth2'),
    link('sw1', 'eth3', 'r1', 'eth0'),
    link('r1', 'eth1', 'inet1', 'eth0'),
  ],
};

export const EXAMPLES: { title: string; blurb: string; file: SaveFile }[] = [
  {
    title: 'Example — segmented network (good practice)',
    blurb: 'LAN + DMZ behind a stateful firewall, masquerade out, only tcp/80 published in.',
    file: goodNetwork,
  },
  {
    title: 'Example — flat open network (what not to do)',
    blurb: 'Everything on one segment, no rules, telnet to the world. Count the problems.',
    file: badNetwork,
  },
];
