import { isClientKind } from './device';
import { wirelessError } from './wirelessRange';
import { Scheduler } from './scheduler';
import { Link, NetInterface as Interface } from './device';
import type { Device, DeviceKind, NetInterface } from './device';
import type { ArpPayload, EthernetFrame, FramePayload, IcmpMessage, Ipv4Packet } from './types';

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

// Borrowed protocol data at transmission time. Observers must not mutate frame;
// consumers retaining it must take their own snapshot. No engine instances here.
export interface WireFrameContext {
  frame: EthernetFrame;
  fromInterface: string;
  toInterface: string;
  fromDeviceName: string;
  toDeviceName: string;
}

// Presentation side channel only: never part of protocol data or capture context.
export interface VisualPingOrigin { deviceId: string; icmpId: number; seq: number; direction: 'request' | 'reply' }
export interface WireVisualTrace { parentTransferId?: number; echoRequestTransferId?: number; arpRequestTransferId?: number; arpPing?: VisualPingOrigin }

// Read-only command lifecycle observation; not protocol/capture data.
export type PingProgress = { deviceId: string; icmpId: number } &
  ({ type: 'started' } | { type: 'attempt'; seq: number; local: boolean; deadline: number } |
   { type: 'settled'; seq: number } | { type: 'finished'; cancelled?: boolean });

const NAME_PREFIX: Record<DeviceKind, string> = {
  host: 'pc', notebook: 'nb', smartphone: 'phone',
  switch: 'sw',
  router: 'r',
  firewall: 'fw',
  server: 'srv',
  ap: 'ap',
};

export class Network {
  enableWireless(hostId: string, mac?: string): NetInterface {
    const host = this.devices.get(hostId);
    if (!host || !isClientKind(host.kind) || host.disposed) throw new Error('Host nicht verfügbar.');
    const existing = host.getInterface('wlan0');
    if (existing) return existing;
    const iface = new Interface(host, 'wlan0', mac ?? this.nextMac());
    iface.medium = 'wireless'; host.interfaces.push(iface); return iface;
  }

