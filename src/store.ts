import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import LZString from 'lz-string';
import { Network, type WireTransfer } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import type { DeviceKind } from './engine/device';
import { restoreNetwork, serializeNetwork, type SaveFile } from './engine/serialize';
import { listRuleset } from './engine/firewall-fmt';
import { cidrToString, parseCidr, parseIp } from './engine/ip';
import { disposeAllSessions, disposeSession } from './terminals';
import { sim } from './sim';

export interface DevNodeData extends Record<string, unknown> {
  kind: DeviceKind;
  label: string;
  ips: string[];
  fw?: boolean;
}

export interface DropFlash {
  id: number;
  deviceId: string;
  start: number;
  until: number;
}

export type DevNode = Node<DevNodeData>;

const AUTOSAVE_KEY = 'netsim:autosave:v1';
const MAX_PACKETS = 150;

function deviceNode(id: string, kind: DeviceKind, label: string, x: number, y: number): DevNode {
  return { id, type: 'device', position: { x, y }, data: { kind, label, ips: [] } };
}

function edgesFromEngine(): Edge[] {
  return [...sim.net.links.values()].map((l) => ({
    id: l.id,
    source: l.a.device.id,
    target: l.b.device.id,
    type: 'floating',
  }));
}

function deviceIps(id: string): string[] {
  const d = sim.net.devices.get(id);
  if (!d) return [];
  return d.interfaces.filter((i) => i.ip).map((i) => cidrToString(i.ip!.addr, i.ip!.prefix));
}

interface NetsimState {
  nodes: DevNode[];
  edges: Edge[];
  packets: WireTransfer[];
  dropFlashes: DropFlash[];
  clock: number;
  uiPulse: number;
  selected: string | null;
  terminals: string[];
  activeTerminal: string | null;
  paused: boolean;
  speed: number;
  notice: string | null;

