import { Device, NetInterface } from './device';
import type { ScheduledEvent } from './scheduler';
import type {
  AppData,
  ArpPayload,
  DhcpApp,
  EthernetFrame,
  IcmpMessage,
  Ipv4Packet,
  L4,
  OriginalRef,
  TcpSegment,
  UdpDatagram,
} from './types';
import { BROADCAST_IP, BROADCAST_MAC, ipToString, networkOf, type U32 } from './ip';
import { FirewallModel, type EvalResult, type FilterHook } from './firewall';
import { ConnTrack, tupleOf } from './conntrack';
import { filterRuleText } from './firewall-fmt';

export const DEFAULT_TTL = 64;
const ARP_RETRY_MS = 500;
const ARP_MAX_TRIES = 3;
const FW_LOG_MAX = 80;
const DNS_TIMEOUT_MS = 2500;
// RIP timers are compressed versus the RFC's 30s/180s so convergence is
// watchable in class without waiting minutes of simulated time.
const RIP_INTERVAL_MS = 10_000;
const RIP_TIMEOUT_MS = 45_000;
const RIP_INFINITY = 16;

// Events delivered to a ping/traceroute session registered under an ICMP id.
export type IcmpEvent =
  | { type: 'reply'; from: U32; seq: number; ttl: number }
  | { type: 'time-exceeded'; from: U32; seq: number | null }
  | { type: 'unreachable'; from: U32; seq: number | null; code: 'net' | 'host' | 'port' }
  | { type: 'send-error'; seq: number | null; message: string };

export type SocketResult = 'open' | 'refused' | 'timeout' | 'unreachable';

export type TcpSessionEvent =
  | { type: 'open' }
  | { type: 'refused' }
  | { type: 'unreachable' }
  | { type: 'data'; app: AppData };

export type DnsResult = U32 | null | 'timeout' | 'refused';

export interface Route {
  dest: U32;
  prefix: number;
  via: U32 | null;
  ifaceName: string;
  kind: 'connected' | 'static' | 'rip';
  metric?: number;
}

interface RipRoute {
  dest: U32;
  prefix: number;
  via: U32;
  ifaceName: string;
  metric: number;
  learnedAt: number;
}

export interface ArpEntry {
  mac: string;
  ifaceName: string;
  at: number;
}

export interface FwLogEntry {
  t: number;
  hook: FilterHook;
  verdict: string;
  rule: string; // matched rule text, or "policy accept/drop"
  pkt: string;
}

export interface DhcpServerConfig {
  enabled: boolean;
  rangeStart: U32;
  rangeEnd: U32;
  router: U32 | null;
  dns: U32 | null;
  leases: Map<string, U32>; // client MAC -> leased address
}

export interface DnsServerConfig {
  enabled: boolean;
  records: Map<string, U32>; // lowercased name -> address
}

export interface HttpServerConfig {
  enabled: boolean;
  port: number;
  body: string;
}

interface PendingArp {
  iface: NetInterface;
  queue: Ipv4Packet[];
  tries: number;
  timer: ScheduledEvent | null;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

function refOf(pkt: Ipv4Packet): OriginalRef {
  const l4 = pkt.l4;
  if (l4.kind === 'tcp' || l4.kind === 'udp') {
    return {
      src: pkt.src,
      dst: pkt.dst,
      proto: l4.kind,
      icmpId: null,
      icmpSeq: null,
      srcPort: l4.srcPort,
      dstPort: l4.dstPort,
    };
  }
  const msg = l4.msg;
  const hasIds = msg.type === 'echo-request' || msg.type === 'echo-reply';
  return {
    src: pkt.src,
    dst: pkt.dst,
    proto: 'icmp',
    icmpId: hasIds ? msg.id : null,
    icmpSeq: hasIds ? msg.seq : null,
    srcPort: null,
    dstPort: null,
  };
}

function isIcmpError(pkt: Ipv4Packet): boolean {
  return pkt.l4.kind === 'icmp' && (pkt.l4.msg.type === 'time-exceeded' || pkt.l4.msg.type === 'dest-unreachable');
}

export function summarizePacket(pkt: Ipv4Packet): string {
  const l4 = pkt.l4;
  if (l4.kind === 'tcp') {
    const flags = [l4.syn && 'SYN', l4.ack && 'ACK', l4.rst && 'RST', l4.fin && 'FIN']
      .filter(Boolean)
      .join(',');
    return `tcp ${ipToString(pkt.src)}:${l4.srcPort} > ${ipToString(pkt.dst)}:${l4.dstPort}${flags ? ` [${flags}]` : ''}`;
  }
  if (l4.kind === 'udp')
    return `udp ${ipToString(pkt.src)}:${l4.srcPort} > ${ipToString(pkt.dst)}:${l4.dstPort}`;
  return `icmp ${l4.msg.type} ${ipToString(pkt.src)} > ${ipToString(pkt.dst)}`;
}

export abstract class IpDevice extends Device {
  forwarding = false;
  arpTable = new Map<U32, ArpEntry>();
  staticRoutes: Route[] = [];
  fw = new FirewallModel();
  ct = new ConnTrack();
  fwLog: FwLogEntry[] = [];
  // "Services" are persistent open ports (lab targets); nc -l adds live listeners.
  services = { tcp: new Set<number>(), udp: new Set<number>() };
  ncTcp = new Map<number, (msg: string) => void>();
  ncUdp = new Map<number, (msg: string) => void>();
  // Phase-3 services and client settings.
  nameserver: U32 | null = null;
  dhcpServer: DhcpServerConfig | null = null;
  dnsServer: DnsServerConfig | null = null;
  httpServer: HttpServerConfig | null = null;
  // DHCP client sessions (dhclient) register here to hear offers/acks.
  dhcpListeners = new Set<(app: DhcpApp) => void>();
  ripEnabled = false;
  private ripRoutes: RipRoute[] = [];
  private ripScheduled = false;

