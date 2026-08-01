import type { Network } from './network';
import type { EthernetFrame } from './types';
import type { U32 } from './ip';

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
    if (this.up && this.link) this.link.transmit(this, frame);
  }
}

export abstract class Device {
  abstract readonly kind: DeviceKind;
  interfaces: NetInterface[] = [];

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
    const to = this.other(from);
    this.network.emitWire(this, from.device, to.device, frame);
    this.network.scheduler.schedule(this.latency, () => {
      if (to.up) to.device.receiveFrame(to, frame);
    });
  }

  detach(): void {
    this.a.link = null;
    this.b.link = null;
  }
}
