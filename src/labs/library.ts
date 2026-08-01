// Bundled labs, following the classic iNetwork Simulator lab sequence:
// addressing → routing → firewalls → services. Each is a complete SaveFile
// (starting topology) plus the lab definition. Contribute more by PR.
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

const lab1: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 80, 140),
    dev('host', 'pc2', 80, 320),
    dev('switch', 'sw1', 330, 230),
  ],
  links: [link('pc1', 'eth0', 'sw1', 'eth0'), link('pc2', 'eth0', 'sw1', 'eth1')],
  lab: {
    id: 'static-addressing',
    title: 'Lab 1 — Static addressing & ARP',
    blurb: 'Give two hosts addresses, make them talk, and watch ARP do its work.',
    steps: [
      {
        title: 'Assign addresses',
        body:
          'pc1 and pc2 share a switch but have no IP addresses yet. ' +
          'Open each terminal (double-click the device) and assign one address per host from 192.168.1.0/24, e.g. ' +
          '`ip addr add 192.168.1.10/24 dev eth0` on pc1 and `.20` on pc2. ' +
          'Check your work with `ip addr`.',
        objectives: [
          {
            id: 'l1-ip1',
            label: 'pc1 has an address in 192.168.1.0/24',
            check: { type: 'iface-ip', device: 'pc1', iface: 'eth0', inSubnet: '192.168.1.0/24' },
          },
          {
            id: 'l1-ip2',
            label: 'pc2 has an address in 192.168.1.0/24',
            check: { type: 'iface-ip', device: 'pc2', iface: 'eth0', inSubnet: '192.168.1.0/24' },
          },
        ],
      },
      {
        title: 'Reachability & ARP',
        body:
          'From pc1, `ping -c 3 <pc2 address>`. The first reply is slower than the rest — ' +
          'watch the amber packets: that is ARP resolving the MAC address before ICMP can travel. ' +
          'Inspect the result with `ip neigh` and the switch’s MAC table (click sw1).',
        objectives: [
          {
            id: 'l1-ping',
            label: 'pc1 can ping pc2',
            check: { type: 'ping', from: 'pc1', toDevice: 'pc2', expect: 'success' },
          },
          {
            id: 'l1-ping2',
            label: 'pc2 can ping pc1',
            check: { type: 'ping', from: 'pc2', toDevice: 'pc1', expect: 'success' },
          },
        ],
        quiz: [
          {
            q: 'Which protocol discovers the MAC address that belongs to an IP address?',
            options: ['DHCP', 'ARP', 'DNS', 'ICMP'],
            answer: 1,
          },
          {
            q: 'Why was the first ping slower than the others?',
            options: [
              'The switch was still booting',
              'ARP resolution had to happen before the first ICMP packet could be delivered',
              'The first packet is always sent twice',
              'DNS lookup delayed it',
            ],
            answer: 1,
          },
        ],
      },
    ],
  },
};

const lab2: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 70, 220, { ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }] }),
    dev('router', 'r1', 330, 220),
    dev('host', 'pc2', 590, 220, { ifaces: [{ name: 'eth0', ip: '10.0.0.20/24', up: true }] }),
  ],
  links: [link('pc1', 'eth0', 'r1', 'eth0'), link('r1', 'eth1', 'pc2', 'eth0')],
  lab: {
    id: 'static-routing',
    title: 'Lab 2 — Routing between networks',
    blurb: 'Two subnets, one router: configure the gateway and the routes that cross it.',
    steps: [
      {
        title: 'Configure the router',
        body:
          'pc1 (192.168.1.10/24) and pc2 (10.0.0.20/24) live in different networks, joined by r1. ' +
          'Give r1 an address on each side: `ip addr add 192.168.1.1/24 dev eth0` and ' +
          '`ip addr add 10.0.0.1/24 dev eth1`. Confirm with `ip addr` and try `ping 192.168.1.1` from pc1.',
        objectives: [
          {
            id: 'l2-r-eth0',
            label: 'r1 eth0 has an address in 192.168.1.0/24',
            check: { type: 'iface-ip', device: 'r1', iface: 'eth0', inSubnet: '192.168.1.0/24' },
          },
          {
            id: 'l2-r-eth1',
            label: 'r1 eth1 has an address in 10.0.0.0/24',
            check: { type: 'iface-ip', device: 'r1', iface: 'eth1', inSubnet: '10.0.0.0/24' },
          },
        ],
      },
      {
        title: 'Default routes',
        body:
          'The hosts still don’t know where "everywhere else" is. On each host add a default route ' +
          'via its side of the router: `ip route add default via 192.168.1.1` (pc1) and ' +
          '`ip route add default via 10.0.0.1` (pc2). Then `ping` across and run ' +
          '`traceroute <pc2 address>` — note the router hop, and that replies come back with ttl=63.',
        objectives: [
          {
            id: 'l2-def1',
            label: 'pc1 has a default route via 192.168.1.1',
            check: { type: 'default-route', device: 'pc1', via: '192.168.1.1' },
          },
          {
            id: 'l2-def2',
            label: 'pc2 has a default route via 10.0.0.1',
            check: { type: 'default-route', device: 'pc2', via: '10.0.0.1' },
          },
          {
            id: 'l2-ping',
            label: 'pc1 can reach pc2 across the router',
            check: { type: 'ping', from: 'pc1', toDevice: 'pc2', expect: 'success' },
          },
        ],
        quiz: [
          {
            q: 'What does a router do to the TTL field of every packet it forwards?',
            options: [
              'Nothing — TTL only changes at the destination',
              'Sets it back to 64',
              'Decrements it by 1, discarding the packet (and sending ICMP time-exceeded) at 0',
              'Doubles it',
            ],
            answer: 2,
          },
        ],
      },
    ],
  },
};