  private pendingArp = new Map<U32, PendingArp>();
  private icmpListeners = new Map<number, (ev: IcmpEvent) => void>();
  private icmpIdSeq = 0;
  private tcpSessions = new Map<string, (ev: TcpSessionEvent) => void>();
  private udpSessions = new Map<string, (r: SocketResult) => void>();
  private dnsPending = new Map<number, { finish: (r: DnsResult) => void }>();
  private ephemeralPort = 39999;
  private dnsQidSeq = 0;
  private dhcpXidSeq = 0;

  allocIcmpId(): number {
    return ++this.icmpIdSeq;
  }

  nextDhcpXid(): number {
    return ++this.dhcpXidSeq;
  }

  onIcmp(id: number, fn: (ev: IcmpEvent) => void): void {
    this.icmpListeners.set(id, fn);
  }

  offIcmp(id: number): void {
    this.icmpListeners.delete(id);
  }

  myIps(): U32[] {
    return this.interfaces.filter((i) => i.ip).map((i) => i.ip!.addr);
  }

  hasIp(ip: U32): boolean {
    return this.interfaces.some((i) => i.ip && i.ip.addr === ip);
  }

  routes(): Route[] {
    const rs: Route[] = [];
    for (const i of this.interfaces) {
      if (i.up && i.ip) {
        rs.push({
          dest: networkOf(i.ip.addr, i.ip.prefix),
          prefix: i.ip.prefix,
          via: null,
          ifaceName: i.name,
          kind: 'connected',
        });
      }
    }
    rs.push(...this.staticRoutes);
    for (const r of this.freshRipRoutes()) {
      rs.push({ dest: r.dest, prefix: r.prefix, via: r.via, ifaceName: r.ifaceName, kind: 'rip', metric: r.metric });
    }
    return rs;
  }

  private freshRipRoutes(): RipRoute[] {
    const now = this.network.now;
    this.ripRoutes = this.ripRoutes.filter((r) => now - r.learnedAt < RIP_TIMEOUT_MS);
    return this.ripRoutes;
  }

  // ---------- RIP ----------

  enableRip(on: boolean): void {
    this.ripEnabled = on;
    if (on && !this.ripScheduled) this.ripTick();
    if (!on) this.ripRoutes = [];
  }

  private ripTick(): void {
    if (!this.ripEnabled) {
      this.ripScheduled = false;
      return;
    }
    this.ripScheduled = true;
    for (const iface of this.interfaces) {
      if (iface.up && iface.link && iface.ip) this.advertiseRip(iface);
    }
    this.network.scheduler.schedule(RIP_INTERVAL_MS, () => this.ripTick());
  }

  private advertiseRip(iface: NetInterface): void {
    const entries: { dest: U32; prefix: number; metric: number }[] = [];
    for (const i of this.interfaces) {
      // Split horizon: never advertise a network back onto its own segment.
      if (i === iface || !i.up || !i.ip) continue;
      entries.push({ dest: networkOf(i.ip.addr, i.ip.prefix), prefix: i.ip.prefix, metric: 1 });
    }
    for (const r of this.freshRipRoutes()) {
      if (r.ifaceName === iface.name) continue;
      entries.push({ dest: r.dest, prefix: r.prefix, metric: r.metric });
    }
    if (!entries.length) return;
    this.sendBroadcastUdp(iface, iface.ip!.addr, 520, 520, { kind: 'rip', routes: entries });
  }