  associate(hostId: string, apId: string, opts: { id?: string; ssid?: string; apPort?: string; apMac?: string; apUp?: boolean; apVlan?: number; restore?: boolean } = {}): Link {
    const host = this.devices.get(hostId), ap = this.devices.get(apId);
    const wlan = host?.getInterface('wlan0');
    if (!host || !isClientKind(host.kind) || !ap || ap.kind !== 'ap' || host.disposed || ap.disposed || !wlan || wlan.medium !== 'wireless') throw new Error('WLAN nicht verfügbar.');
    if (wlan.link || host.interfaces.some(i => i.medium === 'ethernet' && i.link)) throw new Error('Zuerst bestehende Verbindung trennen.');
    if (opts.id && this.links.has(opts.id)) throw new Error('Link-ID bereits belegt.');
    const error = wirelessError(ap, host, opts.ssid ?? (ap as Device & { ssid: string }).ssid);
    if (!opts.restore && error) throw new Error(error);
    const name = opts.apPort ?? `wifi-${hostId}`;
    let port = ap.getInterface(name);
    if (port && (port.medium !== 'wireless' || port.link)) throw new Error('WLAN-Port belegt.');
    if (!port) { port = new Interface(ap, name, opts.apMac ?? this.nextMac()); port.medium = 'wireless'; ap.interfaces.push(port); }
    if (opts.apUp !== undefined) port.up = opts.apUp;
    if (opts.apVlan !== undefined) (ap as Device & { vlans: Map<string, number> }).vlans.set(port.name, opts.apVlan);
    const link = new Link(this, opts.id ?? this.allocId('wifi-'), wlan, port);
    link.medium = 'wireless'; link.ssid = opts.ssid ?? (ap as Device & { ssid: string }).ssid;
    this.links.set(link.id, link); return link;
  }
  scheduler = new Scheduler();
  devices = new Map<string, Device>();
  links = new Map<string, Link>();
  onWireTransfer: ((t: WireTransfer, context: WireFrameContext, visual?: WireVisualTrace) => void) | null = null;
  onPingProgress: ((event: PingProgress) => void) | null = null;
  // Asynchronous client configuration changes, not traffic or clock updates.
  onClientConfiguration: (() => void) | null = null;
  private visualArrivals = new WeakMap<FramePayload, Map<string, number>>();
  private visualEchoRequests = new WeakMap<IcmpMessage, number>();
  private visualArpRequests = new WeakMap<ArpPayload, number>();
  private visualPingOrigins = new WeakMap<IcmpMessage, VisualPingOrigin>();
  private visualArpOrigins = new WeakMap<ArpPayload, VisualPingOrigin>();
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
    let mac: string;
    do {
      const n = ++this.macCounter;
      const b1 = ((n >> 8) & 0xff).toString(16).padStart(2, '0');
      const b0 = (n & 0xff).toString(16).padStart(2, '0');
      mac = `02:00:00:00:${b1}:${b0}`;
    } while ([...this.devices.values()].some((d) => d.interfaces.some((i) => i.mac.toLowerCase() === mac)));
    return mac;
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
    d.dispose();
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
    if (opts.id && this.links.has(opts.id)) throw new Error('link ID already exists');
    if (aId === bId) throw new Error('cannot connect a device to itself');
    const ia = opts.aIface ? a.getInterface(opts.aIface) : a.freeInterface();
    const ib = opts.bIface ? b.getInterface(opts.bIface) : b.freeInterface();
    if (!ia) throw new Error(`${a.name}: no free interface`);
    if (!ib) throw new Error(`${b.name}: no free interface`);
    const error = this.ethernetConnectionError(ia, ib);
    if (error) throw new Error(error);
    const link = new Link(this, opts.id ?? this.allocId('link-'), ia, ib);
    this.links.set(link.id, link);
    return link;
  }

  private ethernetConnectionError(a: NetInterface, b: NetInterface, current?: Link): string | null {
    if (a.device.disposed || b.device.disposed) return 'Gerät nicht verfügbar.';
    if (a.device === b.device) return 'Keine Verbindung zum selben Gerät möglich.';
    if (a.medium !== 'ethernet' || b.medium !== 'ethernet') return 'Ethernet benötigt Ethernet-Interfaces.';
    if ([a.device, b.device].some(d => isClientKind(d.kind) && d.interfaces.some(i => i.medium === 'wireless' && i.link))) return 'WLAN zuerst trennen.';
    if ([a, b].some(i => i.link && i.link !== current)) return 'Schnittstelle bereits belegt.';
    return null;
  }

  // Shared by the chooser and the commit. Previewing never detaches anything.
  reconnectError(linkId: string, end: 'a' | 'b', deviceId: string, ifaceName: string): string | null {
    if (end !== 'a' && end !== 'b') return 'Ungültige Kabelseite.';
    const link = this.links.get(linkId), iface = this.devices.get(deviceId)?.getInterface(ifaceName);
    if (!link || link.a.link !== link || link.b.link !== link) return 'Kabel nicht verfügbar.';
    if (link.medium !== 'ethernet') return 'WLAN-Verbindungen über die WLAN-Einstellungen ändern.';
    if (!iface) return 'Schnittstelle nicht verfügbar.';
    return this.ethernetConnectionError(end === 'a' ? iface : link.a, end === 'b' ? iface : link.b, link);
  }

  reconnect(linkId: string, end: 'a' | 'b', deviceId: string, ifaceName: string): Link {
    const error = this.reconnectError(linkId, end, deviceId, ifaceName);
    if (error) throw new Error(error);
    const link = this.links.get(linkId)!, iface = this.devices.get(deviceId)!.getInterface(ifaceName)!;
    if (link[end] === iface) return link;
    // Cancel in-flight deliveries and invalidate only the affected interfaces.
    // Retain the object, ID, latency and opposite endpoint; never allocate a cable.
    const affected = new Set([link.a, link.b, iface]);
    link.detach();
    for (const port of affected) port.device.invalidatePeer(port);
    link[end] = iface;
    link.a.link = link;
    link.b.link = link;
    return link;
  }

  disconnect(linkId: string): void {
    const l = this.links.get(linkId);
    if (!l) return;
    l.detach();
    this.links.delete(linkId);
    if (l.medium === 'wireless') for (const iface of [l.a, l.b]) if (iface.device.kind === 'ap') {
      iface.device.interfaces = iface.device.interfaces.filter(i => i !== iface);
      (iface.device as Device & { vlans: Map<string, number> }).vlans.delete(iface.name);
    }
  }

  interfaceOwner(iface: NetInterface): Device {
    return iface.device;
  }

  recordVisualArrival(payload: FramePayload, deviceId: string, transferId: number | undefined): void {
    if (transferId === undefined) return;
    let arrivals = this.visualArrivals.get(payload);
    if (!arrivals) { arrivals = new Map(); this.visualArrivals.set(payload, arrivals); }
    arrivals.set(deviceId, transferId);
  }

  inheritVisualArrival(original: FramePayload, forwarded: FramePayload, deviceId: string): void {
    this.recordVisualArrival(forwarded, deviceId, this.visualArrivals.get(original)?.get(deviceId));
  }

  associateVisualEchoReply(request: Ipv4Packet, reply: IcmpMessage, deviceId: string): void {
    const arrival = this.visualArrivals.get(request)?.get(deviceId);
    if (arrival !== undefined) this.visualEchoRequests.set(reply, arrival);
    if (request.l4.kind === 'icmp') {
      const origin = this.visualPingOrigins.get(request.l4.msg);
      if (origin) this.visualPingOrigins.set(reply, { ...origin, direction: 'reply' });
    }
  }

  observeVisualPingOrigin(request: IcmpMessage, deviceId: string): void {
    if (request.type === 'echo-request') this.visualPingOrigins.set(request, { deviceId, icmpId: request.id, seq: request.seq, direction: 'request' });
  }

  associateVisualArpRequest(request: ArpPayload, pendingPacket: Ipv4Packet | undefined): void {
    if (pendingPacket?.l4.kind !== 'icmp') return;
    const origin = this.visualPingOrigins.get(pendingPacket.l4.msg);
    if (origin) this.visualArpOrigins.set(request, origin);
  }

  associateVisualArpReply(request: ArpPayload, reply: ArpPayload, deviceId: string): void {
    const arrival = this.visualArrivals.get(request)?.get(deviceId);
    if (arrival !== undefined) this.visualArpRequests.set(reply, arrival);
    const origin = this.visualArpOrigins.get(request);
    if (origin) this.visualArpOrigins.set(reply, origin);
  }

  emitPingProgress(event: PingProgress): void {
    try { this.onPingProgress?.(event); } catch { /* Observation must not interrupt a command. */ }
  }

  emitWire(link: Link, from: Device, to: Device, frame: EthernetFrame): number | undefined {
    if (!this.onWireTransfer) return;
    const source = link.a.device === from ? link.a : link.b;
    const destination = link.other(source);
    const transfer: WireTransfer = {
      id: ++this.wireCounter,
      linkId: link.id,
      fromDeviceId: from.id,
      toDeviceId: to.id,
      kind: frame.payload.kind === 'arp' ? 'arp' : frame.payload.l4.kind,
      start: this.scheduler.now,
      end: this.scheduler.now + link.latency,
    };
    try {
      const context = {
        frame, fromInterface: source.name, toInterface: destination.name,
        fromDeviceName: from.name, toDeviceName: to.name,
      };
      const parentTransferId = this.visualArrivals.get(frame.payload)?.get(from.id);
      const echoRequestTransferId = frame.payload.kind === 'ipv4' && frame.payload.l4.kind === 'icmp'
        ? this.visualEchoRequests.get(frame.payload.l4.msg) : undefined;
      const arpRequestTransferId = frame.payload.kind === 'arp' ? this.visualArpRequests.get(frame.payload) : undefined;
      const arpPing = frame.payload.kind === 'arp' ? this.visualArpOrigins.get(frame.payload) : undefined;
      if (parentTransferId === undefined && echoRequestTransferId === undefined && arpRequestTransferId === undefined && arpPing === undefined) this.onWireTransfer(transfer, context);
      else this.onWireTransfer(transfer, context, {
        ...(parentTransferId === undefined ? {} : { parentTransferId }),
        ...(echoRequestTransferId === undefined ? {} : { echoRequestTransferId }),
        ...(arpRequestTransferId === undefined ? {} : { arpRequestTransferId }),
        ...(arpPing === undefined ? {} : { arpPing: { ...arpPing } }),
      });
    } catch {
      // Observation must never prevent Link.transmit from scheduling delivery.
    }
    return transfer.id;
  }
}
