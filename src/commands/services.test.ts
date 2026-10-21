import { describe, expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { Host, IpDevice, RouterDevice, ServerDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from './shell';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { SwitchDevice } from '../engine/switch';
import type { EthernetFrame } from '../engine/types';

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

  it('reserves distinct offers for simultaneous Linux and Windows clients', () => {
    const net = new Network(), { pc2, sw1, r1 } = servicesLab(net);
    const windows = createDevice(net, 'host', { os: 'windows' }) as Host;
    net.connect(windows.id, sw1.id); windows.interfaces[0].configureIpv4({ mode: 'dhcp', ip: null, gateway: null, dns: null });
    const linuxDone: string[] = [], windowsDone: string[] = [];
    new Shell(pc2).exec('dhclient', { write() {} }, () => linuxDone.push('done'));
    new Shell(windows).exec('ipconfig /renew', { write() {} }, () => windowsDone.push('done'));
    net.scheduler.advanceTo(10000);
    expect(linuxDone).toEqual(['done']); expect(windowsDone).toEqual(['done']);
    expect(pc2.interfaces[0].ip?.addr).toBe(ip('192.168.1.100'));
    expect(windows.interfaces[0].ip?.addr).toBe(ip('192.168.1.101'));
    expect(new Set(r1.dhcpServer!.leases.values()).size).toBe(2);
    expect(run(net, windows, 'ipconfig /renew')).toContain('192.168.1.101');
  });

  it('does not acknowledge requests for another client address or an out-of-pool address', () => {
    const net = new Network(), { pc2, sw1, r1 } = servicesLab(net);
    run(net, pc2, 'dhclient');
    const other = createDevice(net, 'host') as Host;
    net.connect(other.id, sw1.id);
    const iface = other.interfaces[0];
    for (const address of ['192.168.1.100', '192.168.1.250', '192.168.1.1']) {
      other.sendDhcpClient(iface, { kind: 'dhcp', op: 'request', xid: other.nextDhcpXid(), clientMac: iface.mac, yourIp: ip(address) });
      net.scheduler.advanceTo(net.now + 1000);
      expect(r1.dhcpServer!.leases.has(iface.mac)).toBe(false);
    }
    expect(run(net, other, 'dhclient')).toContain('bound to 192.168.1.101');
  });

  it('skips addresses retained by clients after save/restore even though leases were not saved', () => {
    const net = new Network(), lab = servicesLab(net);
    run(net, lab.pc2, 'dhclient');
    const restored = restoreNetwork(serializeNetwork(net, {}));
    const client = restored.devices.get(lab.pc2.id) as Host;
    const server = restored.devices.get(lab.r1.id) as IpDevice;
    expect(server.dhcpServer!.leases.size).toBe(0);
    const frames: EthernetFrame[] = [];
    restored.onWireTransfer = (_transfer, context) => frames.push(context.frame);
    const fresh = createDevice(restored, 'host', { os: 'windows' }) as Host;
    restored.connect(fresh.id, lab.sw1.id); fresh.interfaces[0].configureIpv4({ mode: 'dhcp', ip: null, gateway: null, dns: null });
    expect(run(restored, fresh, 'ipconfig /renew')).toContain('192.168.1.101');
    expect(frames.some((f) => f.payload.kind === 'arp' && f.payload.op === 'request' && f.payload.targetIp === ip('192.168.1.100'))).toBe(true);
    expect(frames.some((f) => f.payload.kind === 'arp' && f.payload.op === 'reply' && f.payload.senderMac === client.interfaces[0].mac && f.payload.senderIp === ip('192.168.1.100'))).toBe(true);
    expect(client.interfaces[0].ip?.addr).toBe(ip('192.168.1.100'));
    expect(run(restored, client, 'dhclient')).toContain('bound to 192.168.1.100');
    expect(new Set(server.dhcpServer!.leases.values()).size).toBe(2);
  });

  it('checks existing static addresses only in the server broadcast domain, respecting VLANs and routers', () => {
    const net = new Network(), { pc1, pc2, sw1, r1, srv1 } = servicesLab(net);
    pc1.interfaces[0].ip = parseCidr('192.168.1.100/24');
    expect(run(net, pc2, 'dhclient')).toContain('bound to 192.168.1.101');
    const other = createDevice(net, 'host') as Host; net.connect(other.id, sw1.id);
    const sw = sw1 as SwitchDevice;
    sw.vlans.set(pc1.interfaces[0].link!.other(pc1.interfaces[0]).name, 20);
    // An identically numbered address behind the router is also a separate L2 domain.
    srv1.interfaces[0].ip = parseCidr('192.168.1.100/24');
    expect(run(net, other, 'dhclient')).toContain('bound to 192.168.1.100');
    expect(r1.dhcpServer!.leases.size).toBe(2);
  });

  it('expires abandoned offers without extra timers and does not reuse a full pool early', () => {
    const net = new Network(), { pc2, sw1, r1 } = servicesLab(net);
    r1.dhcpServer!.rangeEnd = r1.dhcpServer!.rangeStart;
    const mac = pc2.interfaces[0].mac;
    pc2.sendDhcpClient(pc2.interfaces[0], { kind: 'dhcp', op: 'discover', xid: 1, clientMac: mac });
    net.scheduler.advanceTo(1000);
    expect(r1.dhcpServer!.leases.size).toBe(0); // an offer is not a confirmed lease
    const other = createDevice(net, 'host') as Host; net.connect(other.id, sw1.id);
    expect(run(net, other, 'dhclient')).toContain('No DHCPOFFERS');
    net.scheduler.advanceTo(net.now + 31000);
    expect(run(net, other, 'dhclient')).toContain('bound to 192.168.1.100');
  });

  it.each(['disable', 'replace', 'remove', 'disconnect'] as const)('does not emit a stale offer after %s during ARP probing', (change) => {
    const net = new Network(), { pc2, r1 } = servicesLab(net);
    const offers: EthernetFrame[] = [];
    net.onWireTransfer = (_transfer, { frame }) => {
      const p = frame.payload;
      if (p.kind === 'ipv4' && p.l4.kind === 'udp' && p.l4.app?.kind === 'dhcp' && p.l4.app.op === 'offer') offers.push(frame);
    };
    const running = new Shell(pc2).exec('dhclient', { write() {} }, () => {});
    net.scheduler.advanceTo(250); // DISCOVER arrived; ARP verification is pending.
    if (change === 'disable') r1.dhcpServer!.enabled = false;
    if (change === 'replace') r1.dhcpServer = { ...r1.dhcpServer!, enabled: false, leases: new Map() };
    if (change === 'remove') net.removeDevice(r1.id);
    if (change === 'disconnect') net.disconnect(r1.interfaces[0].link!.id);
    running!.cancel(); net.scheduler.advanceTo(10000);
    expect(offers).toEqual([]); expect(pc2.interfaces[0].ip).toBeNull();
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