  private handleRip(app: { routes: { dest: U32; prefix: number; metric: number }[] }, iif: string, from: U32): void {
    const now = this.network.now;
    for (const e of app.routes) {
      const metric = Math.min(e.metric + 1, RIP_INFINITY);
      // Locally-known networks always win over anything learned.
      const isConnected = this.interfaces.some(
        (i) => i.up && i.ip && networkOf(i.ip.addr, i.ip.prefix) === e.dest && i.ip.prefix === e.prefix,
      );
      const isStatic = this.staticRoutes.some((r) => r.dest === e.dest && r.prefix === e.prefix);
      if (isConnected || isStatic) continue;
      const existing = this.freshRipRoutes().find((r) => r.dest === e.dest && r.prefix === e.prefix);
      if (metric >= RIP_INFINITY) {
        if (existing && existing.via === from) {
          this.ripRoutes = this.ripRoutes.filter((r) => r !== existing);
        }
        continue;
      }
      if (!existing) {
        this.ripRoutes.push({ dest: e.dest, prefix: e.prefix, via: from, ifaceName: iif, metric, learnedAt: now });
      } else if (existing.via === from || metric < existing.metric) {
        existing.via = from;
        existing.ifaceName = iif;
        existing.metric = metric;
        existing.learnedAt = now;
      }
    }
  }

  lookupRoute(dst: U32): Route | null {
    let best: Route | null = null;
    for (const r of this.routes()) {
      if (networkOf(dst, r.prefix) !== r.dest) continue;
      const iface = this.getInterface(r.ifaceName);
      if (!iface || !iface.up || !iface.link) continue;
      if (!best || r.prefix > best.prefix) best = r;
    }
    return best;
  }

  addIp(ifaceName: string, addr: U32, prefix: number): string | null {
    const iface = this.getInterface(ifaceName);
    if (!iface) return `Cannot find device "${ifaceName}"`;
    if (iface.ip && iface.ip.addr === addr && iface.ip.prefix === prefix)
      return 'RTNETLINK answers: File exists';
    if (iface.ip)
      return `netsim: one address per interface in phase 1 — "ip address del ${ifaceName}'s current address" first`;
    iface.ip = { addr, prefix };
    return null;
  }

  delIp(ifaceName: string, addr: U32, prefix: number): string | null {
    const iface = this.getInterface(ifaceName);
    if (!iface) return `Cannot find device "${ifaceName}"`;
    if (!iface.ip || iface.ip.addr !== addr || iface.ip.prefix !== prefix)
      return 'RTNETLINK answers: Cannot assign requested address';
    iface.ip = null;
    return null;
  }

  addRoute(dest: U32, prefix: number, via: U32 | null, dev?: string): string | null {
    let ifaceName = dev ?? null;
    if (ifaceName && !this.getInterface(ifaceName)) return `Cannot find device "${ifaceName}"`;
    if (!ifaceName) {
      if (via === null) return 'Error: either "via" or "dev" is required.';
      const r = this.lookupRoute(via);
      if (!r || r.kind !== 'connected') return 'Error: Nexthop has invalid gateway.';
      ifaceName = r.ifaceName;
    }
    if (this.staticRoutes.some((r) => r.dest === dest && r.prefix === prefix))
      return 'RTNETLINK answers: File exists';
    this.staticRoutes.push({ dest: networkOf(dest, prefix), prefix, via, ifaceName, kind: 'static' });
    return null;
  }

  delRoute(dest: U32, prefix: number): string | null {
    const i = this.staticRoutes.findIndex(
      (r) => r.dest === networkOf(dest, prefix) && r.prefix === prefix,
    );
    if (i < 0) return 'RTNETLINK answers: No such process';
    this.staticRoutes.splice(i, 1);
    return null;
  }

  // ---------- sending (local origin) ----------

  sendEcho(dst: U32, id: number, seq: number, ttl = DEFAULT_TTL): string | null {
    return this.sendL4(dst, { kind: 'icmp', msg: { type: 'echo-request', id, seq } }, { ttl });
  }

  sendIcmp(dst: U32, msg: IcmpMessage, opts: { ttl?: number; srcOverride?: U32 } = {}): string | null {
    return this.sendL4(dst, { kind: 'icmp', msg }, opts);
  }

  sendL4(dst: U32, l4: L4, opts: { ttl?: number; srcOverride?: U32 } = {}): string | null {
    if (this.hasIp(dst)) {
      // Loopback-style delivery to our own address skips wire and firewall.
      const pkt: Ipv4Packet = {
        kind: 'ipv4',
        src: opts.srcOverride ?? dst,
        dst,
        ttl: opts.ttl ?? DEFAULT_TTL,
        l4,
      };
      this.network.scheduler.schedule(1, () => this.deliverLocal(pkt));
      return null;
    }
    const route = this.lookupRoute(dst);
    if (!route) return 'Network is unreachable';
    const iface = this.getInterface(route.ifaceName)!;
    const src = opts.srcOverride ?? iface.ip?.addr;
    if (src === undefined) return 'Network is unreachable';
    let pkt: Ipv4Packet = { kind: 'ipv4', src, dst, ttl: opts.ttl ?? DEFAULT_TTL, l4 };

    const now = this.network.now;
    const proc = this.ct.process(pkt, now);
    pkt = proc.pkt;
    const res = this.fw.evaluate('output', pkt, { oif: route.ifaceName, ctState: proc.state });
    this.logFw(res, pkt);
    if (res.verdict !== 'accept') return 'Operation not permitted';

    if (proc.dir === 'none' && proc.state === 'new') {
      const origTuple = tupleOf(pkt);
      const nr = this.fw.evalNat('postrouting', pkt, { oif: route.ifaceName, ctState: 'new' });
      if (nr) pkt = this.applySnat(pkt, nr.action, iface);
      const trans = tupleOf(pkt);
      if (origTuple && trans) this.ct.confirm(origTuple, trans, now);
    }
    this.routePacket(pkt, route);
    return null;
  }

