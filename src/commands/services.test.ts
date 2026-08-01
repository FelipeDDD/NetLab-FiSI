import { describe, expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { Host, IpDevice, RouterDevice, ServerDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from './shell';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: IpDevice, ifname: string, cidr: string): void {
  dev.getInterface(ifname)!.ip = parseCidr(cidr)!;
}

function run(net: Network, dev: IpDevice, line: string, advance = 60_000): string {
  const out: string[] = [];
  let finished = false;
  new Shell(dev).exec(line, { write: (s) => out.push(s) }, () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + advance);
  expect(finished).toBe(true);
  return out.join('');
}

// The demo topology: pc1/pc2 — sw1 — r1 (DHCP) — srv1 (DNS + web).
function servicesLab(net: Network) {
  const pc1 = createDevice(net, 'host') as Host;
  const pc2 = createDevice(net, 'host') as Host;
  const sw1 = createDevice(net, 'switch');
  const r1 = createDevice(net, 'router') as RouterDevice;
  const srv1 = createDevice(net, 'server') as ServerDevice;
  net.connect(pc1.id, sw1.id);
  net.connect(pc2.id, sw1.id);
  net.connect(sw1.id, r1.id);
  net.connect(r1.id, srv1.id);
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(r1, 'eth0', '192.168.1.1/24');
  setIp(r1, 'eth1', '10.0.0.1/24');
  setIp(srv1, 'eth0', '10.0.0.20/24');
  pc1.addRoute(0, 0, ip('192.168.1.1'));
  srv1.addRoute(0, 0, ip('10.0.0.1'));
  pc1.nameserver = ip('10.0.0.20');
  r1.dhcpServer = {
    enabled: true,
    rangeStart: ip('192.168.1.100'),
    rangeEnd: ip('192.168.1.150'),
    router: ip('192.168.1.1'),
    dns: ip('10.0.0.20'),
    leases: new Map(),
  };
  srv1.dnsServer = {
    enabled: true,
    records: new Map([
      ['web.lan', ip('10.0.0.20')],
      ['pc1.lan', ip('192.168.1.10')],
    ]),
  };
  srv1.httpServer = { enabled: true, port: 80, body: '<h1>It works!</h1>' };
  return { pc1, pc2, sw1, r1, srv1 };
}

describe('DHCP', () => {
  it('dhclient acquires an address, default route and nameserver', () => {
    const net = new Network();
    const { pc2, r1 } = servicesLab(net);
    const out = run(net, pc2, 'dhclient eth0');
    expect(out).toContain('DHCPOFFER of 192.168.1.100 from 192.168.1.1');
    expect(out).toContain('DHCPACK of 192.168.1.100');
    expect(out).toContain('bound to 192.168.1.100');
    expect(pc2.getInterface('eth0')!.ip?.addr).toBe(ip('192.168.1.100'));
    expect(pc2.getInterface('eth0')!.ip?.prefix).toBe(24);
    expect(pc2.lookupRoute(ip('8.8.8.8'))?.via).toBe(ip('192.168.1.1'));
    expect(pc2.nameserver).toBe(ip('10.0.0.20'));
    expect(r1.dhcpServer!.leases.get(pc2.getInterface('eth0')!.mac)).toBe(ip('192.168.1.100'));
  });

  it('hands different addresses to different clients', () => {
    const net = new Network();
    const lab = servicesLab(net);
    const pc3 = createDevice(net, 'host') as Host;
    net.connect(pc3.id, lab.sw1.id);
    run(net, lab.pc2, 'dhclient eth0');
    run(net, pc3, 'dhclient eth0');
    expect(lab.pc2.getInterface('eth0')!.ip?.addr).toBe(ip('192.168.1.100'));
    expect(pc3.getInterface('eth0')!.ip?.addr).toBe(ip('192.168.1.101'));
  });

  it('reports no offers when there is no DHCP server', () => {
    const net = new Network();
    const a = createDevice(net, 'host') as Host;
    const b = createDevice(net, 'host') as Host;
    net.connect(a.id, b.id);
    const out = run(net, a, 'dhclient eth0');
    expect(out).toContain('No DHCPOFFERS received.');
  });

  it('an INPUT drop of udp/67 on the server blocks DHCP', () => {
    const net = new Network();
    const { pc2, r1 } = servicesLab(net);
    run(net, r1, 'iptables -A INPUT -p udp --dport 67 -j DROP');
    const out = run(net, pc2, 'dhclient eth0');
    expect(out).toContain('No DHCPOFFERS received.');
  });
});

describe('DNS', () => {
  it('dig resolves via the configured nameserver', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    expect(run(net, pc1, 'dig web.lan +short')).toContain('10.0.0.20');
    const full = run(net, pc1, 'dig web.lan');
    expect(full).toContain('status: NOERROR');
    expect(full).toContain('web.lan.\t\t0\tIN\tA\t10.0.0.20');
  });

  it('returns NXDOMAIN for unknown names', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    expect(run(net, pc1, 'dig nope.lan')).toContain('status: NXDOMAIN');
  });

  it('dig @server works without a configured nameserver', () => {
    const net = new Network();
    const { pc2 } = servicesLab(net);
    run(net, pc2, 'dhclient eth0');
    pc2.nameserver = null;
    expect(run(net, pc2, 'dig @10.0.0.20 web.lan +short')).toContain('10.0.0.20');
  });

  it('ping resolves hostnames and shows the address', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    const out = run(net, pc1, 'ping -c 1 web.lan', 120_000);
    expect(out).toContain('PING web.lan (10.0.0.20)');
    expect(out).toContain('1 received');
  });

  it('fails cleanly with no nameserver configured', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    pc1.nameserver = null;
    expect(run(net, pc1, 'ping web.lan')).toContain('Temporary failure in name resolution');
  });

  it('a firewall dropping udp/53 makes dig time out', () => {
    const net = new Network();
    const { pc1, r1 } = servicesLab(net);
    run(net, r1, 'iptables -A FORWARD -p udp --dport 53 -j DROP');
    expect(run(net, pc1, 'dig web.lan')).toContain('connection timed out');
  });
});

