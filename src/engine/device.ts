import type { Network } from './network';
import type { EthernetFrame } from './types';
import type { U32 } from './ip';
import type { ScheduledEvent } from './scheduler';
import type { InterfaceIpv4, Ipv4Mode } from './ipv4Config';

export type DeviceKind = 'host' | 'switch' | 'router' | 'firewall' | 'server' | 'ap';

export class NetInterface {
  link: Link | null = null;
  up = true;
  ip: { addr: U32; prefix: number } | null = null;
  private configuredMode: Ipv4Mode | undefined;
  gateway: U32 | null = null;
  dns: U32 | null = null;
  // Runtime ownership, never serialized or replayed by topology history.
  dhcpLease: { serverIp: U32; address: U32 } | null = null;
  cancelDhcp: (() => void) | null = null;
  get ipv4Mode(): Ipv4Mode { return this.configuredMode ?? (this.ip ? 'static' : 'unconfigured'); }
  get ipv4(): InterfaceIpv4 {
    return { mode: this.ipv4Mode, ip: this.ip ? { ...this.ip } : null, gateway: this.gateway, dns: this.dns };
  }
  configureIpv4(value: InterfaceIpv4): void {
    this.cancelDhcp?.();
    this.configuredMode = value.mode;
    this.ip = value.ip ? { ...value.ip } : null;
    this.gateway = value.gateway;
    this.dns = value.dns;
    this.dhcpLease = null;
  }

  constructor(
    public device: Device,
    public name: string,
    public mac: string,
  ) {}

  send(frame: EthernetFrame): void {
    if (!this.device.disposed && this.up && this.link) this.link.transmit(this, frame);
  }
}

export abstract class Device {
  abstract readonly kind: DeviceKind;
  interfaces: NetInterface[] = [];
  private removed = false;
  get disposed(): boolean { return this.removed; }

  schedule(delay: number, fn: () => void): ScheduledEvent {
    return this.network.scheduler.schedule(delay, () => { if (!this.disposed) fn(); }, this);
  }

  dispose(): void {
    this.removed = true;
    this.network.scheduler.cancelOwner(this);
    for (const iface of this.interfaces) { iface.cancelDhcp?.(); iface.up = false; }
  }

  constructor(
    public network: Network,
    public id: string,
    public name: string,
  ) {}

  protected addInterfaces(prefix: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.interfaces.push(new NetInterface(this, `${prefix}${i}`, this.network.nextMac()));
    }
  }

  getInterface(name: string): NetInterface | null {
    return this.interfaces.find((i) => i.name === name) ?? null;
  }

  freeInterface(): NetInterface | null {
    return this.interfaces.find((i) => !i.link) ?? null;
  }

  abstract receiveFrame(iface: NetInterface, frame: EthernetFrame): void;
}

export class Link {
  constructor(
    public network: Network,
    public id: string,
    public a: NetInterface,
    public b: NetInterface,
    public latency = 80,
  ) {
    a.link = this;
    b.link = this;
  }

  other(i: NetInterface): NetInterface {
    return i === this.a ? this.b : this.a;
  }

  transmit(from: NetInterface, frame: EthernetFrame): void {
    if (this.network.links.get(this.id) !== this || this.a.link !== this || this.b.link !== this) return;
    const to = this.other(from);
    const transferId = this.network.emitWire(this, from.device, to.device, frame);
    this.network.scheduler.schedule(this.latency, () => {
      if (this.network.links.get(this.id) === this && to.link === this && to.up && !to.device.disposed) {
        this.network.recordVisualArrival(frame.payload, to.device.id, transferId);
        to.device.receiveFrame(to, frame);
      }
    }, this);
  }

  detach(): void {
    this.network.scheduler.cancelOwner(this);
    this.a.link = null;
    this.b.link = null;
  }
}