  // DHCP and RIP speak as raw L2 broadcasts, bypassing routing (but still
  // subject to the OUTPUT chain).
  sendBroadcastUdp(iface: NetInterface, srcIp: U32, srcPort: number, dstPort: number, app: AppData): boolean {
    if (!iface.up || !iface.link) return false;
    const pkt: Ipv4Packet = {
      kind: 'ipv4',
      src: srcIp,
      dst: BROADCAST_IP,
      ttl: DEFAULT_TTL,
      l4: { kind: 'udp', srcPort, dstPort, app },
    };
    const res = this.fw.evaluate('output', pkt, { oif: iface.name, ctState: 'new' });
    this.logFw(res, pkt);
    if (res.verdict !== 'accept') return false;
    iface.send({ srcMac: iface.mac, dstMac: BROADCAST_MAC, payload: pkt });
    return true;
  }

  sendDhcpClient(iface: NetInterface, app: DhcpApp): boolean {
    return this.sendBroadcastUdp(iface, 0, 68, 67, app);
  }

  // ---------- TCP / UDP sockets ----------

  tcpListening(port: number): boolean {
    return (
      this.services.tcp.has(port) ||
      this.ncTcp.has(port) ||
      (this.httpServer?.enabled === true && this.httpServer.port === port)
    );
  }

  udpListening(port: number): boolean {
    return (
      this.services.udp.has(port) ||
      this.ncUdp.has(port) ||
      (port === 53 && this.dnsServer?.enabled === true) ||
      (port === 520 && this.ripEnabled)
    );
  }

  openTcp(
    dst: U32,
    port: number,
    onEvent: (ev: TcpSessionEvent) => void,
  ): { srcPort: number; close: () => void; error: string | null } {
    const srcPort = ++this.ephemeralPort;
    const key = `${srcPort}|${dst}|${port}`;
    this.tcpSessions.set(key, onEvent);
    const close = () => this.tcpSessions.delete(key);
    const err = this.sendL4(dst, {
      kind: 'tcp',
      srcPort,
      dstPort: port,
      syn: true,
      ack: false,
      rst: false,
      fin: false,
    });
    if (err) {
      close();
      return { srcPort, close, error: err };
    }
    return { srcPort, close, error: null };
  }

  connectTcp(dst: U32, port: number, timeoutMs: number, cb: (r: SocketResult) => void): string | null {
    let finished = false;
    const finish = (r: SocketResult) => {
      if (finished) return;
      finished = true;
      conn.close();
      cb(r);
    };
    const conn = this.openTcp(dst, port, (ev) => {
      if (ev.type === 'open') finish('open');
      else if (ev.type === 'refused') finish('refused');
      else if (ev.type === 'unreachable') finish('unreachable');
    });
    if (conn.error) return conn.error;
    this.network.scheduler.schedule(timeoutMs, () => finish('timeout'));
    return null;
  }

  probeUdp(dst: U32, port: number, timeoutMs: number, cb: (r: SocketResult) => void): string | null {
    const srcPort = ++this.ephemeralPort;
    const key = `${srcPort}|${dst}|${port}`;
    let finished = false;
    const finish = (r: SocketResult) => {
      if (finished) return;
      finished = true;
      this.udpSessions.delete(key);
      cb(r);
    };
    this.udpSessions.set(key, finish);
    const err = this.sendL4(dst, { kind: 'udp', srcPort, dstPort: port });
    if (err) {
      this.udpSessions.delete(key);
      return err;
    }
    // No ICMP error within the window ⇒ open|filtered, like a real UDP probe.
    this.network.scheduler.schedule(timeoutMs, () => finish('open'));
    return null;
  }

