import { Device, NetInterface } from './device';
import type { Network } from './network';
import type { EthernetFrame } from './types';
import { BROADCAST_MAC } from './ip';
import type { ScheduledEvent } from './scheduler';

export const MAC_AGE_MS = 300_000;

export const CUSTOM_SWITCH_PORTS = { min: 1, max: 24, default: 8 } as const;

// L2 learning switch with access-port VLANs: every port belongs to exactly
// one VLAN (default 1) and frames never cross VLAN boundaries — two hosts in
// the same subnet but different VLANs cannot even ARP for each other.
export class SwitchDevice extends Device {
  readonly kind: 'switch' | 'ap';
  // MAC table keys are "vlan|mac" so identical MACs stay separated per VLAN.
  macTable = new Map<string, NetInterface>();
  private learnedAt = new Map<string, number>();
  private agingEvent: ScheduledEvent | null = null;

  override invalidateInterface(iface: NetInterface): void {
    for (const [key, port] of this.macTable) if (port === iface) { this.macTable.delete(key); this.learnedAt.delete(key); }
    if (!this.learnedAt.size && this.agingEvent) {
      this.network.scheduler.cancel(this.agingEvent); this.agingEvent = null;
    }
  }

  private ageMacs(): void {
    for (const [key, time] of this.learnedAt) {
      const port = this.macTable.get(key);
      if (!port || !this.interfaces.includes(port) || !port.up || !port.link ||
          this.network.links.get(port.link.id) !== port.link || this.network.now - time >= MAC_AGE_MS) {
        this.macTable.delete(key); this.learnedAt.delete(key);
      }
    }
  }

  private scheduleAging(): void {
    if (this.agingEvent || !this.learnedAt.size || this.disposed) return;
    const next = Math.min(...this.learnedAt.values()) + MAC_AGE_MS;
    this.agingEvent = this.schedule(Math.max(0, next - this.network.now), () => {
      this.agingEvent = null; this.ageMacs(); this.scheduleAging();
    });
  }
  vlans = new Map<string, number>();

  constructor(network: Network, id: string, name: string, kind: 'switch' | 'ap' = 'switch', ports: number = CUSTOM_SWITCH_PORTS.default) {
    super(network, id, name);
    if (kind === 'switch' && (!Number.isInteger(ports) || ports < CUSTOM_SWITCH_PORTS.min || ports > CUSTOM_SWITCH_PORTS.max)) throw new Error('Invalid switch capacity');
    this.kind = kind;
    this.addInterfaces('eth', ports);
  }

  vlanOf(portName: string): number {
    return this.vlans.get(portName) ?? 1;
  }

  // Capacity policy is separate from forwarding; APs remain fixed-capacity.
  portChangeError(delta: 1 | -1): string | null {
    if (this.disposed || this.kind !== 'switch') return 'Portanzahl ist nicht anpassbar.';
    if (delta === 1) return this.interfaces.length >= CUSTOM_SWITCH_PORTS.max ? 'Maximal 24 Ports.' : null;
    if (this.interfaces.length <= CUSTOM_SWITCH_PORTS.min) return 'Mindestens ein Port muss bleiben.';
    const port = this.interfaces[this.interfaces.length - 1];
    if (port.link || [...this.network.links.values()].some(l => l.a === port || l.b === port)) return `${port.name}: Kabel zuerst entfernen.`;
    if (this.vlanOf(port.name) !== 1) return `${port.name}: VLAN zuerst auf 1 setzen.`;
    if (!port.up) return `${port.name}: Admin zuerst auf UP setzen.`;
    if (port.ip || port.ipv4Mode !== 'unconfigured' || port.gateway !== null || port.dns !== null || port.dhcpLease || port.cancelDhcp) return `${port.name}: IP-Konfiguration oder DHCP-Zustand vorhanden.`;
    return null;
  }

  addPort(mac?: string): NetInterface {
    const error = this.portChangeError(1);
    if (error) throw new Error(error);
    const name = `eth${this.interfaces.length}`;
    if (this.getInterface(name)) throw new Error('Portname bereits vorhanden.');
    if (mac && (!/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(mac) || [...this.network.devices.values()].some(d => d.interfaces.some(i => i.mac.toLowerCase() === mac.toLowerCase())))) throw new Error('MAC-Adresse bereits belegt oder ungültig.');
    const port = new NetInterface(this, name, mac ?? this.network.nextMac());
    this.interfaces.push(port);
    return port;
  }

  removeLastPort(): NetInterface {
    const error = this.portChangeError(-1);
    if (error) throw new Error(error);
    const port = this.interfaces.pop()!;
    this.invalidateInterface(port);
    this.vlans.delete(port.name);
    return port;
  }

  receiveFrame(iface: NetInterface, frame: EthernetFrame): void {
    if (this.disposed || !iface.up || !this.interfaces.includes(iface)) return;
    this.ageMacs();
    const vlan = this.vlanOf(iface.name);
    this.macTable.set(`${vlan}|${frame.srcMac}`, iface);
    this.learnedAt.set(`${vlan}|${frame.srcMac}`, this.network.now);
    this.scheduleAging();
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
