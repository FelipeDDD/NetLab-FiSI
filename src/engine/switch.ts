import { Device, NetInterface } from './device';
import type { Network } from './network';
import type { EthernetFrame } from './types';
import { BROADCAST_MAC } from './ip';

// L2 learning switch with access-port VLANs: every port belongs to exactly
// one VLAN (default 1) and frames never cross VLAN boundaries — two hosts in
// the same subnet but different VLANs cannot even ARP for each other.
export class SwitchDevice extends Device {
  readonly kind: 'switch' | 'ap';
  // MAC table keys are "vlan|mac" so identical MACs stay separated per VLAN.
  macTable = new Map<string, NetInterface>();
  vlans = new Map<string, number>();

  constructor(network: Network, id: string, name: string, kind: 'switch' | 'ap' = 'switch', ports = 8) {
    super(network, id, name);
    this.kind = kind;
    this.addInterfaces('eth', ports);
  }

  vlanOf(portName: string): number {
    return this.vlans.get(portName) ?? 1;
  }

  receiveFrame(iface: NetInterface, frame: EthernetFrame): void {
    const vlan = this.vlanOf(iface.name);
    this.macTable.set(`${vlan}|${frame.srcMac}`, iface);
    if (frame.dstMac === BROADCAST_MAC) {
      this.flood(vlan, iface, frame);
      return;
    }
    const out = this.macTable.get(`${vlan}|${frame.dstMac}`);
    if (out && this.vlanOf(out.name) === vlan) {
      if (out !== iface) out.send(frame);
    } else {
      this.flood(vlan, iface, frame);
    }
  }

  private flood(vlan: number, except: NetInterface, frame: EthernetFrame): void {
    for (const p of this.interfaces) {
      if (p !== except && p.link && this.vlanOf(p.name) === vlan) p.send(frame);
    }
  }
}

// A wireless access point behaves as a bridge for its associated clients;
// links to hosts render as wireless (dashed) in the UI.
export class ApDevice extends SwitchDevice {
  ssid = 'netsim-wifi';

  constructor(network: Network, id: string, name: string, ports = 8) {
    super(network, id, name, 'ap', ports);
  }
}
