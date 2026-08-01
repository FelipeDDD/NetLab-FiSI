import { Scheduler } from './scheduler';
import { Link } from './device';
import type { Device, DeviceKind, NetInterface } from './device';
import type { EthernetFrame } from './types';

// Emitted for every frame that crosses a link; the UI turns these into
// animated packets travelling along the corresponding edge.
export interface WireTransfer {
  id: number;
  linkId: string;
  fromDeviceId: string;
  toDeviceId: string;
  kind: 'arp' | 'icmp' | 'tcp' | 'udp';
  start: number;
  end: number;
}

const NAME_PREFIX: Record<DeviceKind, string> = {
  host: 'pc',
  switch: 'sw',
  router: 'r',
  firewall: 'fw',
  server: 'srv',
  ap: 'ap',
};

export class Network {
  scheduler = new Scheduler();
  devices = new Map<string, Device>();
  links = new Map<string, Link>();
  onWireTransfer: ((t: WireTransfer) => void) | null = null;
  // Fired when a declared firewall chain drops or rejects a packet — the UI
  // flashes the device so students see *where* traffic died.
  onFwDrop: ((deviceId: string) => void) | null = null;

  private macCounter = 0;
  private wireCounter = 0;
  private idCounter = 0;

  get now(): number {
    return this.scheduler.now;
  }

  nextMac(): string {
    const n = ++this.macCounter;
    const b1 = ((n >> 8) & 0xff).toString(16).padStart(2, '0');
    const b0 = (n & 0xff).toString(16).padStart(2, '0');
    return `02:00:00:00:${b1}:${b0}`;
  }

  allocId(prefix: string): string {
    let id: string;
    do {
      id = `${prefix}${++this.idCounter}`;
    } while (this.devices.has(id) || this.links.has(id));
    return id;
  }

  allocName(kind: DeviceKind): string {
    const used = new Set([...this.devices.values()].map((d) => d.name));
    let n = 0;
    let name: string;
    do {
      name = `${NAME_PREFIX[kind]}${++n}`;
    } while (used.has(name));
    return name;
  }

  register(device: Device): void {
    this.devices.set(device.id, device);
  }

  removeDevice(id: string): string[] {
    const d = this.devices.get(id);
    if (!d) return [];
    const removedLinks: string[] = [];
    for (const iface of d.interfaces) {
      if (iface.link) {
        removedLinks.push(iface.link.id);
        this.disconnect(iface.link.id);
      }
    }
    this.devices.delete(id);
    return removedLinks;
  }

  connect(
    aId: string,
    bId: string,
    opts: { id?: string; aIface?: string; bIface?: string } = {},
  ): Link {
    const a = this.devices.get(aId);
    const b = this.devices.get(bId);
    if (!a || !b) throw new Error('unknown device');
    if (aId === bId) throw new Error('cannot connect a device to itself');
    const ia = opts.aIface ? a.getInterface(opts.aIface) : a.freeInterface();
    const ib = opts.bIface ? b.getInterface(opts.bIface) : b.freeInterface();
    if (!ia) throw new Error(`${a.name}: no free interface`);
    if (!ib) throw new Error(`${b.name}: no free interface`);
    if (ia.link || ib.link) throw new Error('interface already connected');
    const link = new Link(this, opts.id ?? this.allocId('link-'), ia, ib);
    this.links.set(link.id, link);
    return link;
  }

  disconnect(linkId: string): void {
    const l = this.links.get(linkId);
    if (!l) return;
    l.detach();
    this.links.delete(linkId);
  }

  interfaceOwner(iface: NetInterface): Device {
    return iface.device;
  }

  emitWire(link: Link, from: Device, to: Device, frame: EthernetFrame): void {
    if (!this.onWireTransfer) return;
    this.onWireTransfer({
      id: ++this.wireCounter,
      linkId: link.id,
      fromDeviceId: from.id,
      toDeviceId: to.id,
      kind: frame.payload.kind === 'arp' ? 'arp' : frame.payload.l4.kind,
      start: this.scheduler.now,
      end: this.scheduler.now + link.latency,
    });
  }
}