  httpGet(
    dst: U32,
    port: number,
    path: string,
    host: string,
    timeoutMs: number,
    cb: (
      res:
        | { ok: true; status: number; reason: string; body: string }
        | { ok: false; error: 'refused' | 'timeout' | 'unreachable' | 'empty' | string },
    ) => void,
    onConnect?: () => void,
  ): string | null {
    let finished = false;
    let connected = false;
    const finish = (res: Parameters<typeof cb>[0]) => {
      if (finished) return;
      finished = true;
      conn.close();
      cb(res);
    };
    const conn = this.openTcp(dst, port, (ev) => {
      if (ev.type === 'open') {
        connected = true;
        onConnect?.();
        this.sendL4(dst, {
          kind: 'tcp',
          srcPort: conn.srcPort,
          dstPort: port,
          syn: false,
          ack: true,
          rst: false,
          fin: false,
          app: { kind: 'http-request', method: 'GET', path, host },
        });
      } else if (ev.type === 'data' && ev.app.kind === 'http-response') {
        finish({ ok: true, status: ev.app.status, reason: ev.app.reason, body: ev.app.body });
      } else if (ev.type === 'refused') {
        finish({ ok: false, error: 'refused' });
      } else if (ev.type === 'unreachable') {
        finish({ ok: false, error: 'unreachable' });
      }
    });
    if (conn.error) return conn.error;
    this.network.scheduler.schedule(timeoutMs, () =>
      finish({ ok: false, error: connected ? 'empty' : 'timeout' }),
    );
    return null;
  }

  resolveDns(name: string, server: U32, cb: (r: DnsResult) => void): void {
    const qid = ++this.dnsQidSeq;
    const srcPort = ++this.ephemeralPort;
    const sessKey = `${srcPort}|${server}|53`;
    let finished = false;
    const finish = (r: DnsResult) => {
      if (finished) return;
      finished = true;
      this.dnsPending.delete(qid);
      this.udpSessions.delete(sessKey);
      cb(r);
    };
    this.dnsPending.set(qid, { finish });
    // ICMP errors (closed port / unreachable) surface through the UDP session.
    this.udpSessions.set(sessKey, (r) => finish(r === 'refused' ? 'refused' : 'timeout'));
    const err = this.sendL4(server, {
      kind: 'udp',
      srcPort,
      dstPort: 53,
      app: { kind: 'dns-query', qid, qname: normalizeName(name) },
    });
    if (err) {
      finish('timeout');
      return;
    }
    this.network.scheduler.schedule(DNS_TIMEOUT_MS, () => finish('timeout'));
  }

  // ---------- receive path ----------

  receiveFrame(iface: NetInterface, frame: EthernetFrame): void {
    if (frame.payload.kind === 'arp') {
      this.handleArp(iface, frame.payload);
      return;
    }
    if (frame.dstMac !== iface.mac && frame.dstMac !== BROADCAST_MAC) return;
    this.handleIp(frame.payload, iface.name);
  }

