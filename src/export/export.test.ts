import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { FirewallDevice, Host, RouterDevice, ServerDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { configBundle, dnsmasqConf, nftablesConf, setupScript } from './configs';
import { containerlabYaml } from './containerlab';
import { composeYaml, computeSegments } from './compose';
import { topologySvg } from './diagram';
import { networkReport } from './report';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: Host | RouterDevice | FirewallDevice | ServerDevice, ifname: string, cidr: string) {
  dev.getInterface(ifname)!.ip = parseCidr(cidr)!;
}

function shell(net: Network, dev: FirewallDevice, line: string) {
  let finished = false;
  new Shell(dev).exec(line, { write: () => {} }, () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + 10_000);
  expect(finished).toBe(true);
}

// pc1 — sw1 — fw1 — srv1, with firewall rules, NAT, DHCP+DNS+web services.
function exportLab(net: Network) {
  const pc1 = createDevice(net, 'host') as Host;
  const sw1 = createDevice(net, 'switch');
  const fw1 = createDevice(net, 'firewall') as FirewallDevice;
  const srv1 = createDevice(net, 'server') as ServerDevice;
  net.connect(pc1.id, sw1.id);
  net.connect(sw1.id, fw1.id);
  net.connect(fw1.id, srv1.id);
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(fw1, 'eth0', '192.168.1.1/24');
  setIp(fw1, 'eth1', '203.0.113.1/24');
  setIp(srv1, 'eth0', '203.0.113.80/24');
  pc1.addRoute(0, 0, ip('192.168.1.1'));
  pc1.nameserver = ip('203.0.113.80');
  srv1.addRoute(0, 0, ip('203.0.113.1'));
  srv1.dnsServer = { enabled: true, records: new Map([['web.lan', ip('203.0.113.80')]]) };
  srv1.httpServer = { enabled: true, port: 80, body: '<h1>hi</h1>' };
  fw1.dhcpServer = {
    enabled: true,
    rangeStart: ip('192.168.1.100'),
    rangeEnd: ip('192.168.1.150'),
    router: ip('192.168.1.1'),
    dns: ip('203.0.113.80'),
    leases: new Map(),
  };
  shell(net, fw1, 'iptables -P FORWARD DROP');
  shell(net, fw1, 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
  shell(net, fw1, 'iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT');
  shell(net, fw1, 'nft add table ip nat');
  shell(net, fw1, 'nft add chain ip nat postrouting { type nat hook postrouting priority 100 ; }');
  shell(net, fw1, 'nft add rule ip nat postrouting oifname eth1 masquerade');
  return { pc1, sw1, fw1, srv1 };
}

const POSITIONS = [
  { id: 'dev-1', x: 0, y: 100 },
  { id: 'dev-2', x: 200, y: 100 },
  { id: 'dev-3', x: 400, y: 100 },
  { id: 'dev-4', x: 600, y: 100 },
];

describe('config bundle', () => {
  it('emits genuine iproute2/sysctl/nft setup scripts', () => {
    const net = new Network();
    const { pc1, fw1 } = exportLab(net);
    const pcScript = setupScript(pc1);
    expect(pcScript).toContain('ip addr add 192.168.1.10/24 dev eth0');
    expect(pcScript).toContain('ip route add default via 192.168.1.1 dev eth0');
    expect(pcScript).toContain("printf 'nameserver 203.0.113.80\\n' > /etc/resolv.conf");
    expect(pcScript).not.toContain('sysctl');

    const fwScript = setupScript(fw1);
    expect(fwScript).toContain('sysctl -w net.ipv4.ip_forward=1');
    expect(fwScript).toContain('nft -f ./nftables.conf');
  });

  it('emits a flushing nftables.conf with the full ruleset', () => {
    const net = new Network();
    const { fw1, pc1 } = exportLab(net);
    const conf = nftablesConf(fw1)!;
    expect(conf).toContain('flush ruleset');
    expect(conf).toContain('type filter hook forward priority 0; policy drop;');
    expect(conf).toContain('ct state established,related accept');
    expect(conf).toContain('oifname "eth1" masquerade');
    expect(nftablesConf(pc1)).toBeNull();
  });

  it('emits dnsmasq.conf for DHCP and DNS roles', () => {
    const net = new Network();
    const { fw1, srv1, pc1 } = exportLab(net);
    const dhcp = dnsmasqConf(fw1)!;
    expect(dhcp).toContain('dhcp-range=192.168.1.100,192.168.1.150,12h');
    expect(dhcp).toContain('dhcp-option=option:router,192.168.1.1');
    expect(dhcp).toContain('port=0');
    const dns = dnsmasqConf(srv1)!;
    expect(dns).toContain('host-record=web.lan,203.0.113.80');
    expect(dns).toContain('no-resolv');
    expect(dnsmasqConf(pc1)).toBeNull();
  });

  it('bundles per-device directories with a README index', () => {
    const net = new Network();
    exportLab(net);
    const files = configBundle(net);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('pc1/setup.sh');
    expect(paths).toContain('fw1/nftables.conf');
    expect(paths).toContain('fw1/dnsmasq.conf');
    expect(paths).toContain('srv1/index.html');
    expect(paths).not.toContain('sw1/setup.sh'); // switches have no L3 config
  });
});

describe('containerlab export', () => {
  it('maps interfaces to eth(N+1) and bridges switches', () => {
    const net = new Network();
    exportLab(net);
    const yaml = containerlabYaml(net);
    expect(yaml).toContain('kind: linux');
    expect(yaml).toContain('ip addr add 192.168.1.10/24 dev eth1'); // sim eth0 -> clab eth1
    expect(yaml).toContain('ip link add br0 type bridge');
    expect(yaml).toContain('ip link set eth1 master br0');
    expect(yaml).toContain('- endpoints: ["pc1:eth1", "sw1:eth1"]');
    // nft rules ride along, with iifname/oifname shifted too
    expect(yaml).toContain(`nft 'add rule ip nat postrouting oifname \\"eth2\\" masquerade'`);
    expect(yaml).toContain('policy drop');
  });
});

describe('docker-compose export', () => {
  it('builds one network per switch group and per p2p link', () => {
    const net = new Network();
    exportLab(net);
    const segs = computeSegments(net);
    expect(segs.map((s) => s.name).sort()).toEqual(['p2p_fw1_srv1', 'sw1']);
    expect(segs.find((s) => s.name === 'sw1')!.subnet).toBe('192.168.1.0/24');

    const yaml = composeYaml(net);
    expect(yaml).toContain('ipv4_address: 192.168.1.10');
    expect(yaml).toContain('- subnet: 203.0.113.0/24');
    expect(yaml).toContain('cap_add: [NET_ADMIN]');
    expect(yaml).toContain('sysctl -w net.ipv4.ip_forward=1');
    expect(yaml).not.toContain('  sw1:\n    image'); // switches become networks, not services
  });
});

describe('diagram and report', () => {
  it('renders an SVG with device names and addresses', () => {
    const net = new Network();
    exportLab(net);
    const svg = topologySvg(net, POSITIONS);
    expect(svg).toContain('<svg');
    expect(svg).toContain('pc1');
    expect(svg).toContain('eth0 192.168.1.10/24');
  });

  it('renders a self-contained HTML report', () => {
    const net = new Network();
    exportLab(net);
    const html = networkReport(net, POSITIONS, '2026-08-01');
    expect(html).toContain('<title>NetSim network report</title>');
    expect(html).toContain('DHCP server');
    expect(html).toContain('web.lan');
    expect(html).toContain('policy drop');
    expect(html).toContain('<svg');
  });
});

// ADR 0003: generated rulesets must be genuine. This test writes samples that
// CI validates with the real nft binary (`nft -c -f samples/nftables.conf`).
describe('sample generation for CI syntax validation', () => {
  it('writes generated configs to samples/', () => {
    const net = new Network();
    const { fw1 } = exportLab(net);
    const dir = join(process.cwd(), 'samples');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'nftables.conf'), nftablesConf(fw1)!);
    writeFileSync(join(dir, 'setup-fw1.sh'), setupScript(fw1));
    writeFileSync(join(dir, 'dnsmasq.conf'), dnsmasqConf(fw1)!);
    expect(true).toBe(true);
  });
});