const lab3: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 70, 220, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
    }),
    dev('firewall', 'fw1', 330, 220, {
      ifaces: [
        { name: 'eth0', ip: '192.168.1.1/24', up: true },
        { name: 'eth1', ip: '203.0.113.1/24', up: true },
      ],
    }),
    dev('server', 'srv1', 590, 220, {
      ifaces: [{ name: 'eth0', ip: '203.0.113.80/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '203.0.113.1', dev: 'eth0' }],
      services: { tcp: [22], udp: [] },
      httpServer: { enabled: true, port: 80, body: '<h1>public web server</h1>' },
    }),
  ],
  links: [link('pc1', 'eth0', 'fw1', 'eth0'), link('fw1', 'eth1', 'srv1', 'eth0')],
  lab: {
    id: 'stateful-firewall',
    title: 'Lab 3 — Build a stateful firewall',
    blurb: 'Default-deny the WAN, keep the LAN working — the classic conntrack ruleset.',
    steps: [
      {
        title: 'Look around (everything is open)',
        body:
          'pc1 is your LAN machine; srv1 plays "the internet" (it runs a web server and sshd). ' +
          'Right now fw1 forwards everything: from pc1 try `ping 203.0.113.80`, ' +
          '`curl http://203.0.113.80/` and `nc -z 203.0.113.80 22`. ' +
          'Now the uncomfortable part: from srv1, `ping 192.168.1.10` also works. The internet can reach your LAN.',
        objectives: [
          {
            id: 'l3-web',
            label: 'pc1 can fetch the web page (tcp/80 open)',
            check: { type: 'tcp', from: 'pc1', toDevice: 'srv1', port: 80, expect: 'open' },
          },
          {
            id: 'l3-open',
            label: 'srv1 can (for now) ping pc1 — verify the problem exists',
            check: { type: 'ping', from: 'srv1', toDevice: 'pc1', expect: 'success' },
          },
        ],
      },
      {
        title: 'Default deny',
        body:
          'On fw1 flip the FORWARD chain to default-deny: `iptables -P FORWARD DROP` ' +
          '(or `nft` — check `nft list ruleset` to see both dialects agree). ' +
          'Test again from pc1: everything is dead, and the firewall log in the inspector names the policy that killed each packet.',
        objectives: [
          {
            id: 'l3-policy',
            label: 'fw1 FORWARD policy is drop',
            check: { type: 'fw-policy', device: 'fw1', hook: 'forward', policy: 'drop' },
          },
          {
            id: 'l3-dead',
            label: 'nothing crosses: pc1 can no longer ping srv1',
            check: { type: 'ping', from: 'pc1', toDevice: 'srv1', expect: 'fail' },
          },
        ],
      },
      {
        title: 'Allow outbound, keep state',
        body:
          'Now allow exactly two things on fw1: reply traffic, and new connections from the LAN:\n' +
          '`iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`\n' +
          '`iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT`\n' +
          'pc1 gets the whole internet back; the internet gets nothing. Verify with `conntrack -L` on fw1.',
        objectives: [
          {
            id: 'l3-out',
            label: 'pc1 can ping srv1 again',
            check: { type: 'ping', from: 'pc1', toDevice: 'srv1', expect: 'success' },
          },
          {
            id: 'l3-web2',
            label: 'pc1 can still reach the web server',
            check: { type: 'tcp', from: 'pc1', toDevice: 'srv1', port: 80, expect: 'open' },
          },
          {
            id: 'l3-blocked',
            label: 'srv1 can no longer ping pc1',
            check: { type: 'ping', from: 'srv1', toDevice: 'pc1', expect: 'fail' },
          },
          {
            id: 'l3-filtered',
            label: 'inbound connections from srv1 are silently filtered',
            check: { type: 'tcp', from: 'srv1', toDevice: 'pc1', port: 22, expect: 'filtered' },
          },
        ],
        quiz: [
          {
            q: 'pc1 pings srv1 and the reply gets back through a default-deny FORWARD chain. Why?',
            options: [
              'ICMP is never filtered',
              'Conntrack marked the flow ESTABLISHED when the reply matched the outbound request, so the first rule accepted it',
              'The reply uses the OUTPUT chain instead',
              'Replies are broadcast',
            ],
            answer: 1,
          },
          {
            q: 'What does the sender see when a packet is DROPped, compared to REJECTed?',
            options: [
              'DROP: connection refused; REJECT: timeout',
              'Both look identical',
              'DROP: silence (timeout); REJECT: an ICMP error comes back immediately',
              'Both return ICMP errors',
            ],
            answer: 2,
          },
        ],
      },
    ],
  },
};