  addDeviceAt(kind: DeviceKind, pos: { x: number; y: number }): void;
  onNodesChange(changes: NodeChange<DevNode>[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(c: Connection): void;
  select(id: string | null): void;
  deleteDevice(id: string): void;
  renameDevice(id: string, name: string): void;
  setIfaceIp(deviceId: string, ifaceName: string, value: string): string | null;
  toggleIface(deviceId: string, ifaceName: string): void;
  setServices(deviceId: string, proto: 'tcp' | 'udp', text: string): string | null;
  copyDeviceConfig(deviceId: string): void;
  setNameserver(deviceId: string, text: string): string | null;
  toggleDhcpServer(deviceId: string): void;
  setDhcpField(deviceId: string, field: 'rangeStart' | 'rangeEnd' | 'router' | 'dns', text: string): string | null;
  toggleDnsServer(deviceId: string): void;
  setDnsRecords(deviceId: string, text: string): string | null;
  toggleHttpServer(deviceId: string): void;
  setHttpPort(deviceId: string, text: string): string | null;
  setHttpBody(deviceId: string, text: string): void;
  openTerminal(id: string): void;
  closeTerminal(id: string): void;
  setActiveTerminal(id: string): void;
  refresh(): void;
  tick(dtMs: number): void;
  setPaused(p: boolean): void;
  setSpeed(s: number): void;
  setNotice(msg: string | null): void;
  newTopology(): void;
  loadDemo(): void;
  exportJson(): void;
  importJson(text: string): string | null;
  shareUrl(): void;
  boot(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPulse = 0;

export const useStore = create<NetsimState>()((set, get) => {
  let flashSeq = 0;
  const wireNet = (net: Network) => {
    net.onWireTransfer = (t) => {
      const packets = get().packets;
      set({ packets: [...packets.slice(-(MAX_PACKETS - 1)), t] });
    };
    net.onFwDrop = (deviceId) => {
      const now = net.scheduler.now;
      set({
        dropFlashes: [
          ...get().dropFlashes.slice(-19),
          { id: ++flashSeq, deviceId, start: now, until: now + 700 },
        ],
      });
    };
  };
  wireNet(sim.net);

  const currentSave = (): SaveFile => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of get().nodes) positions[n.id] = { x: n.position.x, y: n.position.y };
    return serializeNetwork(sim.net, positions);
  };

  const saveSoon = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(currentSave()));
      } catch {
        // Storage full or unavailable; autosave is best-effort.
      }
    }, 500);
  };

  const adoptSave = (data: SaveFile) => {
    disposeAllSessions();
    sim.net = restoreNetwork(data);
    wireNet(sim.net);
    const nodes = data.devices.map((d) => deviceNode(d.id, d.kind, d.name, d.x, d.y));
    set({
      nodes,
      edges: edgesFromEngine(),
      packets: [],
      dropFlashes: [],
      selected: null,
      terminals: [],
      activeTerminal: null,
    });
    get().refresh();
  };

  return {
    nodes: [],
    edges: [],
    packets: [],
    dropFlashes: [],
    clock: 0,
    uiPulse: 0,
    selected: null,
    terminals: [],
    activeTerminal: null,
    paused: false,
    speed: 1,
    notice: null,

    addDeviceAt(kind, pos) {
      const d = createDevice(sim.net, kind);
      set({ nodes: [...get().nodes, deviceNode(d.id, kind, d.name, pos.x, pos.y)] });
      saveSoon();
    },

    onNodesChange(changes) {
      for (const ch of changes) {
        if (ch.type === 'remove') {
          disposeSession(ch.id);
          sim.net.removeDevice(ch.id);
        }
      }
      const removed = changes.some((c) => c.type === 'remove');
      set({
        nodes: applyNodeChanges(changes, get().nodes),
        ...(removed
          ? {
              edges: edgesFromEngine(),
              terminals: get().terminals.filter((t) => sim.net.devices.has(t)),
              activeTerminal:
                get().activeTerminal && sim.net.devices.has(get().activeTerminal!)
                  ? get().activeTerminal
                  : null,
              selected: get().selected && sim.net.devices.has(get().selected!) ? get().selected : null,
            }
          : {}),
      });
      if (removed || changes.some((c) => c.type === 'position' && !c.dragging)) saveSoon();
    },

    onEdgesChange(changes) {
      for (const ch of changes) {
        if (ch.type === 'remove') sim.net.disconnect(ch.id);
      }
      set({ edges: applyEdgeChanges(changes, get().edges) });
      if (changes.some((c) => c.type === 'remove')) saveSoon();
    },

    onConnect(c) {
      if (!c.source || !c.target) return;
      try {
        sim.net.connect(c.source, c.target);
        set({ edges: edgesFromEngine() });
        saveSoon();
      } catch (e) {
        get().setNotice(e instanceof Error ? e.message : String(e));
      }
    },

    select(id) {
      set({ selected: id });
    },

    deleteDevice(id) {
      disposeSession(id);
      sim.net.removeDevice(id);
      set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: edgesFromEngine(),
        terminals: get().terminals.filter((t) => t !== id),
        activeTerminal: get().activeTerminal === id ? null : get().activeTerminal,
        selected: get().selected === id ? null : get().selected,
      });
      saveSoon();
    },

    renameDevice(id, name) {
      const d = sim.net.devices.get(id);
      if (!d || !name.trim()) return;
      d.name = name.trim();
      get().refresh();
      saveSoon();
    },

    setIfaceIp(deviceId, ifaceName, value) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return 'not an IP device';
      const iface = d.getInterface(ifaceName);
      if (!iface) return 'no such interface';
      const trimmed = value.trim();
      if (trimmed === '') {
        iface.ip = null;
      } else {
        const cidr = parseCidr(trimmed);
        if (!cidr) return 'use CIDR form, e.g. 192.168.1.10/24';
        iface.ip = cidr;
      }
      get().refresh();
      saveSoon();
      return null;
    },

    toggleIface(deviceId, ifaceName) {
      const d = sim.net.devices.get(deviceId);
      const iface = d?.getInterface(ifaceName);
      if (!iface) return;
      iface.up = !iface.up;
      get().refresh();
      saveSoon();
    },

    setServices(deviceId, proto, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return 'not an IP device';
      const ports = new Set<number>();
      for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
        const n = Number(part);
        if (!Number.isInteger(n) || n < 1 || n > 65535) return `invalid port "${part}"`;
        ports.add(n);
      }
      d.services[proto] = ports;
      get().refresh();
      saveSoon();
      return null;
    },

    copyDeviceConfig(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return;
      const text = listRuleset(d.fw);
      navigator.clipboard
        .writeText(text)
        .then(() => get().setNotice(`${d.name} nftables config copied — paste into /etc/nftables.conf`))
        .catch(() => get().setNotice('Could not access clipboard'));
    },

    setNameserver(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return 'not an IP device';
      const trimmed = text.trim();
      if (trimmed === '') {
        d.nameserver = null;
      } else {
        const ip = parseIp(trimmed);
        if (ip === null) return 'invalid nameserver address';
        d.nameserver = ip;
      }
      get().refresh();
      saveSoon();
      return null;
    },

    toggleDhcpServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return;
      if (!d.dhcpServer) {
        // Sensible defaults derived from the first addressed interface.
        const iface = d.interfaces.find((i) => i.ip);
        const base = iface?.ip ? (iface.ip.addr & 0xffffff00) >>> 0 : parseIp('192.168.0.0')!;
        d.dhcpServer = {
          enabled: true,
          rangeStart: (base | 100) >>> 0,
          rangeEnd: (base | 150) >>> 0,
          router: iface?.ip?.addr ?? null,
          dns: d.nameserver,
          leases: new Map(),
        };
      } else {
        d.dhcpServer.enabled = !d.dhcpServer.enabled;
      }
      get().refresh();
      saveSoon();
    },

    setDhcpField(deviceId, field, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || !d.dhcpServer) return 'DHCP server not enabled';
      const trimmed = text.trim();
      if (field === 'router' || field === 'dns') {
        if (trimmed === '') {
          d.dhcpServer[field] = null;
        } else {
          const ip = parseIp(trimmed);
          if (ip === null) return 'invalid address';
          d.dhcpServer[field] = ip;
        }
      } else {
        const ip = parseIp(trimmed);
        if (ip === null) return 'invalid address';
        d.dhcpServer[field] = ip;
      }
      get().refresh();
      saveSoon();
      return null;
    },

    toggleDnsServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return;
      if (!d.dnsServer) d.dnsServer = { enabled: true, records: new Map() };
      else d.dnsServer.enabled = !d.dnsServer.enabled;
      get().refresh();
      saveSoon();
    },

    setDnsRecords(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || !d.dnsServer) return 'DNS server not enabled';
      const records = new Map<string, number>();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [addr, name] = trimmed.split(/\s+/);
        const ip = parseIp(addr ?? '');
        if (ip === null || !name) return `invalid hosts line: "${trimmed}" (use: <ip> <name>)`;
        records.set(name.toLowerCase(), ip);
      }
      d.dnsServer.records = records;
      get().refresh();
      saveSoon();
      return null;
    },

    toggleHttpServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice)) return;
      if (!d.httpServer) {
        d.httpServer = {
          enabled: true,
          port: 80,
          body: `<html><body><h1>Hello from ${d.name}</h1></body></html>`,
        };
      } else {
        d.httpServer.enabled = !d.httpServer.enabled;
      }
      get().refresh();
      saveSoon();
    },

    setHttpPort(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || !d.httpServer) return 'web server not enabled';
      const port = Number(text.trim());
      if (!Number.isInteger(port) || port < 1 || port > 65535) return 'invalid port';
      d.httpServer.port = port;
      get().refresh();
      saveSoon();
      return null;
    },

    setHttpBody(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || !d.httpServer) return;
      d.httpServer.body = text;
      saveSoon();
    },

    openTerminal(id) {
      const d = sim.net.devices.get(id);
      if (!d || !(d instanceof IpDevice)) return;
      const terminals = get().terminals.includes(id) ? get().terminals : [...get().terminals, id];
      set({ terminals, activeTerminal: id });
    },

    closeTerminal(id) {
      disposeSession(id);
      const terminals = get().terminals.filter((t) => t !== id);
      set({
        terminals,
        activeTerminal:
          get().activeTerminal === id ? (terminals.length ? terminals[terminals.length - 1] : null) : get().activeTerminal,
      });
    },

    setActiveTerminal(id) {
      set({ activeTerminal: id });
    },

    refresh() {
      set({
        nodes: get().nodes.map((n) => {
          const d = sim.net.devices.get(n.id);
          if (!d) return n;
          const fw = d instanceof IpDevice ? d.fw.active() : false;
          return { ...n, data: { ...n.data, label: d.name, ips: deviceIps(n.id), fw } };
        }),
      });
    },

    tick(dtMs) {
      if (get().paused) return;
      const dt = Math.min(dtMs, 100) * get().speed;
      sim.net.scheduler.advanceTo(sim.net.scheduler.now + dt);
      const now = sim.net.scheduler.now;
      const packets = get().packets;
      const alive = packets.filter((p) => p.end > now - 120);
      const flashes = get().dropFlashes;
      const aliveFlashes = flashes.filter((f) => f.until > now);
      const pulse = Math.floor(now / 400);
      set({
        clock: now,
        ...(alive.length !== packets.length ? { packets: alive } : {}),
        ...(aliveFlashes.length !== flashes.length ? { dropFlashes: aliveFlashes } : {}),
        ...(pulse !== lastPulse ? { uiPulse: pulse } : {}),
      });
      lastPulse = pulse;
    },

    setPaused(p) {
      set({ paused: p });
    },

    setSpeed(s) {
      set({ speed: s });
    },

    setNotice(msg) {
      if (noticeTimer) clearTimeout(noticeTimer);
      set({ notice: msg });
      if (msg) noticeTimer = setTimeout(() => set({ notice: null }), 4000);
    },

    newTopology() {
      disposeAllSessions();
      sim.net = new Network();
      wireNet(sim.net);
      set({
        nodes: [],
        edges: [],
        packets: [],
        dropFlashes: [],
        selected: null,
        terminals: [],
        activeTerminal: null,
      });
      saveSoon();
    },

    loadDemo() {
      get().newTopology();
      const net = sim.net;
      const pc1 = createDevice(net, 'host') as IpDevice;
      const pc2 = createDevice(net, 'host') as IpDevice;
      const sw1 = createDevice(net, 'switch');
      const r1 = createDevice(net, 'router') as IpDevice;
      const srv1 = createDevice(net, 'server') as IpDevice;
      net.connect(pc1.id, sw1.id);
      net.connect(pc2.id, sw1.id);
      net.connect(sw1.id, r1.id); // r1 eth0 = LAN side
      net.connect(r1.id, srv1.id); // r1 eth1 = server side
      pc1.getInterface('eth0')!.ip = parseCidr('192.168.1.10/24');
      // pc2 is left unconfigured on purpose: run `dhclient` on it.
      r1.getInterface('eth0')!.ip = parseCidr('192.168.1.1/24');
      r1.getInterface('eth1')!.ip = parseCidr('10.0.0.1/24');
      srv1.getInterface('eth0')!.ip = parseCidr('10.0.0.20/24');
      pc1.addRoute(0, 0, parseIp('192.168.1.1')!);
      srv1.addRoute(0, 0, parseIp('10.0.0.1')!);
      pc1.nameserver = parseIp('10.0.0.20');
      r1.dhcpServer = {
        enabled: true,
        rangeStart: parseIp('192.168.1.100')!,
        rangeEnd: parseIp('192.168.1.150')!,
        router: parseIp('192.168.1.1'),
        dns: parseIp('10.0.0.20'),
        leases: new Map(),
      };
      srv1.dnsServer = {
        enabled: true,
        records: new Map([
          ['web.lan', parseIp('10.0.0.20')!],
          ['pc1.lan', parseIp('192.168.1.10')!],
        ]),
      };
      srv1.httpServer = {
        enabled: true,
        port: 80,
        body: '<html><body><h1>It works!</h1><p>Served by srv1 over simulated TCP.</p></body></html>',
      };
      set({
        nodes: [
          deviceNode(pc1.id, 'host', pc1.name, 60, 120),
          deviceNode(pc2.id, 'host', pc2.name, 60, 320),
          deviceNode(sw1.id, 'switch', sw1.name, 290, 220),
          deviceNode(r1.id, 'router', r1.name, 510, 220),
          deviceNode(srv1.id, 'server', srv1.name, 730, 220),
        ],
        edges: edgesFromEngine(),
      });
      get().refresh();
      saveSoon();
    },

    exportJson() {
      const blob = new Blob([JSON.stringify(currentSave(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'netsim-topology.json';
      a.click();
      URL.revokeObjectURL(url);
    },

    importJson(text) {
      try {
        const data = JSON.parse(text) as SaveFile;
        adoptSave(data);
        saveSoon();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'invalid file';
      }
    },

    shareUrl() {
      const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(currentSave()));
      const url = `${location.origin}${location.pathname}#t=${compressed}`;
      navigator.clipboard
        .writeText(url)
        .then(() => get().setNotice('Share link copied to clipboard'))
        .catch(() => get().setNotice('Could not access clipboard — check the address bar instead'));
      history.replaceState(null, '', `#t=${compressed}`);
    },

    boot() {
      if (location.hash.startsWith('#t=')) {
        const json = LZString.decompressFromEncodedURIComponent(location.hash.slice(3));
        if (json) {
          try {
            adoptSave(JSON.parse(json) as SaveFile);
            history.replaceState(null, '', location.pathname);
            return;
          } catch {
            get().setNotice('Could not load the shared topology from the URL');
          }
        }
      }
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        try {
          adoptSave(JSON.parse(saved) as SaveFile);
          return;
        } catch {
          // Corrupt autosave: fall through to the demo.
        }
      }
      get().loadDemo();
    },
  };
});
