import { Device, NetInterface } from './device';
import type { Network } from './network';
import type { EthernetFrame } from './types';
import { BROADCAST_MAC } from './ip';

export class SwitchDevice extends Device {
  readonly kind = 'switch' as const;
  macTable = new Map<string, NetInterface>();

  constructor(network: Network, id: string, name: string, ports = 8) {
    super(network, id, name);
    this.addInterfaces('eth', ports);
  }

  receiveFrame(iface: NetInterface, frame: EthernetFrame): void {
    this.macTable.set(frame.srcMac, iface);
    if (frame.dstMac === BROADCAST_MAC) {
      this.flood(iface, frame);
      return;
    }
    const out = this.macTable.get(frame.dstMac);
    if (out) {
      if (out !== iface) out.send(frame);
    } else {
      this.flood(iface, frame);
    }
  }

  private flood(except: NetInterface, frame: EthernetFrame): void {
    for (const p of this.interfaces) {
      if (p !== except && p.link) p.send(frame);
    }
  }
}