const lab4: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 60, 120, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      nameserver: '10.0.0.20',
    }),
    dev('host', 'pc2', 60, 320),
    dev('switch', 'sw1', 290, 220),
    dev('router', 'r1', 510, 220, {
      ifaces: [
        { name: 'eth0', ip: '192.168.1.1/24', up: true },
        { name: 'eth1', ip: '10.0.0.1/24', up: true },
      ],
      dhcpServer: {
        enabled: true,
        rangeStart: '192.168.1.100',
        rangeEnd: '192.168.1.150',
        router: '192.168.1.1',
        dns: '10.0.0.20',
      },
    }),
    dev('server', 'srv1', 730, 220, {
      ifaces: [{ name: 'eth0', ip: '10.0.0.20/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
      dnsServer: {
        enabled: true,
        records: [
          ['web.lan', '10.0.0.20'],
          ['pc1.lan', '192.168.1.10'],
        ],
      },
      httpServer: { enabled: true, port: 80, body: '<h1>It works!</h1>' },
    }),
  ],
  links: [
    link('pc1', 'eth0', 'sw1', 'eth0'),
    link('pc2', 'eth0', 'sw1', 'eth1'),
    link('sw1', 'eth2', 'r1', 'eth0'),
    link('r1', 'eth1', 'srv1', 'eth0'),
  ],
  lab: {
    id: 'network-services',
    title: 'Lab 4 — DHCP, DNS & the web',
    blurb: 'Plug in a blank machine and follow it all the way to a working web page.',
    steps: [
      {
        title: 'Get an address (DHCP)',
        body:
          'pc2 has no configuration at all. On pc2 run `dhclient eth0` and watch the four ' +
          'broadcast packets: DISCOVER, OFFER, REQUEST, ACK (r1 is the DHCP server — see its ' +
          'lease table in the inspector). Then check what arrived: `ip addr`, `ip route`.',
        objectives: [
          {
            id: 'l4-ip',
            label: 'pc2 got an address in 192.168.1.0/24',
            check: { type: 'iface-ip', device: 'pc2', iface: 'eth0', inSubnet: '192.168.1.0/24' },
          },
          {
            id: 'l4-route',
            label: 'pc2 got a default route via 192.168.1.1',
            check: { type: 'default-route', device: 'pc2', via: '192.168.1.1' },
          },
        ],
      },
      {
        title: 'Names and pages (DNS + HTTP)',
        body:
          'DHCP also delivered a nameserver (srv1). On pc2 try `dig web.lan`, then ' +
          '`curl -v http://web.lan/` and read the whole exchange: the purple DNS query, the ' +
          'green TCP handshake, the request and the 200 response.',
        objectives: [
          {
            id: 'l4-dns',
            label: 'pc2 resolves web.lan to 10.0.0.20',
            check: { type: 'dns', from: 'pc2', name: 'web.lan', expect: 'resolves', addr: '10.0.0.20' },
          },
          {
            id: 'l4-http',
            label: 'pc2 can fetch http://web.lan/',
            check: { type: 'http', from: 'pc2', url: 'http://web.lan/', expect: 'ok', contains: 'It works' },
          },
        ],
        quiz: [
          {
            q: 'Which packet starts the DHCP exchange, and how is it addressed?',
            options: [
              'DHCPOFFER, unicast to the client',
              'DHCPDISCOVER, broadcast to 255.255.255.255 — the client has no address yet',
              'DHCPACK, broadcast',
              'ARP request for the server',
            ],
            answer: 1,
          },
          {
            q: 'dig web.lan works but curl http://web.lan/ hangs. Which is the most likely culprit?',
            options: [
              'DNS is broken',
              'The default route is missing',
              'Something is dropping tcp/80 between pc2 and the server',
              'ARP failed',
            ],
            answer: 2,
          },
        ],
      },
    ],
  },
};

