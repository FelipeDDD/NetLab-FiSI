import { expect, it } from 'vitest';
import { restoreNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { IpDevice } from '../engine/ipdevice';
import { Shell } from '../commands/shell';
import { sequencePacketAnimation, type AnimatedTransfer } from '../packetAnimation';
import { STATIC_IDS as I, staticRoutingDocument } from './staticRoutingChapter';

it('audits the actual intermediate failures before revising the learning sequence', () => {
  const net = restoreNetwork(staticRoutingDocument().topology), states: { phase: string; output: string }[] = [];
  const run = (id: string, line: string) => { let output = ''; new Shell(net.devices.get(id) as IpDevice).exec(line, { write: s => output += s }, () => {}); net.scheduler.advanceTo(net.now + 7000); return output; };
  try {
    expect([...net.devices.values()].filter(d => d instanceof IpDevice).every(d => (d as IpDevice).staticRoutes.length === 0)).toBe(true);
    states.push({ phase: 'initial', output: run(I.a, 'ping -c 1 192.168.20.20') });
    run(I.r1, 'ip route add 192.168.20.0/24 via 10.0.12.2');
    states.push({ phase: 'R1 only', output: run(I.a, 'ping -c 1 192.168.20.20') });
    run(I.r2, 'ip route add 192.168.20.0/24 via 10.0.23.2');
    states.push({ phase: 'forward only', output: run(I.a, 'ping -c 1 192.168.20.20') });
    run(I.r3, 'ip route add 192.168.10.0/24 via 10.0.23.1');
    states.push({ phase: 'R3 return only', output: run(I.a, 'ping -c 1 192.168.20.20') });
    run(I.r2, 'ip route add 192.168.10.0/24 via 10.0.12.1');
    states.push({ phase: 'full path', output: run(I.a, 'ping -c 1 192.168.20.20') });
    expect(states[0].output).toContain('From 192.168.10.1');
    states.slice(1, 4).forEach(s => expect(s.output).not.toContain('64 bytes from'));
    expect(states[4].output).toContain('64 bytes from 192.168.20.20');
    console.log('CHAPTER4_INTERMEDIATE_AUDIT=' + JSON.stringify(states));
  } finally { disposeNetwork(net); }
});

it('preserves real ARP/ICMP dependencies in the animation of a cold-cache three-router ping', () => {
  const net = restoreNetwork(staticRoutingDocument().topology), animated: AnimatedTransfer[] = [];
  const replies = new Map<string, AnimatedTransfer>();
  const violations: { id: number; prerequisite: number; start: number; needed: number }[] = [];
  try {
    for (const [id, dest, hop] of [[I.r1, '192.168.20.0/24', '10.0.12.2'], [I.r2, '192.168.20.0/24', '10.0.23.2'], [I.r3, '192.168.10.0/24', '10.0.23.1'], [I.r2, '192.168.10.0/24', '10.0.12.1']]) new Shell(net.devices.get(id) as IpDevice).exec(`ip route add ${dest} via ${hop}`, { write: () => {} }, () => {});
    net.onWireTransfer = (transfer, context, visual) => {
      const animation = sequencePacketAnimation(transfer, visual, animated, transfer.start, 800); animated.push(animation);
      const payload = context.frame.payload;
      if (payload.kind === 'arp' && payload.op === 'reply') replies.set(transfer.toDeviceId + ':' + payload.senderMac, animation);
      if (payload.kind === 'ipv4') {
        const arp = replies.get(transfer.fromDeviceId + ':' + context.frame.dstMac);
        if (arp) {
          expect(transfer.start).toBeGreaterThanOrEqual(arp.end);
          if (animation.visualStart < arp.visualStart + arp.visualDuration) violations.push({ id: transfer.id, prerequisite: arp.id, start: animation.visualStart, needed: arp.visualStart + arp.visualDuration });
        }
      }
      for (const predecessor of [visual?.parentTransferId, visual?.echoRequestTransferId, visual?.arpRequestTransferId]) {
        const parent = animated.find(p => p.id === predecessor); if (parent) expect(transfer.start).toBeGreaterThanOrEqual(parent.end);
      }
    };
    new Shell(net.devices.get(I.a) as IpDevice).exec('ping -c 1 192.168.20.20', { write: () => {} }, () => {}); net.scheduler.advanceTo(7000);
    console.log('CHAPTER4_VISUAL_ARP_AUDIT=' + JSON.stringify(violations));
    expect(violations).toEqual([]);
  } finally { disposeNetwork(net); }
});