describe('HTTP', () => {
  it('curl fetches the page by address', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    expect(run(net, pc1, 'curl http://10.0.0.20/')).toContain('<h1>It works!</h1>');
  });

  it('curl -v shows the request/response exchange', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    const out = run(net, pc1, 'curl -v http://web.lan/');
    expect(out).toContain('* Connected to web.lan (10.0.0.20) port 80');
    expect(out).toContain('> GET / HTTP/1.1');
    expect(out).toContain('> Host: web.lan');
    expect(out).toContain('< HTTP/1.1 200 OK');
    expect(out).toContain('<h1>It works!</h1>');
  });

  it('reports Connection refused when the web server is off', () => {
    const net = new Network();
    const { pc1, srv1 } = servicesLab(net);
    srv1.httpServer!.enabled = false;
    expect(run(net, pc1, 'curl http://10.0.0.20/')).toContain(
      'curl: (7) Failed to connect to 10.0.0.20 port 80: Connection refused',
    );
  });

  it('reports a timeout when a firewall silently drops port 80', () => {
    const net = new Network();
    const { pc1, r1 } = servicesLab(net);
    run(net, r1, 'iptables -A FORWARD -p tcp --dport 80 -j DROP');
    expect(run(net, pc1, 'curl http://web.lan/')).toContain('curl: (28)');
  });

  it('cannot resolve without DNS', () => {
    const net = new Network();
    const { pc1 } = servicesLab(net);
    pc1.nameserver = null;
    expect(run(net, pc1, 'curl http://web.lan/')).toContain(
      'curl: (6) Could not resolve host: web.lan',
    );
  });

  it('full student journey: dhclient then curl by name', () => {
    const net = new Network();
    const { pc2 } = servicesLab(net);
    run(net, pc2, 'dhclient eth0');
    expect(run(net, pc2, 'curl http://web.lan/')).toContain('<h1>It works!</h1>');
  });
});

describe('ss listing', () => {
  it('shows service sockets with process hints', () => {
    const net = new Network();
    const { srv1, r1 } = servicesLab(net);
    const out = run(net, srv1, 'ss -tlnu');
    expect(out).toContain('udp    UNCONN  0.0.0.0:53');
    expect(out).toContain('tcp    LISTEN  0.0.0.0:80');
    expect(out).toContain('httpd');
    expect(run(net, r1, 'ss -tlnu')).toContain('0.0.0.0:67');
  });
});