  private handleIp(pktIn: Ipv4Packet, iif: string): void {
    if (pktIn.dst === BROADCAST_IP) {
      // Broadcasts are never forwarded and never conntracked, but the INPUT
      // chain still sees them (blocking udp dport 67 kills DHCP — a real lab).
      const res = this.fw.evaluate('input', pktIn, { iif, ctState: 'new' });
      this.logFw(res, pktIn);
      if (res.verdict !== 'accept') return;
      this.deliverBroadcast(pktIn, iif);
      return;
    }

    const now = this.network.now;
    const proc = this.ct.process(pktIn, now);
    let pkt = proc.pkt;
    const ctState = proc.state;
    // Tuple as the packet arrived (pre-DNAT) — the "original" side of a new conn.
    const origTuple = proc.dir === 'none' ? tupleOf(pkt) : null;

    if (proc.dir === 'none' && ctState === 'new') {
      const nr = this.fw.evalNat('prerouting', pkt, { iif, ctState });
      if (nr && nr.action.type === 'dnat') pkt = this.applyDnat(pkt, nr.action.addr, nr.action.port);
    }

    if (this.hasIp(pkt.dst)) {
      const res = this.fw.evaluate('input', pkt, { iif, ctState });
      this.logFw(res, pkt);
      if (res.verdict === 'drop') return;
      if (res.verdict === 'reject') {
        this.rejectPacket(pkt);
        return;
      }
      if (origTuple) {
        const t = tupleOf(pkt);
        if (t) this.ct.confirm(origTuple, t, now);
      }
      this.deliverLocal(pkt);
      return;
    }

    if (!this.forwarding) return;
    const ttl = pkt.ttl - 1;
    if (ttl <= 0) {
      if (!isIcmpError(pkt)) this.sendIcmp(pkt.src, { type: 'time-exceeded', original: refOf(pkt) });
      return;
    }
    pkt = { ...pkt, ttl };
    const route = this.lookupRoute(pkt.dst);
    if (!route) {
      if (!isIcmpError(pkt))
        this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'net', original: refOf(pkt) });
      return;
    }
    const res = this.fw.evaluate('forward', pkt, { iif, oif: route.ifaceName, ctState });
    this.logFw(res, pkt);
    if (res.verdict === 'drop') return;
    if (res.verdict === 'reject') {
      this.rejectPacket(pkt);
      return;
    }
    if (proc.dir === 'none' && ctState === 'new') {
      const nr = this.fw.evalNat('postrouting', pkt, { iif, oif: route.ifaceName, ctState });
      if (nr) pkt = this.applySnat(pkt, nr.action, this.getInterface(route.ifaceName)!);
      const trans = tupleOf(pkt);
      if (origTuple && trans) this.ct.confirm(origTuple, trans, now);
    }
    this.routePacket(pkt, route);
  }

  private deliverBroadcast(pkt: Ipv4Packet, iif: string): void {
    const l4 = pkt.l4;
    if (l4.kind !== 'udp' || !l4.app) return;
    if (l4.app.kind === 'dhcp') {
      if (l4.dstPort === 67) this.handleDhcpServer(l4.app, iif);
      else if (l4.dstPort === 68) for (const h of [...this.dhcpListeners]) h(l4.app);
      return;
    }
    if (l4.app.kind === 'rip' && l4.dstPort === 520 && this.ripEnabled) {
      this.handleRip(l4.app, iif, pkt.src);
    }
  }

  private handleDhcpServer(app: DhcpApp, iif: string): void {
    const cfg = this.dhcpServer;
    if (!cfg?.enabled) return;
    const iface = this.getInterface(iif);
    if (!iface?.ip) return;
    if (app.op === 'discover') {
      const lease = this.allocLease(cfg, app.clientMac);
      if (lease === null) return; // pool exhausted: silence, like a real server
      this.sendBroadcastUdp(iface, iface.ip.addr, 67, 68, {
        kind: 'dhcp',
        op: 'offer',
        xid: app.xid,
        clientMac: app.clientMac,
        yourIp: lease,
        prefix: iface.ip.prefix,
        router: cfg.router,
        dns: cfg.dns,
        serverIp: iface.ip.addr,
      });
    } else if (app.op === 'request' && app.yourIp !== undefined) {
      cfg.leases.set(app.clientMac, app.yourIp);
      this.sendBroadcastUdp(iface, iface.ip.addr, 67, 68, {
        kind: 'dhcp',
        op: 'ack',
        xid: app.xid,
        clientMac: app.clientMac,
        yourIp: app.yourIp,
        prefix: iface.ip.prefix,
        router: cfg.router,
        dns: cfg.dns,
        serverIp: iface.ip.addr,
      });
    }
  }

  private allocLease(cfg: DhcpServerConfig, mac: string): U32 | null {
    const existing = cfg.leases.get(mac);
    if (existing !== undefined) return existing;
    const taken = new Set([...cfg.leases.values(), ...this.myIps()]);
    for (let ip = cfg.rangeStart; ip <= cfg.rangeEnd; ip++) {
      if (!taken.has(ip >>> 0)) return ip >>> 0;
    }
    return null;
  }

  private applyDnat(pkt: Ipv4Packet, addr: U32, port?: number): Ipv4Packet {
    const l4 = pkt.l4;
    if ((l4.kind === 'tcp' || l4.kind === 'udp') && port !== undefined) {
      return { ...pkt, dst: addr, l4: { ...l4, dstPort: port } };
    }
    return { ...pkt, dst: addr };
  }

  private applySnat(
    pkt: Ipv4Packet,
    action: { type: 'masquerade' } | { type: 'snat'; addr: U32 } | { type: 'dnat'; addr: U32; port?: number },
    oiface: NetInterface,
  ): Ipv4Packet {
    if (action.type === 'dnat') return pkt; // dnat never valid in postrouting; guarded by parser
    const newSrc = action.type === 'masquerade' ? oiface.ip?.addr : action.addr;
    if (newSrc === undefined) return pkt;
    return { ...pkt, src: newSrc };
  }

  private rejectPacket(pkt: Ipv4Packet): void {
    // Linux REJECT default: ICMP port unreachable back to the sender.
    if (isIcmpError(pkt)) return;
    this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'port', original: refOf(pkt) });
  }

  private logFw(res: EvalResult, pkt: Ipv4Packet): void {
    if (!res.filtered) return;
    this.fwLog.unshift({
      t: this.network.now,
      hook: res.hook,
      verdict: res.verdict,
      rule: res.rule ? filterRuleText(res.rule) : `policy ${res.verdict}`,
      pkt: summarizePacket(pkt),
    });
    if (this.fwLog.length > FW_LOG_MAX) this.fwLog.length = FW_LOG_MAX;
    if (res.verdict !== 'accept') this.network.onFwDrop?.(this.id);
  }

  // ---------- ARP ----------

  private routePacket(pkt: Ipv4Packet, route: Route): void {
    const iface = this.getInterface(route.ifaceName)!;
    const nextHop = route.via ?? pkt.dst;
    this.resolveAndSend(iface, nextHop, pkt);
  }

  private resolveAndSend(iface: NetInterface, nextHop: U32, pkt: Ipv4Packet): void {
    const cached = this.arpTable.get(nextHop);
    if (cached) {
      iface.send({ srcMac: iface.mac, dstMac: cached.mac, payload: pkt });
      return;
    }
    const pending = this.pendingArp.get(nextHop);
    if (pending) {
      pending.queue.push(pkt);
      return;
    }
    const entry: PendingArp = { iface, queue: [pkt], tries: 1, timer: null };
    this.pendingArp.set(nextHop, entry);
    this.sendArpRequest(iface, nextHop);
    entry.timer = this.network.scheduler.schedule(ARP_RETRY_MS, () => this.arpRetry(nextHop, entry));
  }

  private arpRetry(nextHop: U32, entry: PendingArp): void {
    if (entry.tries >= ARP_MAX_TRIES) {
      this.pendingArp.delete(nextHop);
      for (const pkt of entry.queue) this.failDelivery(pkt);
      return;
    }
    entry.tries++;
    this.sendArpRequest(entry.iface, nextHop);
    entry.timer = this.network.scheduler.schedule(ARP_RETRY_MS, () => this.arpRetry(nextHop, entry));
  }

  private failDelivery(pkt: Ipv4Packet): void {
    if (this.hasIp(pkt.src)) {
      const ref = refOf(pkt);
      if (ref.icmpId !== null) {
        this.icmpListeners.get(ref.icmpId)?.({
          type: 'send-error',
          seq: ref.icmpSeq,
          message: 'Destination Host Unreachable',
        });
      } else if (ref.proto === 'tcp' || ref.proto === 'udp') {
        this.notifySocket(ref, 'unreachable');
      }
    } else if (!isIcmpError(pkt)) {
      this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'host', original: refOf(pkt) });
    }
  }

  private sendArpRequest(iface: NetInterface, targetIp: U32): void {
    if (!iface.ip) return;
    iface.send({
      srcMac: iface.mac,
      dstMac: BROADCAST_MAC,
      payload: {
        kind: 'arp',
        op: 'request',
        senderIp: iface.ip.addr,
        senderMac: iface.mac,
        targetIp,
        targetMac: null,
      },
    });
  }

  private handleArp(iface: NetInterface, arp: ArpPayload): void {
    if (arp.op === 'request') {
      if (iface.ip && arp.targetIp === iface.ip.addr) {
        this.arpTable.set(arp.senderIp, { mac: arp.senderMac, ifaceName: iface.name, at: this.network.now });
        iface.send({
          srcMac: iface.mac,
          dstMac: arp.senderMac,
          payload: {
            kind: 'arp',
            op: 'reply',
            senderIp: iface.ip.addr,
            senderMac: iface.mac,
            targetIp: arp.senderIp,
            targetMac: arp.senderMac,
          },
        });
      }
      return;
    }
    this.arpTable.set(arp.senderIp, { mac: arp.senderMac, ifaceName: iface.name, at: this.network.now });
    const pending = this.pendingArp.get(arp.senderIp);
    if (pending) {
      if (pending.timer) this.network.scheduler.cancel(pending.timer);
      this.pendingArp.delete(arp.senderIp);
      for (const pkt of pending.queue) {
        pending.iface.send({ srcMac: pending.iface.mac, dstMac: arp.senderMac, payload: pkt });
      }
    }
  }

  // ---------- local delivery ----------

  private deliverLocal(pkt: Ipv4Packet): void {
    const l4 = pkt.l4;
    if (l4.kind === 'tcp') {
      this.handleTcp(pkt, l4);
      return;
    }
    if (l4.kind === 'udp') {
      this.handleUdp(pkt, l4);
      return;
    }
    const msg = l4.msg;
    switch (msg.type) {
      case 'echo-request':
        this.sendIcmp(
          pkt.src,
          { type: 'echo-reply', id: msg.id, seq: msg.seq },
          { srcOverride: this.hasIp(pkt.dst) ? pkt.dst : undefined },
        );
        break;
      case 'echo-reply':
        this.icmpListeners.get(msg.id)?.({ type: 'reply', from: pkt.src, seq: msg.seq, ttl: pkt.ttl });
        break;
      case 'time-exceeded':
        if (msg.original.icmpId !== null) {
          this.icmpListeners.get(msg.original.icmpId)?.({
            type: 'time-exceeded',
            from: pkt.src,
            seq: msg.original.icmpSeq,
          });
        }
        break;
      case 'dest-unreachable':
        if (msg.original.proto === 'icmp' && msg.original.icmpId !== null) {
          this.icmpListeners.get(msg.original.icmpId)?.({
            type: 'unreachable',
            from: pkt.src,
            seq: msg.original.icmpSeq,
            code: msg.code,
          });
        } else if (msg.original.proto === 'tcp' || msg.original.proto === 'udp') {
          this.notifySocket(msg.original, msg.code === 'port' ? 'refused' : 'unreachable');
        }
        break;
    }
  }

  private handleUdp(pkt: Ipv4Packet, dgram: UdpDatagram): void {
    const app = dgram.app;
    if (app?.kind === 'dns-query' && dgram.dstPort === 53 && this.dnsServer?.enabled) {
      const addr = this.dnsServer.records.get(normalizeName(app.qname)) ?? null;
      this.sendL4(
        pkt.src,
        {
          kind: 'udp',
          srcPort: 53,
          dstPort: dgram.srcPort,
          app: { kind: 'dns-answer', qid: app.qid, qname: app.qname, addr },
        },
        { srcOverride: this.hasIp(pkt.dst) ? pkt.dst : undefined },
      );
      return;
    }
    if (app?.kind === 'dns-answer') {
      const pending = this.dnsPending.get(app.qid);
      if (pending) {
        pending.finish(app.addr);
        return;
      }
    }
    if (this.udpListening(dgram.dstPort)) {
      this.ncUdp.get(dgram.dstPort)?.(
        `Received UDP datagram from ${ipToString(pkt.src)}:${dgram.srcPort}`,
      );
      return;
    }
    this.sendIcmp(pkt.src, { type: 'dest-unreachable', code: 'port', original: refOf(pkt) });
  }

  private handleTcp(pkt: Ipv4Packet, seg: TcpSegment): void {
    const sessionKey = `${seg.dstPort}|${pkt.src}|${seg.srcPort}`;
    if (seg.app) {
      const session = this.tcpSessions.get(sessionKey);
      if (session) {
        session({ type: 'data', app: seg.app });
        return;
      }
      this.handleServerTcpData(pkt, seg);
      return;
    }

    const reply = (flags: Partial<Pick<TcpSegment, 'syn' | 'ack' | 'rst'>>) => {
      this.sendL4(
        pkt.src,
        {
          kind: 'tcp',
          srcPort: seg.dstPort,
          dstPort: seg.srcPort,
          syn: false,
          ack: false,
          rst: false,
          fin: false,
          ...flags,
        },
        { srcOverride: this.hasIp(pkt.dst) ? pkt.dst : undefined },
      );
    };

    if (seg.syn && !seg.ack) {
      if (this.tcpListening(seg.dstPort)) {
        this.ncTcp.get(seg.dstPort)?.(
          `Connection received from ${ipToString(pkt.src)}:${seg.srcPort}`,
        );
        reply({ syn: true, ack: true });
      } else {
        reply({ rst: true, ack: true });
      }
      return;
    }
    if (seg.syn && seg.ack) {
      reply({ ack: true });
      this.tcpSessions.get(sessionKey)?.({ type: 'open' });
      return;
    }
    if (seg.rst) {
      this.tcpSessions.get(sessionKey)?.({ type: 'refused' });
    }
    // Bare ACKs (handshake completion) need no action in this model.
  }

  private handleServerTcpData(pkt: Ipv4Packet, seg: TcpSegment): void {
    const app = seg.app!;
    if (app.kind === 'http-request' && this.httpServer?.enabled && seg.dstPort === this.httpServer.port) {
      this.sendL4(
        pkt.src,
        {
          kind: 'tcp',
          srcPort: seg.dstPort,
          dstPort: seg.srcPort,
          syn: false,
          ack: true,
          rst: false,
          fin: false,
          app: { kind: 'http-response', status: 200, reason: 'OK', body: this.httpServer.body },
        },
        { srcOverride: this.hasIp(pkt.dst) ? pkt.dst : undefined },
      );
    }
    // Data to a generic open port (services/nc) is accepted silently.
  }

  private notifySocket(ref: OriginalRef, result: SocketResult): void {
    if (ref.srcPort === null || ref.dstPort === null) return;
    const key = `${ref.srcPort}|${ref.dst}|${ref.dstPort}`;
    if (ref.proto === 'tcp') {
      this.tcpSessions.get(key)?.(result === 'refused' ? { type: 'refused' } : { type: 'unreachable' });
    } else {
      this.udpSessions.get(key)?.(result);
    }
  }
}

