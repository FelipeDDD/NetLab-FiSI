import { describe, expect, it } from 'vitest';
import type { Network } from '../engine/network';
import { Host, IpDevice } from '../engine/ipdevice';
import { parseCidr, parseIp } from '../engine/ip';
import { disposeNetwork } from '../engine/networkLifecycle';
import { serializeNetwork } from '../engine/serialize';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { runChecks, type CheckResult } from './checker';
import { progressiveNatPat } from './progressiveNatPat';
import { Shell } from '../commands/shell';
import { requestPage, simulatedUrl, type BrowserResult } from '../browser/request';
import { packetAnimationDuration, packetAnimationProgress, sequencePacketAnimation, type AnimatedTransfer } from '../packetAnimation';
import { natCapturedFlow, natIntroComplete, natIntroSignature, natInvestigationComplete, natSecondHost } from './natLearning';
import { PacketCapture } from '../packetCapture';
import { createDevice } from '../engine/factory';
import { natHostReady, natBrowserProof, natRouterEntries } from './natLearning';

const lab = progressiveNatPat.lab!;
const ip = (text: string) => parseIp(text)!;

it('credits completed review only with paired SYN answers and a coherent failed HTTP investigation', () => {
  const passed = (detail: string) => ({ pass: true, detail });
  const intro = {
    'nat-first-http': passed('original'),
    'nat-source-local': passed('original'),
    'nat-source-external': passed('original'),
  };
  expect(natIntroComplete(intro)).toBe(true);
  expect(natIntroComplete({ ...intro, 'nat-source-external': passed('other') })).toBe(false);
  const investigation = {
    'nat-before-local': passed('echo reply'),
    'nat-before-pc1': passed('translated HTTP'),
    'nat-proof-nat-before-local': passed('original'),
    'nat-proof-nat-before-pc1': passed('original'),
    'nat-proof-nat-before-pc2': passed('original'),
  };
  expect(natInvestigationComplete(investigation)).toBe(false);
  expect(natInvestigationComplete(investigation, 2)).toBe(false);
  const complete = { ...investigation, 'nat-before-pc2': passed('untranslated timeout') };
  expect(natInvestigationComplete(complete)).toBe(true);
  expect(natInvestigationComplete({ ...complete, 'nat-proof-nat-before-pc1': passed('other') })).toBe(false);
  expect(natInvestigationComplete({ ...complete, 'nat-proof-nat-before-pc1': passed('other') }, 2)).toBe(true);
});
function addPc2(net: Network) {
  const host = new Host(net, 'PC2', 'PC2'); net.devices.set(host.id, host);
  host.interfaces[0].configureIpv4({ mode: 'static', ip: parseCidr('192.168.60.11/24'), gateway: ip('192.168.60.1'), dns: null });
  return host;
}

function check(net: Network, step: number) {
  const results: Record<string, CheckResult> = {};
  let finished = false;
  runChecks(net, lab.steps[step].objectives, result => { results[result.id] = result; }, () => { finished = true; });
  net.scheduler.advanceTo(net.now + 12_000);
  expect(finished).toBe(true);
  return results;
}