const lab5: SaveFile = {
  app: 'netsim',
  version: 1,
  devices: [
    dev('host', 'pc1', 60, 120, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.10/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
    }),
    dev('server', 'srv1', 60, 320, {
      ifaces: [{ name: 'eth0', ip: '192.168.1.20/24', up: true }],
      routes: [{ dest: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      services: { tcp: [22], udp: [] },
      httpServer: { enabled: true, port: 80, body: '<h1>company web</h1>' },
    }),
    dev('switch', 'sw1', 280, 220),
    dev('firewall', 'fw1', 500, 220, {
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
    link('srv1', 'eth0', 'sw1', 'eth1'),
    link('sw1', 'eth2', 'fw1', 'eth0'),
    link('fw1', 'eth1', 'inet1', 'eth0'),
  ],
  lab: {
    id: 'harden-network',
    title: 'Lab 5 — Harden a vulnerable network',
    blurb: 'You inherit an open network. Audit the exposure, then lock it down without breaking the business.',
    steps: [
      {
        title: 'Audit the exposure',
        body:
          'fw1 sits between the company (pc1, srv1) and the internet (inet1) — but it forwards ' +
          'everything. Play attacker from inet1: `ping 192.168.1.10`, `nc -z -w 2 192.168.1.20 22`, ' +
          '`nc -z -w 2 192.168.1.20 80`. All of it works. The objectives below *confirm* the ' +
          'vulnerabilities — they should all pass before you fix anything.',
        objectives: [
          {
            id: 'l5-audit-ping',
            label: 'Confirmed: the internet can ping the workstation (bad!)',
            check: { type: 'ping', from: 'inet1', toDevice: 'pc1', expect: 'success' },
          },
          {
            id: 'l5-audit-ssh',
            label: 'Confirmed: SSH on srv1 is open to the internet (bad!)',
            check: { type: 'tcp', from: 'inet1', toDevice: 'srv1', port: 22, expect: 'open' },
          },
        ],
        quiz: [
          {
            q: 'Which of these is NOT one of this network’s design problems?',
            options: [
              'The firewall forwards everything by default',
              'The server sits on the same segment as the workstations',
              'Management services (SSH) are reachable from the internet',
              'The workstation uses a private RFC1918 address',
            ],
            answer: 3,
          },
        ],
      },
      {
        title: 'Harden the perimeter',
        body:
          'Business requirements: the web site must stay reachable from the internet; staff must ' +
          'still be able to reach out; everything else inbound dies. On fw1:\n' +
          '`iptables -P FORWARD DROP`\n' +
          '`iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`\n' +
          '`iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT`\n' +
          '`iptables -A FORWARD -d 192.168.1.20 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT`\n' +
          'Re-run your attacks from inet1 and read fw1’s firewall log: every drop names the rule that killed it.',
        objectives: [
          {
            id: 'l5-policy',
            label: 'FORWARD policy is drop (default deny)',
            check: { type: 'fw-policy', device: 'fw1', hook: 'forward', policy: 'drop' },
          },
          {
            id: 'l5-web',
            label: 'The public web site still works from the internet',
            check: { type: 'tcp', from: 'inet1', toDevice: 'srv1', port: 80, expect: 'open' },
          },
          {
            id: 'l5-ssh',
            label: 'SSH is now silently filtered from the internet',
            check: { type: 'tcp', from: 'inet1', toDevice: 'srv1', port: 22, expect: 'filtered' },
          },
          {
            id: 'l5-ping',
            label: 'The internet can no longer ping the workstation',
            check: { type: 'ping', from: 'inet1', toDevice: 'pc1', expect: 'fail' },
          },
          {
            id: 'l5-out',
            label: 'Staff can still reach the internet (stateful return traffic)',
            check: { type: 'ping', from: 'pc1', toDevice: 'inet1', expect: 'success' },
          },
        ],
        quiz: [
          {
            q: 'SSH shows as "filtered" rather than "refused" to the attacker. Why is that usually preferable?',
            options: [
              'It is faster for the attacker',
              'A silent drop reveals nothing — a refusal confirms a live host and a real, reachable port',
              'REJECT would crash the firewall',
              'It is not preferable; they are identical',
            ],
            answer: 1,
          },
          {
            q: 'What further improvement would most reduce the blast radius if srv1 were compromised?',
            options: [
              'A stronger root password on srv1',
              'Moving srv1 to its own DMZ segment so it cannot reach the workstations directly',
              'Changing SSH to port 2222',
              'Enabling RIP on fw1',
            ],
            answer: 1,
          },
        ],
      },
    ],
  },
};

export const LABS: SaveFile[] = [lab1, lab2, lab3, lab4, lab5];