export class Host extends IpDevice {
  readonly kind = 'host' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.addInterfaces('eth', 1);
  }
}

// A server is a host with a rack icon and intent: DHCP/DNS/HTTP services are
// configured on it via the inspector (they work on any IP device, as on Linux).
export class ServerDevice extends IpDevice {
  readonly kind = 'server' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.addInterfaces('eth', 1);
  }
}

export class RouterDevice extends IpDevice {
  readonly kind = 'router' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.forwarding = true;
    this.addInterfaces('eth', 4);
  }
}

// A firewall is a router whose nftables base chains are pre-declared, so
// `nft list ruleset` shows structure immediately and labs start from policy
// flips rather than table/chain boilerplate.
export class FirewallDevice extends IpDevice {
  readonly kind = 'firewall' as const;

  constructor(network: Network, id: string, name: string) {
    super(network, id, name);
    this.forwarding = true;
    this.addInterfaces('eth', 4);
    this.fw.tables.filter = true;
    this.fw.declareFilter('input', 'input', 'accept');
    this.fw.declareFilter('forward', 'forward', 'accept');
    this.fw.declareFilter('output', 'output', 'accept');
  }
}

// Only needed for the constructors above; kept at the bottom to avoid
// a circular value import at module-evaluation time.
import type { Network } from './network';
