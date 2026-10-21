import { expect, it } from 'vitest';
import { Network, type WireFrameContext, type WireTransfer, type WireVisualTrace } from './network';
import { createDevice } from './factory';
import type { IpDevice } from './ipdevice';
import { parseCidr, parseIp } from './ip';
import { sequencePacketAnimation, type AnimatedTransfer } from '../packetAnimation';

for (const middle of ['switch', 'router', 'firewall'] as const) {
  it(`traces simultaneous packets through a ${middle} without linking replies or changing delivery`, () => {
    const net = new Network(), a = createDevice(net, 'host') as IpDevice;
    const relay = createDevice(net, middle), b = createDevice(net, 'host') as IpDevice;
    net.connect(a.id, relay.id); net.connect(b.id, relay.id);
    a.getInterface('eth0')!.ip = parseCidr('10.0.0.1/24')!;
    const routed = middle !== 'switch', destination = routed ? '10.0.1.2' : '10.0.0.2';
    b.getInterface('eth0')!.ip = parseCidr(`${destination}/24`)!;
    if (routed) {
      relay.getInterface('eth0')!.ip = parseCidr('10.0.0.254/24')!;
      relay.getInterface('eth1')!.ip = parseCidr('10.0.1.254/24')!;
      a.addRoute(0, 0, parseIp('10.0.0.254')!); b.addRoute(0, 0, parseIp('10.0.1.254')!);
    }
    if (middle === 'firewall') {
      const fw = (relay as IpDevice).fw;
      fw.ensureIptablesTable('nat'); fw.addNatRule('postrouting', { oif: 'eth1' }, { type: 'masquerade' });
    }
    const transmissions: { transfer: WireTransfer; context: WireFrameContext; trace?: WireVisualTrace }[] = [];
    const visuals: AnimatedTransfer[] = [], replies: number[] = [];
    net.onWireTransfer = (transfer, context, trace) => {
      transmissions.push({ transfer, context, trace });
      // The UI may observe many real hops during one visual loop iteration.
      visuals.push(sequencePacketAnimation(transfer, trace, visuals, 0, 1000)!);
    };
    for (const id of [17, 18]) {
      a.onIcmp(id, (event) => { if (event.type === 'reply') replies.push(id); });
      expect(a.sendEcho(parseIp(destination)!, id, 1)).toBeNull();
    }
    net.scheduler.advanceTo(2000);
    expect(replies).toEqual([17, 18]);
    expect(transmissions.every(({ transfer }) => transfer.end - transfer.start === 80)).toBe(true);
    for (const id of [17, 18]) {
      const echo = (type: string) => transmissions.filter(({ context }) => {
        const p = context.frame.payload;
        return p.kind === 'ipv4' && p.l4.kind === 'icmp' && 'id' in p.l4.msg && p.l4.msg.id === id && p.l4.msg.type === type;
      });
      const requests = echo('echo-request'), responses = echo('echo-reply');
      expect(requests).toHaveLength(2); expect(responses).toHaveLength(2);
      expect(requests[0].trace).toBeUndefined();
      expect(responses[0].trace).toEqual({ echoRequestTransferId: requests[1].transfer.id });
      expect(requests[1].trace).toEqual({ parentTransferId: requests[0].transfer.id });
      expect(responses[1].trace).toEqual({ parentTransferId: responses[0].transfer.id, echoRequestTransferId: requests[1].transfer.id });
      const first = visuals.find((p) => p.id === requests[0].transfer.id)!;
      const second = visuals.find((p) => p.id === requests[1].transfer.id)!;
      expect(first.visualStart).toBe(0); expect(second.visualStart).toBe(1000);
      if (routed) expect(requests[1].context.frame.payload).not.toBe(requests[0].context.frame.payload);
      if (middle === 'firewall') expect(requests[1].context.frame.payload).toMatchObject({ src: parseIp('10.0.1.254'), ttl: 63 });
      // Capture and protocol payloads never contain visual metadata.
      expect(requests[1].context).not.toHaveProperty('parentTransferId');
      expect(requests[1].context.frame.payload).not.toHaveProperty('parentTransferId');
      expect(requests[1].transfer).not.toHaveProperty('parentTransferId');
      expect(responses[1].context).not.toHaveProperty('echoRequestTransferId');
      expect(responses[1].context.frame.payload).not.toHaveProperty('echoRequestTransferId');
      expect(responses[1].transfer).not.toHaveProperty('echoRequestTransferId');
    }
  });
}