describe('progressive NAT/PAT Lab', () => {
  it('lists the initial NAT rule with nftables in the Router terminal', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      let output = '';
      new Shell(network.devices.get('edge') as IpDevice).exec('nft list ruleset', { write: text => { output += text; } }, () => {});
      expect(output).toContain('oifname "eth1" ip saddr 192.168.60.10 masquerade');
    } finally { disposeNetwork(network); }
  });
  it('allocates the same PC sequence for Linux and Windows and keeps custom names through load', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      createDevice(network, 'host', { name: 'pc2' });
      const linux = createDevice(network, 'host', { os: 'linux' });
      const windows = createDevice(network, 'host', { os: 'windows' });
      expect([linux.name, windows.name]).toEqual(['PC3', 'PC4']);
      windows.name = 'Recepção';
      const restored = prepareTopologyDocument(serializeNetwork(network, {})).network;
      try { expect(restored.devices.get(windows.id)?.name).toBe('Recepção'); }
      finally { disposeNetwork(restored); }
    } finally { disposeNetwork(network); }
  });

  it('recognizes CLI IPv4 and default route as equivalent to inspector fields', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      const host = createDevice(network, 'host') as Host;
      network.connect(host.id, 'lan');
      const shell = new Shell(host);
      shell.exec('ip address add 192.168.60.11/24 dev eth0', { write: () => {} }, () => {});
      expect(natHostReady(network, host)).toBe(false);
      shell.exec('ip route add default via 192.168.60.1 dev eth0', { write: () => {} }, () => {});
      expect(host.interfaces[0].gateway).toBeNull();
      expect(natHostReady(network, host)).toBe(true);
    } finally { disposeNetwork(network); }
  });

  it('requires a new browser socket and the exact NAT outcome for each client', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      const first = network.devices.get('PC1') as Host, peer = addPc2(network);
      network.connect(peer.id, 'lan');
      const browse = (host: Host, translated: boolean) => {
        const previous = new Set(natRouterEntries(network));
        let proved: boolean | undefined;
        requestPage(host, simulatedUrl('http://198.51.100.80')!, (result, port) => {
          proved = natBrowserProof(network, host, result, port, previous, translated);
          expect(natBrowserProof(network, host, result, port, new Set(natRouterEntries(network)), translated)).toBe(false);
        });
        network.scheduler.advanceTo(network.now + 5000);
        return proved;
      };
      expect(browse(first, true)).toBe(true);
      expect(browse(peer, false)).toBe(true);
      expect(browse(peer, true)).toBe(false);
      (network.devices.get('edge') as IpDevice).fw.addNatRule('postrouting', { oif: 'eth1' }, { type: 'masquerade' });
      expect(browse(peer, false)).toBe(false);
      expect(browse(peer, true)).toBe(true);
    } finally { disposeNetwork(network); }
  });
  it('retains linked SYN evidence after capture stops and Conntrack expires between answers', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      const capture = new PacketCapture(() => {});
      capture.start();
      network.onWireTransfer = (transfer, context, trace) => capture.observe(transfer, context, trace?.parentTransferId);
      expect(natCapturedFlow(capture.state.records)).toBe('missing-lan');
      requestPage(network.devices.get('PC1') as IpDevice, simulatedUrl('http://198.51.100.80')!, () => {});
      network.scheduler.advanceTo(network.now + 12_000);
      capture.pause();
      const { records } = capture.state;
      const wan = records.find(r => r.linkId === 'edge-web' && r.kind === 'tcp')!;
      const lan = records.find(r => r.id === wan.parentTransferId)!;
      expect(lan.linkId).toBe('lan-edge');
      expect(records.some(r => r.id > lan.id && r.id < wan.id && r.kind === 'arp')).toBe(true);
      expect(natCapturedFlow(records)).toMatchObject({ local: '192.168.60.10' });
      expect(natCapturedFlow(records.filter(r => r.id < wan.id))).toBe('missing-wan');
      expect(natCapturedFlow(records.filter(r => r.id !== lan.id))).toBe('missing-lan');
      expect(natCapturedFlow(records.map(r => r === wan ? { ...r, parentTransferId: undefined } : r))).toBe('unpaired');
      network.scheduler.advanceTo(network.now + 121_000);
      expect((network.devices.get('edge') as IpDevice).ct.list(network.now)).toHaveLength(0);
      capture.stop();
      expect(natCapturedFlow(capture.state.records)).toMatchObject({ external: '198.51.100.2' });
    } finally { disposeNetwork(network); }
  });

  it.each(['linux', 'windows'] as const)('binds a learner-created %s Host by ID and preserves it through JSON', os => {
    let { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      const signature = natIntroSignature(network);
      const c = addPc2(network); c.os = os; c.name = 'Estação β';
      expect(natIntroSignature(network)).toBe(signature);
      expect(natSecondHost(network)?.id).toBe(c.id);
      network.connect(c.id, 'lan');
      expect(check(network, 1)['nat-before-local'].pass).toBe(true);
      const topology = serializeNetwork(network, {});
      disposeNetwork(network); network = prepareTopologyDocument(topology).network;
      expect(natSecondHost(network, c.id)).toMatchObject({ id: c.id, name: 'Estação β', os });
      const extra = new Host(network, 'extra', 'Extra'); network.devices.set(extra.id, extra);
      expect(natSecondHost(network)).toBeNull();
      expect(natSecondHost(network, c.id)?.id).toBe(c.id);
      expect(natSecondHost(network, 'deleted')).toBeNull();
      const router = network.devices.get('edge') as IpDevice;
      router.fw.nat.postrouting.rules.length = 0;
      expect(natIntroSignature(network)).not.toBe(signature);
    } finally { disposeNetwork(network); }
  });
  it.each([0.25, 1])('shows the whole causal ARP, TCP and HTTP exchange at %s×', speed => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      const portions: Record<string, AnimatedTransfer[]> = {};
      const arrival = (packet: AnimatedTransfer) => packet.visualStart + packet.visualDuration;
      const duration = packetAnimationDuration(speed);
      const shown = new Set<number>();
      let pending: AnimatedTransfer[] = [], visualClock = 0;
      network.onWireTransfer = (transfer, { frame }, trace) => {
        const visual = sequencePacketAnimation(transfer, trace, pending, visualClock, duration);
        pending.push(visual);
        const payload = frame.payload;
        const tcp = payload.kind === 'ipv4' && payload.l4.kind === 'tcp' ? payload.l4 : null;
        const label = payload.kind === 'arp'
          ? (transfer.linkId === 'edge-web' ? 'wan-' : 'lan-') + payload.op
          : tcp?.app?.kind ?? (tcp?.syn ? (tcp.ack ? 'syn-ack' : 'syn') : 'ack');
        (portions[label] ??= []).push(visual);
      };
      let result: BrowserResult | undefined;
      requestPage(network.devices.get('PC1') as IpDevice, simulatedUrl('http://198.51.100.80')!, value => { result = value; });
      // Advance both clocks like the Live renderer and prune expired animations.
      while (visualClock < 20_000 && (!result || pending.length)) {
        visualClock += 16;
        network.scheduler.advanceTo(visualClock);
        for (const packet of pending) if (packetAnimationProgress(packet, visualClock) !== null) shown.add(packet.id);
        pending = pending.filter(packet => arrival(packet) > visualClock);
      }
      expect(result).toMatchObject({ kind: 'http', status: 200 });
      expect(pending).toHaveLength(0);
      const outbound = ['PC1>lan', 'lan>edge', 'edge>web'];
      const inbound = ['web>edge', 'edge>lan', 'lan>PC1'];
      const path = (packets: AnimatedTransfer[]) => packets.map(({ fromDeviceId, toDeviceId }) => fromDeviceId + '>' + toDeviceId);
      for (const label of ['syn', 'ack', 'http-request']) expect(path(portions[label])).toEqual(outbound);
      for (const label of ['syn-ack', 'http-response']) expect(path(portions[label])).toEqual(inbound);
      expect(path(portions['lan-request'])).toEqual(outbound.slice(0, 2));
      expect(path(portions['lan-reply'])).toEqual(inbound.slice(1));
      expect(path(portions['wan-request'])).toEqual(outbound.slice(2));
      expect(path(portions['wan-reply'])).toEqual(inbound.slice(0, 1));
      const transfers = Object.values(portions).flat();
      expect(transfers.every(packet => packet.end - packet.start === 80 && packet.visualDuration === duration)).toBe(true);
      expect(shown).toEqual(new Set(transfers.map(packet => packet.id)));

      const after = (child: AnimatedTransfer, parent: AnimatedTransfer) => {
        expect(child.start).toBeGreaterThanOrEqual(parent.end);
        expect(child.visualStart, `transfer ${child.id} before visual arrival of ${parent.id}`).toBeGreaterThanOrEqual(arrival(parent));
        expect(packetAnimationProgress(child, arrival(parent) - 1)).toBeNull();
        expect(packetAnimationProgress(child, child.visualStart)).toBe(0);
      };
      for (const packets of Object.values(portions)) {
        for (let i = 1; i < packets.length; i++) after(packets[i], packets[i - 1]);
      }
      after(portions['lan-reply'][0], portions['lan-request'].at(-1)!);
      after(portions.syn[0], portions['lan-reply'].at(-1)!);
      after(portions['wan-request'][0], portions.syn[1]);
      after(portions['wan-reply'][0], portions['wan-request'][0]);
      after(portions.syn[2], portions['wan-reply'][0]);
      after(portions['syn-ack'][0], portions.syn[2]);
      after(portions.ack[0], portions['syn-ack'].at(-1)!);
      after(portions['http-request'][0], portions['syn-ack'].at(-1)!);
      after(portions['http-response'][0], portions['http-request'].at(-1)!);
    } finally { disposeNetwork(network); }
  });
  it('keeps one network, observes the missing return path, and restores progress before a real overlapping PAT test', () => {
    let { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      expect(network.devices.has('PC2')).toBe(false);
      const first = check(network, 0);
      expect(first['nat-first-http'].pass).toBe(true);
      expect(check(network, 1)['nat-before-local'].pass).toBe(false);

      addPc2(network); network.connect('PC2', 'lan');
      const outsideSources: number[] = [];
      network.onWireTransfer = (transfer, { frame }) => {
        const packet = frame.payload;
        if (transfer.fromDeviceId === 'edge' && transfer.toDeviceId === 'web' &&
            packet.kind === 'ipv4' && packet.l4.kind === 'tcp' && packet.l4.syn) outsideSources.push(packet.src);
      };
      const second = check(network, 1);
      expect(Object.values(second).map(r => r.pass)).toEqual([true, true, true]);
      expect(outsideSources).toEqual([ip('198.51.100.2'), ip('192.168.60.11')]);
      expect(check(network, 2)['nat-after-pair'].pass).toBe(false);

      const topology = serializeNetwork(network, Object.fromEntries(progressiveNatPat.devices.map(d => [d.id, d])));
      topology.lab = lab;
      topology.labProgress = { step: 2, results: { ...first, ...second }, quiz: {} };
      const prepared = prepareTopologyDocument(JSON.stringify(topology));
      disposeNetwork(network);
      network = prepared.network;
      expect(prepared.document.labProgress).toEqual(topology.labProgress);
      const router = network.devices.get('edge') as IpDevice;
      new Shell(router).exec('iptables -t nat -A POSTROUTING -s 192.168.60.11/32 -o eth1 -j MASQUERADE', { write: () => {} }, () => {});
      const exchange: { role: string; port: number; address: number }[] = [];
      const animations: AnimatedTransfer[] = [];
      network.onWireTransfer = (transfer, { frame }, trace) => {
        animations.push(sequencePacketAnimation(transfer, trace, animations, transfer.start, packetAnimationDuration(0.25)));
        const p = frame.payload;
        if (p.kind !== 'ipv4' || p.l4.kind !== 'tcp' || !p.l4.syn) return;
        if (transfer.fromDeviceId === 'edge' && transfer.toDeviceId === 'web') {
          exchange.push({ role: 'request', port: p.l4.srcPort, address: p.src });
        } else if (transfer.fromDeviceId === 'web' && transfer.toDeviceId === 'edge') {
          exchange.push({ role: 'reply', port: p.l4.dstPort, address: p.dst });
        }
      };
      expect(check(network, 2)).toMatchObject({ 'nat-after-pair': { pass: true } });
      const flows = router.ct.list(network.now).filter(e => e.orig.proto === 'tcp');
      expect(flows.map(e => e.orig.srcPort)).toEqual([40000, 40000]);
      expect(exchange.map(e => e.role)).toEqual(['request', 'request', 'reply', 'reply']);
      expect(new Set(exchange.slice(0, 2).map(e => e.port)).size).toBe(2);
      expect(exchange.every(e => e.address === ip('198.51.100.2'))).toBe(true);
      const firstArp = ['PC1', 'PC2'].map(id => animations.find(p => p.fromDeviceId === id && p.kind === 'arp')!);
      expect(firstArp.map(p => p.visualStart)).toEqual([0, 0]);

      router.fw.nat.postrouting.rules.splice(1);
      expect(check(network, 2)['nat-after-pair'].pass).toBe(false);
    } finally { disposeNetwork(network); }
  });

  it('accepts equivalent SNAT but rejects ordinary routed HTTP as proof of NAT', () => {
    const { network } = prepareTopologyDocument(progressiveNatPat);
    try {
      addPc2(network); network.connect('PC2', 'lan');
      const router = network.devices.get('edge') as IpDevice, server = network.devices.get('web') as IpDevice;
      const rules = router.fw.nat.postrouting.rules;
      rules.length = 0;
      server.addRoute(ip('192.168.60.0'), 24, ip('198.51.100.2'));
      expect(check(network, 2)['nat-after-pair'].pass).toBe(false);
      server.staticRoutes = [];
      router.fw.addNatRule('postrouting', { srcNet: parseCidr('192.168.60.0/24')!, oif: 'eth1' },
        { type: 'snat', addr: ip('198.51.100.2') });
      const final = check(network, 2);
      expect(Object.keys(final)).toEqual(['nat-after-pair']);
      expect(final['nat-after-pair'].pass).toBe(true);
    } finally { disposeNetwork(network); }
  });
});
