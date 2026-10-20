import type { Network } from './network';
import type { EthernetFrame } from './types';
import type { U32 } from './ip';
import type { ScheduledEvent } from './scheduler';

export type DeviceKind = 'host' | 'switch' | 'router' | 'firewall' | 'server' | 'ap';

export class NetInterface {
  link: Link | null = null;
  up = true;
  ip: { addr: U32; prefix: number } | null = null;

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
    for (const iface of this.interfaces) iface.up = false;
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
