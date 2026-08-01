import { describe, expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { FirewallDevice, Host } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from './shell';

const ip = (s: string) => parseIp(s)!;

function setIp(dev: Host | FirewallDevice, ifname: string, cidr: string): void {
  dev.getInterface(ifname)!.ip = parseCidr(cidr)!;
}

function run(net: Network, dev: Host | FirewallDevice, line: string, advance = 60_000): string {
  const out: string[] = [];
  let finished = false;
  new Shell(dev).exec(line, { write: (s) => out.push(s) }, () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + advance);
  expect(finished).toBe(true);
  return out.join('');
}

// pc1 (192.168.1.10) — fw1 — pc2 (10.0.0.20), default routes both ways.
function fwTopology(net: Network) {
  const pc1 = createDevice(net, 'host') as Host;
  const fw1 = createDevice(net, 'firewall') as FirewallDevice;
  const pc2 = createDevice(net, 'host') as Host;
  net.connect(pc1.id, fw1.id); // fw1 eth0
  net.connect(pc2.id, fw1.id); // fw1 eth1
  setIp(pc1, 'eth0', '192.168.1.10/24');
  setIp(fw1, 'eth0', '192.168.1.1/24');
  setIp(fw1, 'eth1', '10.0.0.1/24');
  setIp(pc2, 'eth0', '10.0.0.20/24');
  pc1.addRoute(0, 0, ip('192.168.1.1'));
  pc2.addRoute(0, 0, ip('10.0.0.1'));
  return { pc1, fw1, pc2 };
}

describe('nft parsing and listing', () => {
  it('declares chains, adds rules, round-trips through list ruleset', () => {
    const net = new Network();
    const { fw1 } = fwTopology(net);
    expect(
      run(net, fw1, 'nft add rule ip filter forward ip saddr 192.168.1.0/24 tcp dport 22 ct state new accept'),
    ).toBe('');
    const listing = run(net, fw1, 'nft list ruleset');
    expect(listing).toContain('table ip filter');
    expect(listing).toContain('type filter hook forward priority 0; policy accept;');
    expect(listing).toContain('ip saddr 192.168.1.0/24 tcp dport 22 ct state new accept');
  });

  it('errors loudly on unsupported syntax and missing chains', () => {
    const net = new Network();
    const pc = createDevice(net, 'host') as Host;
    expect(run(net, pc, 'nft add rule ip filter input accept')).toContain('No such file or directory');
    expect(run(net, pc, 'nft add table ip mangle')).toContain('phase-2 subset');
    const fw = createDevice(net, 'firewall') as FirewallDevice;
    expect(run(net, fw, 'nft add rule ip filter input meta mark 1 accept')).toContain('syntax error');
  });

  it('deletes rules by handle', () => {
    const net = new Network();
    const { fw1 } = fwTopology(net);
    run(net, fw1, 'nft add rule ip filter input drop');
    const listing = run(net, fw1, 'nft -a list ruleset');
    const m = listing.match(/drop # handle (\d+)/);
    expect(m).toBeTruthy();
    expect(run(net, fw1, `nft delete rule ip filter input handle ${m![1]}`)).toBe('');
    expect(run(net, fw1, 'nft list ruleset')).not.toContain('drop # handle');
  });
});

describe('one IR, two dialects', () => {
  it('a rule added via nft appears in iptables -S, and vice versa', () => {
    const net = new Network();
    const { fw1 } = fwTopology(net);
    run(net, fw1, 'nft add rule ip filter forward ip saddr 192.168.1.0/24 ct state new accept');
    const save = run(net, fw1, 'iptables -S');
    expect(save).toContain('-A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT');

    run(net, fw1, 'iptables -A FORWARD -p tcp --dport 80 -j REJECT');
    const listing = run(net, fw1, 'nft list ruleset');
    expect(listing).toContain('tcp dport 80 reject');
  });
});

describe('stateful filtering', () => {
  it('allows LAN-initiated traffic and blocks WAN-initiated traffic', () => {
    const net = new Network();
    const { pc1, fw1, pc2 } = fwTopology(net);
    run(net, fw1, 'iptables -P FORWARD DROP');
    run(net, fw1, 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    run(net, fw1, 'iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT');

    const fromLan = run(net, pc1, 'ping -c 2 10.0.0.20');
    expect(fromLan).toContain('2 received');

    const fromWan = run(net, pc2, 'ping -c 1 192.168.1.10', 120_000);
    expect(fromWan).toContain('0 received');

    // The firewall log explains the drop.
    const dropLine = fw1.fwLog.find((e) => e.verdict === 'drop');
    expect(dropLine?.rule).toBe('policy drop');
  });

  it('reject sends ICMP port-unreachable; ping reports it', () => {
    const net = new Network();
    const { pc1, fw1 } = fwTopology(net);
    run(net, fw1, 'nft add rule ip filter forward icmp type echo-request reject');
    const out = run(net, pc1, 'ping -c 1 10.0.0.20', 120_000);
    expect(out).toContain('Destination Port Unreachable');
  });

  it('OUTPUT drop yields Operation not permitted locally', () => {
    const net = new Network();
    const { pc1 } = fwTopology(net);
    run(net, pc1, 'nft add table ip filter');
    run(net, pc1, 'nft add chain ip filter output { type filter hook output priority 0 ; policy drop ; }');
    const out = run(net, pc1, 'ping -c 1 10.0.0.20');
    expect(out).toContain('ping: sendmsg: Operation not permitted');
  });
});

describe('nc and services', () => {
  it('distinguishes open, refused and filtered ports', () => {
    const net = new Network();
    const { pc1, fw1, pc2 } = fwTopology(net);
    pc2.services.tcp.add(80);

    expect(run(net, pc1, 'nc -z -w 2 10.0.0.20 80')).toContain('succeeded!');
    expect(run(net, pc1, 'nc -z -w 2 10.0.0.20 23')).toContain('Connection refused');

    run(net, fw1, 'nft add rule ip filter forward tcp dport 80 drop');
    expect(run(net, pc1, 'nc -z -w 2 10.0.0.20 80')).toContain('Operation timed out');
  });

  it('closed UDP ports return ICMP port-unreachable → refused', () => {
    const net = new Network();
    const { pc1, pc2 } = fwTopology(net);
    expect(run(net, pc1, 'nc -u -z -w 2 10.0.0.20 53')).toContain('Connection refused');
    pc2.services.udp.add(53);
    expect(run(net, pc1, 'nc -u -z -w 2 10.0.0.20 53')).toContain('succeeded!');
  });
});

describe('NAT', () => {
  it('masquerade hides the LAN behind the firewall address', () => {
    const net = new Network();
    const { pc1, fw1, pc2 } = fwTopology(net);
    // pc2 plays "the internet": it must not know a route back to the LAN.
    pc2.staticRoutes.length = 0;
    expect(run(net, pc1, 'ping -c 1 10.0.0.20', 120_000)).toContain('0 received');

    run(net, fw1, 'nft add table ip nat');
    run(net, fw1, 'nft add chain ip nat postrouting { type nat hook postrouting priority 100 ; }');
    run(net, fw1, 'nft add rule ip nat postrouting oifname eth1 masquerade');

    const out = run(net, pc1, 'ping -c 2 10.0.0.20', 120_000);
    expect(out).toContain('2 received');
    // pc2 saw the firewall's address, not pc1's.
    expect(pc2.arpTable.has(ip('192.168.1.10'))).toBe(false);
    const entry = fw1.ct.list(net.now).find((e) => e.orig.srcIp === ip('192.168.1.10'));
    expect(entry?.trans.srcIp).toBe(ip('10.0.0.1'));
  });

  it('dnat forwards a public port to an inside host', () => {
    const net = new Network();
    const { pc1, fw1, pc2 } = fwTopology(net);
    pc1.services.tcp.add(8080);
    run(net, fw1, 'nft add table ip nat');
    run(net, fw1, 'nft add chain ip nat prerouting { type nat hook prerouting priority -100 ; }');
    run(net, fw1, 'nft add rule ip nat prerouting tcp dport 80 dnat to 192.168.1.10:8080');

    // pc2 connects to the firewall's public address on port 80.
    expect(run(net, pc2, 'nc -z -w 2 10.0.0.1 80')).toContain('succeeded!');
  });
});

describe('conntrack listing', () => {
  it('shows established flows', () => {
    const net = new Network();
    const { pc1, fw1 } = fwTopology(net);
    run(net, fw1, 'iptables -P FORWARD DROP');
    run(net, fw1, 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    run(net, fw1, 'iptables -A FORWARD -s 192.168.1.0/24 -j ACCEPT');
    run(net, pc1, 'ping -c 1 10.0.0.20', 120_000);
    const out = run(net, fw1, 'conntrack -L');
    expect(out).toContain('state=ESTABLISHED');
    expect(out).toContain('src=192.168.1.10');
  });
});
