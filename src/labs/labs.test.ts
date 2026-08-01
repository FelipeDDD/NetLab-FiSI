import { describe, expect, it } from 'vitest';
import { restoreNetwork } from '../engine/serialize';
import type { Network } from '../engine/network';
import { Host, IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { Shell } from '../commands/shell';
import { LABS } from './library';
import { EXAMPLES } from './examples';
import { runChecks, type CheckResult } from './checker';
import type { Objective } from './types';

const ip = (s: string) => parseIp(s)!;

function labFile(id: string) {
  const f = LABS.find((l) => l.lab?.id === id);
  expect(f).toBeTruthy();
  return JSON.parse(JSON.stringify(f));
}

function device(net: Network, name: string): IpDevice {
  const d = [...net.devices.values()].find((x) => x.name === name);
  expect(d).toBeTruthy();
  return d as IpDevice;
}

function check(net: Network, objectives: Objective[]): Record<string, CheckResult> {
  const results: Record<string, CheckResult> = {};
  let finished = false;
  runChecks(net, objectives, (r) => (results[r.id] = r), () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + 120_000);
  expect(finished).toBe(true);
  return results;
}

function shell(net: Network, dev: IpDevice, line: string): void {
  let finished = false;
  new Shell(dev).exec(line, { write: () => {} }, () => (finished = true));
  net.scheduler.advanceTo(net.scheduler.now + 60_000);
  expect(finished).toBe(true);
}

describe('lab 1 — static addressing', () => {
  it('fails when unconfigured, passes when solved', () => {
    const net = restoreNetwork(labFile('static-addressing'));
    const lab = LABS[0].lab!;
    const step1 = lab.steps[0].objectives;
    const step2 = lab.steps[1].objectives;

    let r = check(net, step1);
    expect(r['l1-ip1'].pass).toBe(false);
    expect(r['l1-ip1'].detail).toContain('no address');

    device(net, 'pc1').getInterface('eth0')!.ip = parseCidr('192.168.1.10/24');
    device(net, 'pc2').getInterface('eth0')!.ip = parseCidr('192.168.1.20/24');

    r = check(net, step1);
    expect(r['l1-ip1'].pass).toBe(true);
    expect(r['l1-ip2'].pass).toBe(true);

    r = check(net, step2);
    expect(r['l1-ping'].pass).toBe(true);
    expect(r['l1-ping2'].pass).toBe(true);
  });

  it('rejects an address with the wrong prefix', () => {
    const net = restoreNetwork(labFile('static-addressing'));
    device(net, 'pc1').getInterface('eth0')!.ip = parseCidr('192.168.1.10/16');
    const r = check(net, [LABS[0].lab!.steps[0].objectives[0]]);
    expect(r['l1-ip1'].pass).toBe(false);
  });
});

describe('lab 2 — routing', () => {
  it('grades the routing lab end to end', () => {
    const net = restoreNetwork(labFile('static-routing'));
    const lab = LABS[1].lab!;
    const r1 = device(net, 'r1');
    const pc1 = device(net, 'pc1') as Host;
    const pc2 = device(net, 'pc2') as Host;

    let r = check(net, lab.steps[1].objectives);
    expect(r['l2-def1'].pass).toBe(false);
    expect(r['l2-ping'].pass).toBe(false);

    r1.getInterface('eth0')!.ip = parseCidr('192.168.1.1/24');
    r1.getInterface('eth1')!.ip = parseCidr('10.0.0.1/24');
    pc1.addRoute(0, 0, ip('192.168.1.1'));
    pc2.addRoute(0, 0, ip('10.0.0.1'));

    r = check(net, [...lab.steps[0].objectives, ...lab.steps[1].objectives]);
    expect(Object.values(r).every((x) => x.pass)).toBe(true);
  });
});

describe('lab 3 — stateful firewall', () => {
  it('step 1 passes on the open topology, step 3 only after the ruleset', () => {
    const net = restoreNetwork(labFile('stateful-firewall'));
    const lab = LABS[2].lab!;
    const fw1 = device(net, 'fw1');

    let r = check(net, lab.steps[0].objectives);
    expect(r['l3-web'].pass).toBe(true);
    expect(r['l3-open'].pass).toBe(true);

    shell(net, fw1, 'iptables -P FORWARD DROP');
    r = check(net, lab.steps[1].objectives);
    expect(r['l3-policy'].pass).toBe(true);
    expect(r['l3-dead'].pass).toBe(true);

    // Step 3 objectives fail while everything is still dropped...
    r = check(net, lab.steps[2].objectives);
    expect(r['l3-out'].pass).toBe(false);
    expect(r['l3-blocked'].pass).toBe(true);

    // ...and pass once the stateful ruleset is in place.
    shell(net, fw1, 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    shell(net, fw1, 'iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT');
    r = check(net, lab.steps[2].objectives);
    expect(r['l3-out'].pass).toBe(true);
    expect(r['l3-web2'].pass).toBe(true);
    expect(r['l3-blocked'].pass).toBe(true);
    expect(r['l3-filtered'].pass).toBe(true);
  });
});

describe('lab 4 — services', () => {
  it('grades the dhclient → dig → curl journey', () => {
    const net = restoreNetwork(labFile('network-services'));
    const lab = LABS[3].lab!;
    const pc2 = device(net, 'pc2');

    let r = check(net, lab.steps[0].objectives);
    expect(r['l4-ip'].pass).toBe(false);

    shell(net, pc2, 'dhclient eth0');

    r = check(net, [...lab.steps[0].objectives, ...lab.steps[1].objectives]);
    expect(r['l4-ip'].pass).toBe(true);
    expect(r['l4-route'].pass).toBe(true);
    expect(r['l4-dns'].pass).toBe(true);
    expect(r['l4-http'].pass).toBe(true);
  });
});

describe('lab 5 — hardening', () => {
  it('audit objectives pass on the open network, then invert after hardening', () => {
    const net = restoreNetwork(labFile('harden-network'));
    const lab = LABS[4].lab!;
    const fw1 = device(net, 'fw1');

    // Step 1: the vulnerabilities are present (audit objectives pass).
    let r = check(net, lab.steps[0].objectives);
    expect(r['l5-audit-ping'].pass).toBe(true);
    expect(r['l5-audit-ssh'].pass).toBe(true);

    // Step 2 objectives fail before hardening...
    r = check(net, lab.steps[1].objectives);
    expect(r['l5-policy'].pass).toBe(false);
    expect(r['l5-ssh'].pass).toBe(false); // ssh still open, not yet filtered

    shell(net, fw1, 'iptables -P FORWARD DROP');
    shell(net, fw1, 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    shell(net, fw1, 'iptables -A FORWARD -s 192.168.1.0/24 -m conntrack --ctstate NEW -j ACCEPT');
    shell(net, fw1, 'iptables -A FORWARD -d 192.168.1.20 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT');

    r = check(net, lab.steps[1].objectives);
    expect(r['l5-policy'].pass).toBe(true);
    expect(r['l5-web'].pass).toBe(true);
    expect(r['l5-ssh'].pass).toBe(true); // now filtered
    expect(r['l5-ping'].pass).toBe(true); // internet -> pc1 now blocked
    expect(r['l5-out'].pass).toBe(true); // staff still reach out
  });
});

describe('example networks', () => {
  it('good network: only tcp/80 is published inbound; ssh/ping to LAN are blocked', () => {
    const net = restoreNetwork(JSON.parse(JSON.stringify(EXAMPLES[0].file)));
    const webOpen = check(net, [
      { id: 'web', label: '', check: { type: 'tcp', from: 'inet1', toAddr: '203.0.113.1', port: 80, expect: 'open' } },
    ]);
    expect(webOpen['web'].pass).toBe(true); // DNAT publishes the DMZ web server
    const lanBlocked = check(net, [
      { id: 'ping', label: '', check: { type: 'ping', from: 'inet1', toDevice: 'pc1', expect: 'fail' } },
    ]);
    expect(lanBlocked['ping'].pass).toBe(true);
    // Outbound with masquerade works.
    const out = check(net, [
      { id: 'out', label: '', check: { type: 'ping', from: 'pc1', toDevice: 'inet1', expect: 'success' } },
    ]);
    expect(out['out'].pass).toBe(true);
  });

  it('bad network: the internet can reach everything', () => {
    const net = restoreNetwork(JSON.parse(JSON.stringify(EXAMPLES[1].file)));
    const r = check(net, [
      { id: 'ssh', label: '', check: { type: 'tcp', from: 'inet1', toDevice: 'srv1', port: 22, expect: 'open' } },
      { id: 'telnet', label: '', check: { type: 'tcp', from: 'inet1', toDevice: 'srv1', port: 23, expect: 'open' } },
      { id: 'ping', label: '', check: { type: 'ping', from: 'inet1', toDevice: 'pc1', expect: 'success' } },
    ]);
    expect(r['ssh'].pass).toBe(true);
    expect(r['telnet'].pass).toBe(true);
    expect(r['ping'].pass).toBe(true);
  });
});

describe('checker robustness', () => {
  it('fails gracefully when a lab device was deleted', () => {
    const net = restoreNetwork(labFile('static-addressing'));
    net.removeDevice('pc2');
    const r = check(net, LABS[0].lab!.steps[1].objectives);
    expect(r['l1-ping'].pass).toBe(false);
    expect(r['l1-ping2'].pass).toBe(false);
  });
});
