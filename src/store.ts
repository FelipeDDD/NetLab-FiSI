import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import LZString from 'lz-string';
import { Network, type WireTransfer } from './engine/network';
import { createDevice } from './engine/factory';
import { IpDevice } from './engine/ipdevice';
import type { DeviceKind } from './engine/device';
import { restoreNetwork, serializeNetwork, type SaveFile } from './engine/serialize';
import { cidrToString, parseCidr, parseIp } from './engine/ip';
import { disposeAllSessions, disposeSession } from './terminals';
import { sim } from './sim';

export interface DevNodeData extends Record<string, unknown> {
  kind: DeviceKind;
  label: string;
  ips: string[];
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
  const wireNet = (net: Network) => {
    net.onWireTransfer = (t) => {
      const packets = get().packets;
      set({ packets: [...packets.slice(-(MAX_PACKETS - 1)), t] });
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
          return { ...n, data: { ...n.data, label: d.name, ips: deviceIps(n.id) } };
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
      const pulse = Math.floor(now / 400);
      set({
        clock: now,
        ...(alive.length !== packets.length ? { packets: alive } : {}),
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
      const sw1 = createDevice(net, 'switch');
      const r1 = createDevice(net, 'router') as IpDevice;
      const pc2 = createDevice(net, 'host') as IpDevice;
      net.connect(pc1.id, sw1.id);
      net.connect(sw1.id, r1.id);
      net.connect(r1.id, pc2.id);
      pc1.getInterface('eth0')!.ip = parseCidr('192.168.1.10/24');
      // eth0 was claimed by the switch link, eth1 by the pc2 link (connect order above).
      r1.getInterface('eth0')!.ip = parseCidr('192.168.1.1/24');
      r1.getInterface('eth1')!.ip = parseCidr('10.0.0.1/24');
      pc2.getInterface('eth0')!.ip = parseCidr('10.0.0.20/24');
      pc1.addRoute(0, 0, parseIp('192.168.1.1')!);
      pc2.addRoute(0, 0, parseIp('10.0.0.1')!);
      set({
        nodes: [
          deviceNode(pc1.id, 'host', pc1.name, 80, 220),
          deviceNode(sw1.id, 'switch', sw1.name, 300, 220),
          deviceNode(r1.id, 'router', r1.name, 520, 220),
          deviceNode(pc2.id, 'host', pc2.name, 740, 220),
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
