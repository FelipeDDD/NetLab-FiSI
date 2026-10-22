import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import LZString from 'lz-string';
import { sameIpv4, validIpv4, type InterfaceIpv4 } from './engine/ipv4Config';
import { runDhclient } from './commands/dhclient';
import { Network, type PingProgress } from './engine/network';
import { PacketCapture, type PacketCaptureState } from './packetCapture';
import { normalizePacketAnimationSpeed, readPacketAnimationSpeed, retimePacketAnimations, savePacketAnimationSpeed, sequencePacketAnimation, packetAnimationDuration, type AnimatedTransfer } from './packetAnimation';
import { advanceGuidedPacket, toggleGuidedPlayback, followGuidedPacket, emptyGuidedPacket, updateGuidedObservation, observeGuidedPacket, observeGuidedPingProgress, replayGuidedPacket, stepGuidedPacket, validateGuidedPacket, type GuidedPacketState, type PacketVisualizationMode } from './guidedPacket';
import { createDevice } from './engine/factory';
import { Host, IpDevice } from './engine/ipdevice';
import { chooseHostOs, normalizeHostCreationMode, readHostCreationMode, saveHostCreationMode, type HostCreationMode, type HostOs } from './hostOs';
import type { DeviceKind } from './engine/device';
import { restoreNetwork, serializeNetwork, type SaveFile } from './engine/serialize';
import { listRuleset } from './engine/firewall-fmt';
import { cidrToString, parseCidr, parseIp } from './engine/ip';
import { ApDevice, SwitchDevice } from './engine/switch';
import { disposeAllSessions, disposeSession, getSession, refreshSessionProfile } from './terminals';
import { sim } from './sim';
import type { LabDef } from './labs/types';
import { runChecks } from './labs/checker';
import { LABS } from './labs/library';
import { EXAMPLES } from './labs/examples';
import { zipSync, strToU8 } from 'fflate';
import { configBundle } from './export/configs';
import { containerlabYaml } from './export/containerlab';
import { composeYaml } from './export/compose';
import { svgToPngBlob, topologySvg } from './export/diagram';
import { networkReport } from './export/report';
import { adjacentTerminal, type TerminalDirection } from './terminalShortcuts';
import { activatePanelSession, prunePanelSessions, normalizeTerminalLayoutMode, MIN_TERMINAL_PANEL_WIDTH, movePanelSession, type TerminalTabDestination, type TerminalPanel, type TerminalLayoutMode } from './terminalPanels';
import { DEFAULT_TERMINAL_COLORS, DEFAULT_TERMINAL_APPEARANCE, hasTerminalColor, normalizeTerminalAppearance, normalizeTerminalColor, readTerminalAppearance, readTerminalColors, type AppearanceSaveFile, type TerminalAppearance } from './terminalAppearance';
import { applyPanelPreferences, readPanelPreferences, rememberPanelPreferences, writePanelPreferences } from './terminalPanelPreferences';
import { forgetSavedTabs, insertSavedTab, mergeTabLayouts, readTabLayouts, TAB_LAYOUT_KEY, writeTabLayouts, type TerminalTabLayouts } from './terminalTabPreferences';
import { capturePresentationSelection } from './terminalPresentationSelection';
import { moveTerminalPanel } from './terminalPanels';
import { applyMovement, emptyTopologyHistory, recordMovement, recordOperation, isInspectorOperation, sameServicePorts, sortedServicePorts, type Point, type TopologyHistory, type TopologyOperation } from './topologyHistory';
import { applyAccessVlan, applyInspectorEdit, applyLinkEdit, canApplyLinkEdit, dhcpSettings, sortedDnsRecords, captureCreation, captureLink, restoreCreation, restoreDeletedDevices } from './topologyEdits';

export interface DevNodeData extends Record<string, unknown> {
  kind: DeviceKind;
  label: string;
  ips: string[];
  os?: HostOs;
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
import { loadCableStyle, type CableStyle } from './cableGeometry';
const MAX_PACKETS = 150;

function deviceNode(id: string, kind: DeviceKind, label: string, x: number, y: number): DevNode {
  const d = sim.net.devices.get(id);
  return { id, type: 'device', position: { x, y }, data: { kind, label, ips: [], ...(d instanceof Host ? { os: d.os } : {}) } };
}

function edgesFromEngine(): Edge[] {
  return [...sim.net.links.values()].map((l) => {
    // AP-to-endpoint links are wireless associations: draw them dashed.
    const kinds = [l.a.device.kind, l.b.device.kind];
    const wireless =
      kinds.includes('ap') && kinds.some((k) => k === 'host' || k === 'server');
    return {
      id: l.id,
      source: l.a.device.id,
      target: l.b.device.id,
      type: 'floating',
      ...(wireless ? { style: { strokeDasharray: '7 5' } } : {}),
    };
  });
}

function deviceIps(id: string): string[] {
  const d = sim.net.devices.get(id);
  if (!d) return [];
  return d.interfaces.filter((i) => i.ip).map((i) => cidrToString(i.ip!.addr, i.ip!.prefix));
}

interface NetsimState {
  hostCreationMode: HostCreationMode;
  setHostCreationMode(mode: HostCreationMode): void;
  setHostOs(id: string, os: HostOs): void;
  topologyHistory: TopologyHistory;
  beginNodeMovement(source: 'drag' | 'keyboard'): void;
  finishNodeMovement(): void;
  cancelNodeMovement(): void;
  invalidateTopologyHistory(): void;
  undoTopology(): void;
  redoTopology(): void;
  nodes: DevNode[];
  edges: Edge[];
  hoveredLinkId: string | null;
  cableStyle: CableStyle;
  setCableStyle(style: CableStyle): void;
  hoverLink(id: string | null): void;
  clearLinkSelection(): void;
  packets: AnimatedTransfer[];
  packetAnimationClock: number;
  packetAnimationSpeed: number;
  setPacketAnimationSpeed(speed: number): void;
  packetVisualizationMode: PacketVisualizationMode;
  guidedPacket: GuidedPacketState;
  setPacketVisualizationMode(mode: PacketVisualizationMode): void;
  toggleGuidedPlayback(): void;
  nextGuidedHop(): void;
  replayGuidedPacket(): void;
  followGuidedPacket(): void;
  packetCapture: PacketCaptureState;
  packetInspectorOpen: boolean;
  setPacketInspectorOpen(open: boolean): void;
  startPacketCapture(linkId?: string | null): void;
  pausePacketCapture(): void;
  resumePacketCapture(): void;
  stopPacketCapture(): void;
  clearPacketCapture(): void;
  dropFlashes: DropFlash[];
  clock: number;
  uiPulse: number;
  selected: string | null;
  terminals: string[];
  activeTerminal: string | null;
  terminalPanels: TerminalPanel[];
  terminalLayoutMode: TerminalLayoutMode;
  terminalHasFocus: boolean;
  terminalDockCollapsed: boolean;
  terminalFocusRequest: number;
  terminalColors: Record<string, string>;
  terminalAppearance: TerminalAppearance;
  paused: boolean;
  speed: number;
  notice: string | null;

  lab: LabDef | null;
  labStep: number;
  labResults: Record<string, { pass: boolean; detail: string }>;
  labChecking: boolean;
  quizAnswers: Record<string, number>;

  addDeviceAt(kind: DeviceKind, pos: { x: number; y: number }): void;
  onNodesChange(changes: NodeChange<DevNode>[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(c: Connection): void;
  select(id: string | null): void;
  deleteDevice(id: string): void;
  deleteTopologyElements(nodeIds: string[], edgeIds?: string[]): void;
  renameDevice(id: string, name: string): void;
  setIfaceIp(deviceId: string, ifaceName: string, value: string): string | null;
  setInterfaceIpv4(deviceId: string, ifaceName: string, value: InterfaceIpv4, editGroup?: object): string | null;
  renewInterfaceDhcp(deviceId: string, ifaceName: string): void;
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
  toggleRip(deviceId: string): void;
  setPortVlan(deviceId: string, port: string, text: string): string | null;
  resizeSwitch(deviceId: string, delta: 1 | -1): string | null;
  setSsid(deviceId: string, text: string): string | null;
  openTerminal(id: string): void;
  closeTerminal(id: string): void;
  setActiveTerminal(id: string): void;
  noteTerminalFocus(id: string): void;
  noteTerminalPanelFocus(id: string): void;
  releaseTerminalFocus(): void;
  setTerminalDockCollapsed(collapsed: boolean): void;
  setTerminalPanels(panels: TerminalPanel[]): void;
  toggleTerminalPanelLock(id: string, widths: Record<string, number>): void;
  moveTerminalTab(id: string, destination: TerminalTabDestination): void;
  reorderTerminalPanel(id: string, beforeId: string | null): void;
  setTerminalLayoutMode(mode: TerminalLayoutMode): void;
  cycleTerminal(direction: TerminalDirection, origin?: string): void;
  setTerminalColor(id: string, color: string | null): void;
  setTerminalAppearance(preference: Partial<TerminalAppearance>): void;
  resetTerminalAppearance(): void;
  refresh(): void;
  flushAutosave(): void;
  tick(dtMs: number): void;
  setPaused(p: boolean): void;
  setSpeed(s: number): void;
  setNotice(msg: string | null): void;
  newTopology(): void;
  loadDemo(): void;
  exportJson(): void;
  exportConfigs(): void;
  exportContainerlab(): void;
  exportCompose(): void;
  exportSvg(): void;
  exportPng(): void;
  exportReport(): void;
  importJson(text: string): string | null;
  shareUrl(): void;
  boot(): void;

  loadBundledLab(index: number): void;
  loadExample(index: number): void;
  setLabStep(step: number): void;
  answerQuiz(qid: string, choice: number): void;
  checkStep(): void;
  exportAttempt(): void;
  closeLab(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPulse = 0;

export const useStore = create<NetsimState>()((set, get) => {
  const capture = new PacketCapture((packetCapture) => set({ packetCapture }));
  // Set before advancing the scheduler so new emissions use this frame's
  // presentation time, including after a long gap in browser callbacks.
  let animationNow = 0;
  // One lifecycle marker, also in Live, so entering Guided cannot select an
  // older continuous ping merely because its next attempt happens first.
  let latestPing: { start: Extract<PingProgress, { type: 'started' }>; finished: boolean } | null = null;
  const armGuided = () => {
    const state = latestPing ? observeGuidedPingProgress(emptyGuidedPacket(), latestPing.start, sim.net.now) : emptyGuidedPacket();
    return latestPing?.finished ? observeGuidedPingProgress(state, { ...latestPing.start, type: 'finished' }, sim.net.now) : state;
  };
  const currentGuided = () => validateGuidedPacket(get().guidedPacket, (hop) => {
    const link = sim.net.links.get(hop.linkId);
    if (!link) return false;
    const from = link.a.device.id === hop.fromDeviceId ? link.a : link.b;
    const to = link.other(from);
    return from.device.id === hop.fromDeviceId && to.device.id === hop.toDeviceId &&
      from.name === hop.fromInterface && to.name === hop.toInterface;
  });
  let movement: { source: 'drag' | 'keyboard'; before: Map<string, Point> } | null = null;
  let ignoreDrag = false;
  let labCheckGeneration = 0;
  // Detection only: no serialized snapshot is ever applied to the live engine.
  const configuration = () => JSON.stringify(serializeNetwork(sim.net, {}));
  let historyConfiguration = '';
  // Only this form's consecutive confirmations may merge. Any other history
  // edit/navigation or invalidation breaks the group without a second history.
  let ipv4EditGroup: { token: object; history: TopologyHistory } | null = null;
  const checkHistoryConfiguration = () => {
    const current = configuration();
    if (historyConfiguration && current !== historyConfiguration) get().invalidateTopologyHistory();
    historyConfiguration = current;
  };
  const prepareEdit = () => { get().finishNodeMovement(); checkHistoryConfiguration(); };
  const commitEdit = (operation: TopologyOperation) => {
    historyConfiguration = configuration();
    set({ topologyHistory: recordOperation(get().topologyHistory, operation) });
  };
  const toggleExistingServer = (device: IpDevice, server: 'dhcpServer' | 'dnsServer' | 'httpServer'): boolean => {
    const config = device[server]; if (!config) return false;
    prepareEdit(); const before = config.enabled; config.enabled = !before;
    get().refresh();
    commitEdit({ type: 'set-server-enabled', label: (config.enabled ? 'Enable ' : 'Disable ') + server.replace('Server', '').toUpperCase() + ' server', deviceId: device.id, server, before, after: config.enabled });
    saveSoon(); return true;
  };
  const navigateHistory = (direction: 'undo' | 'redo') => {
    if (movement?.source === 'drag' || ignoreDrag) return;
    get().finishNodeMovement();
    checkHistoryConfiguration();
    const history = get().topologyHistory;
    const stack = direction === 'undo' ? history.past : history.future;
    const operation = stack.at(-1);
    if (!operation) return;
    if (operation.type === 'move-nodes') {
      const nodes = applyMovement(get().nodes, operation, direction);
      if (!nodes) { get().invalidateTopologyHistory(); return; }
      set({ nodes });
    } else if (isInspectorOperation(operation)) {
      if (operation.type === 'resize-switch') {
        const device = sim.net.devices.get(operation.deviceId);
        const delta = (direction === 'undo' ? operation.before - operation.after : operation.after - operation.before) > 0 ? 1 : -1;
        const error = device instanceof SwitchDevice ? device.portChangeError(delta) : 'Switch nicht verfügbar.';
        if (error) { get().setNotice(error); return; }
      }
      if (!applyInspectorEdit(sim.net, operation, direction)) { get().invalidateTopologyHistory(); return; }
      if (operation.type === 'set-host-os') refreshSessionProfile(operation.deviceId);
      get().refresh();
    } else if (operation.type === 'create-device') {
      const { device: creation } = operation, { saved } = creation;
      if (direction === 'undo') {
        const device = sim.net.devices.get(saved.id);
        const node = get().nodes.find((n) => n.id === saved.id);
        if (!device || !node || node.position.x !== saved.x || node.position.y !== saved.y ||
            device.interfaces.some((i) => i.link || i.mac !== creation.macs[i.name])) {
          get().invalidateTopologyHistory(); return;
        }
        removeElements([saved.id], []);
      } else {
        if (sim.net.devices.has(saved.id) || get().nodes.some((n) => n.id === saved.id)) { get().invalidateTopologyHistory(); return; }
        const device = restoreCreation(sim.net, creation);
        const nodes = [...get().nodes];
        nodes.splice(creation.index, 0, deviceNode(device.id, device.kind, device.name, saved.x, saved.y));
        set({ nodes });
        get().refresh();
        if (Object.keys(tabLayouts).length) saveTabs();
      }
    } else if (operation.type === 'delete-devices') {
      const ids = operation.devices.map((d) => d.saved.id);
      if (direction === 'undo') {
        if (get().nodes.some((n) => ids.includes(n.id)) || !restoreDeletedDevices(sim.net, operation.devices, operation.links)) {
          get().invalidateTopologyHistory(); get().setNotice('Cannot restore devices: topology conflicts with this operation.'); return;
        }
        const nodes = [...get().nodes];
        for (const { saved, index } of [...operation.devices].sort((a, b) => a.index - b.index)) {
          nodes.splice(index, 0, deviceNode(saved.id, saved.kind, saved.name, saved.x, saved.y));
        }
        set({ nodes, edges: edgesFromEngine(), terminalColors: { ...get().terminalColors, ...operation.colors } });
        get().refresh();
        if (Object.keys(tabLayouts).length) saveTabs();
      } else {
        const linkIds = operation.links.map((l) => l.id);
        const valid = operation.devices.every((snapshot) => {
          const device = sim.net.devices.get(snapshot.saved.id), node = get().nodes.find((n) => n.id === snapshot.saved.id);
          return device && node && !device.disposed &&
            device.interfaces.every((i) => !i.link || linkIds.includes(i.link.id)) &&
            JSON.stringify(captureCreation(sim.net, device, node.position, snapshot.index)) === JSON.stringify(snapshot);
        });
        if (!valid || !canApplyLinkEdit(sim.net, operation.links, false)) { get().invalidateTopologyHistory(); return; }
        removeElements(ids, linkIds);
      }
    } else {
      const add = (operation.type === 'add-links') === (direction === 'redo');
      if (!applyLinkEdit(sim.net, operation.links, add)) { get().invalidateTopologyHistory(); return; }
      set({ edges: edgesFromEngine(), packets: get().packets.filter((p) => !operation.links.some((l) => l.id === p.linkId)), guidedPacket: currentGuided() });
    }
    historyConfiguration = configuration();
    set({ topologyHistory: direction === 'undo'
      ? { past: history.past.slice(0, -1), future: [...history.future, operation] }
      : { past: [...history.past, operation], future: history.future.slice(0, -1) } });
    saveSoon();
  };
  let panelPreferences = readPanelPreferences();
  let tabLayouts: TerminalTabLayouts = {};
  const tabDevices = () => [...sim.net.devices.values()].map(({ id, kind }) => ({ id, kind }));
  const saveTabs = () => writeTabLayouts(tabDevices(), tabLayouts);
  const forgetTabs = (ids: string[]) => {
    if (!Object.keys(tabLayouts).length) return;
    tabLayouts = forgetSavedTabs(tabLayouts, ids);
    saveTabs();
  };
  const rememberPanels = (panels: TerminalPanel[], removed: string[] = [], force = false) => {
    const mode = get().terminalLayoutMode;
    if (!force && !Object.keys(panelPreferences[mode]).length) return;
    const next = rememberPanelPreferences(panelPreferences, mode, panels, removed);
    if (JSON.stringify(next) === JSON.stringify(panelPreferences)) return;
    panelPreferences = next;
    writePanelPreferences(next);
  };
  let flashSeq = 0;
  let wiredNetwork: Network | null = null;
  const wireNet = (net: Network) => {
    if (wiredNetwork && wiredNetwork !== net) {
      wiredNetwork.onWireTransfer = null;
      wiredNetwork.onFwDrop = null;
      wiredNetwork.onPingProgress = null;
      wiredNetwork.onClientConfiguration = null;
      capture.reset();
    }
    wiredNetwork = net;
    latestPing = null;
    net.onClientConfiguration = () => {
      if (sim.net !== net) return;
      checkHistoryConfiguration(); get().refresh(); saveSoon();
    };
    net.onWireTransfer = (t, context, trace) => {
      if (sim.net !== net) return;
      if (get().packetVisualizationMode === 'live') {
        const packets = get().packets;
        const visual = sequencePacketAnimation(t, trace, packets, animationNow, packetAnimationDuration(get().packetAnimationSpeed));
        if (visual) set({ packets: [...packets.slice(-(MAX_PACKETS - 1)), visual] });
      } else {
        const before = get().guidedPacket, payload = context.frame.payload;
        const to = net.devices.get(t.toDeviceId);
        const iface = to?.getInterface(context.toInterface);
        // Endpoint ownership identifies the last known link, not correlation or successful delivery.
        const destination = payload.kind === 'ipv4' && to instanceof IpDevice && to.hasIp(payload.dst) &&
          iface?.up === true && iface.mac === context.frame.dstMac;
        // Observe newly emitted continuations before testing completion at a delivery boundary.
        const guidedPacket = updateGuidedObservation(observeGuidedPacket(currentGuided(), t, context, trace, destination), net.now);
        if (guidedPacket !== before) set({ guidedPacket });
      }
      if (sim.net === net) capture.observe(t, context);
    };
    net.onPingProgress = (event) => {
      if (sim.net !== net) return;
      if (event.type === 'started') latestPing = { start: event, finished: false };
      else if (event.type === 'finished' && latestPing?.start.deviceId === event.deviceId && latestPing.start.icmpId === event.icmpId) latestPing.finished = true;
      if (get().packetVisualizationMode !== 'guided') return;
      const guidedPacket = observeGuidedPingProgress(currentGuided(), event, net.now);
      if (guidedPacket !== get().guidedPacket) set({ guidedPacket });
    };
    net.onFwDrop = (deviceId) => {
      if (sim.net !== net) return;
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

  const currentSave = (): AppearanceSaveFile => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of get().nodes) positions[n.id] = { x: n.position.x, y: n.position.y };
    const save: AppearanceSaveFile = serializeNetwork(sim.net, positions);
    if (Object.keys(get().terminalColors).length) {
      save.ui = { terminalColors: { ...get().terminalColors } };
    }
    const appearance = get().terminalAppearance;
    // An explicit size distinguishes new defaults from the legacy 13px files.
    save.ui = { ...save.ui, terminalAppearance: { ...appearance } };
    if (get().terminalLayoutMode !== 'free') save.ui.terminalLayoutMode = get().terminalLayoutMode;
    const lab = get().lab;
    if (lab) {
      save.lab = lab;
      save.labProgress = {
        step: get().labStep,
        results: get().labResults,
        quiz: get().quizAnswers,
      };
    }
    return save;
  };

  const download = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentSvg = () =>
    topologySvg(
      sim.net,
      get().nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
    );

  const saveNow = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(currentSave()));
    } catch {
      // Storage full or unavailable; autosave is best-effort.
    }
  };

  const saveSoon = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  };

  const removeElements = (nodeIds: string[], edgeIds: string[]) => {
    const ids = new Set(nodeIds), links = new Set(edgeIds), oldPanels = get().terminalPanels;
    if (ids.size) { labCheckGeneration++; set({ labChecking: false }); }
    for (const id of ids) disposeSession(id);
    for (const id of links) sim.net.disconnect(id);
    for (const id of ids) sim.net.removeDevice(id);
    const terminals = get().terminals.filter((id) => !ids.has(id));
    forgetTabs(nodeIds);
    set({
      nodes: get().nodes.filter((n) => !ids.has(n.id)), edges: edgesFromEngine(),
      packets: get().packets.filter((p) => !ids.has(p.fromDeviceId) && !ids.has(p.toDeviceId) && !links.has(p.linkId)),
      guidedPacket: currentGuided(),
      dropFlashes: get().dropFlashes.filter((f) => !ids.has(f.deviceId)),
      terminals, terminalDockCollapsed: get().terminalDockCollapsed && terminals.length > 0,
      ...prunePanelSessions(get().terminalPanels, terminals, get().activeTerminal),
      terminalHasFocus: get().terminalHasFocus && !ids.has(get().activeTerminal ?? ''),
      selected: ids.has(get().selected ?? '') ? null : get().selected,
      terminalColors: Object.fromEntries(Object.entries(get().terminalColors).filter(([id]) => !ids.has(id))),
    });
    rememberPanels(get().terminalPanels, oldPanels.filter((p) => !get().terminalPanels.some((next) => next.id === p.id)).map((p) => p.id));
    saveSoon();
  };

  const adoptSave = (data: AppearanceSaveFile) => {
    disposeAllSessions();
    sim.net = restoreNetwork(data);
    labCheckGeneration++;
    tabLayouts = readTabLayouts(tabDevices());
    wireNet(sim.net);
    const nodes = data.devices.map((d) => deviceNode(d.id, d.kind, d.name, d.x, d.y));
    set({
      nodes,
      edges: edgesFromEngine(),
      hoveredLinkId: null,
      packets: [],
      guidedPacket: emptyGuidedPacket(),
      dropFlashes: [],
      selected: null,
      terminals: [],
      activeTerminal: null,
      terminalPanels: [],
      terminalHasFocus: false,
      terminalDockCollapsed: false,
      terminalColors: readTerminalColors(data),
      terminalAppearance: readTerminalAppearance(data),
      terminalLayoutMode: normalizeTerminalLayoutMode(data.ui?.terminalLayoutMode),
      lab: data.lab ?? null,
      labStep: data.labProgress?.step ?? 0,
      labResults: data.labProgress?.results ?? {},
      labChecking: false,
      quizAnswers: data.labProgress?.quiz ?? {},
    });
    get().refresh();
    get().invalidateTopologyHistory();
    ignoreDrag = false;
  };

  return {
    cableStyle: loadCableStyle(),
    setCableStyle(style) {
      const cableStyle = style === 'hybrid' ? 'hybrid' : 'straight';
      set({ cableStyle });
      try { localStorage.setItem('netlab-cable-style', cableStyle); } catch { /* Session preference still works. */ }
    },
    packetVisualizationMode: 'live',
    guidedPacket: emptyGuidedPacket(),
    setPacketVisualizationMode(packetVisualizationMode) {
      if (packetVisualizationMode === get().packetVisualizationMode) return;
      set({ packetVisualizationMode, guidedPacket: packetVisualizationMode === 'guided' ? armGuided() : emptyGuidedPacket(), packets: [] });
    },
    toggleGuidedPlayback() {
      const state = currentGuided();
      set({ guidedPacket: toggleGuidedPlayback(state) });
    },
    nextGuidedHop() { set({ guidedPacket: stepGuidedPacket(currentGuided()) }); },
    replayGuidedPacket() { set({ guidedPacket: replayGuidedPacket(currentGuided()) }); },
    followGuidedPacket() { set({ guidedPacket: followGuidedPacket(currentGuided()) }); },
    packetAnimationClock: animationNow,
    packetAnimationSpeed: readPacketAnimationSpeed(),
    setPacketAnimationSpeed(value) {
      const speed = normalizePacketAnimationSpeed(value);
      if (speed === get().packetAnimationSpeed) return;
      set({ packetAnimationSpeed: speed, packets: retimePacketAnimations(get().packets, animationNow, packetAnimationDuration(speed)) });
      savePacketAnimationSpeed(speed);
    },
    packetCapture: capture.state,
    packetInspectorOpen: false,
    setPacketInspectorOpen(packetInspectorOpen) { set({ packetInspectorOpen }); },
    startPacketCapture(linkId = null) {
      if (linkId !== null && !sim.net.links.has(linkId)) return;
      capture.start(linkId);
    },
    pausePacketCapture() { capture.pause(); },
    resumePacketCapture() { capture.resume(); },
    stopPacketCapture() { capture.stop(); },
    clearPacketCapture() { capture.clear(); },
    topologyHistory: emptyTopologyHistory(),
    beginNodeMovement(source) {
      checkHistoryConfiguration();
      if (movement?.source === source) return;
      get().finishNodeMovement();
      ignoreDrag = false;
      movement = { source, before: new Map(get().nodes.map((n) => [n.id, { ...n.position }])) };
    },
    finishNodeMovement() {
      checkHistoryConfiguration();
      const pending = movement;
      movement = null;
      ignoreDrag = false;
      if (!pending) return;
      const changes = get().nodes.flatMap((n) => {
        const before = pending.before.get(n.id);
        return before ? [{ id: n.id, before, after: n.position }] : [];
      });
      const history = recordMovement(get().topologyHistory, changes);
      if (history !== get().topologyHistory) { set({ topologyHistory: history }); saveSoon(); }
    },
    cancelNodeMovement() {
      if (!movement) return;
      const pending = movement;
      movement = null;
      ignoreDrag = pending.source === 'drag';
      set({ nodes: get().nodes.map((n) => pending.before.has(n.id) ? { ...n, position: { ...pending.before.get(n.id)! } } : n) });
      saveSoon();
    },
    invalidateTopologyHistory() {
      if (movement?.source === 'drag') ignoreDrag = true;
      movement = null;
      historyConfiguration = '';
      if (get().topologyHistory.past.length || get().topologyHistory.future.length) set({ topologyHistory: emptyTopologyHistory() });
    },
    undoTopology() { navigateHistory('undo'); },
    redoTopology() { navigateHistory('redo'); },
    nodes: [],
    edges: [],
    packets: [],
    dropFlashes: [],
    clock: 0,
    uiPulse: 0,
    selected: null,
    hoveredLinkId: null,
    hoverLink(id) { set({ hoveredLinkId: id }); },
    clearLinkSelection() { set({ hoveredLinkId: null, edges: get().edges.map(e => e.selected ? { ...e, selected: false } : e) }); },
    terminals: [],
    activeTerminal: null,
    terminalPanels: [],
    terminalHasFocus: false,
    terminalFocusRequest: 0,
    terminalDockCollapsed: false,
    terminalLayoutMode: 'free',
    terminalColors: {},
    terminalAppearance: { ...DEFAULT_TERMINAL_APPEARANCE },
    paused: false,
    speed: 1,
    notice: null,

    lab: null,
    labStep: 0,
    labResults: {},
    labChecking: false,
    quizAnswers: {},

    hostCreationMode: readHostCreationMode(),
    setHostCreationMode(value) {
      const mode = normalizeHostCreationMode(value);
      set({ hostCreationMode: mode }); saveHostCreationMode(mode);
    },
    setHostOs(id, os) {
      const d = sim.net.devices.get(id);
      if (!(d instanceof Host) || d.disposed || (os !== 'linux' && os !== 'windows') || d.os === os) return;
      prepareEdit();
      const before = d.os; d.os = os;
      refreshSessionProfile(id);
      get().refresh();
      commitEdit({ type: 'set-host-os', label: 'Change host OS', deviceId: id, before, after: os });
      saveSoon();
    },
    addDeviceAt(kind, pos) {
      prepareEdit();
      const d = createDevice(sim.net, kind, kind === 'host' ? { os: chooseHostOs(get().hostCreationMode) } : {});
      const creation = captureCreation(sim.net, d, pos, get().nodes.length);
      set({ nodes: [...get().nodes, deviceNode(d.id, kind, d.name, pos.x, pos.y)] });
      commitEdit({ type: 'create-device', label: `Create ${d.name}`, device: creation });
      if (Object.keys(tabLayouts).length) saveTabs();
      saveSoon();
    },

    onNodesChange(changes) {
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      if (removed.length) get().deleteTopologyElements(removed);
      changes = changes.filter((c) => c.type !== 'remove');
      const structural = changes.some((c) => c.type === 'add' || c.type === 'replace');
      if (structural) get().invalidateTopologyHistory();
      if (ignoreDrag) changes = changes.filter((c) => c.type !== 'position');
      const positions = changes.filter((c) => c.type === 'position');
      if (!structural && positions.length && !ignoreDrag && !movement) get().beginNodeMovement('drag');
      set({ nodes: applyNodeChanges(changes, get().nodes) });
      if (changes.some((c) => c.type === 'position' && !c.dragging)) saveSoon();
      if (!structural && movement?.source === 'drag' && positions.length && !positions.some((c) => c.dragging)) get().finishNodeMovement();
    },

    onEdgesChange(changes) {
      const unsupported = changes.some((c) => c.type === 'add' || c.type === 'replace');
      if (changes.some((c) => c.type === 'remove')) prepareEdit();
      if (unsupported) get().invalidateTopologyHistory();
      const removed = [...new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))]
        .flatMap((id) => { const link = sim.net.links.get(id); return link ? [captureLink(link)] : []; });
      for (const ch of changes) {
        if (ch.type === 'remove') sim.net.disconnect(ch.id);
      }
      set({ edges: applyEdgeChanges(changes, get().edges), packets: get().packets.filter((p) => !removed.some((l) => l.id === p.linkId)), guidedPacket: currentGuided() });
      if (removed.length && !unsupported) commitEdit({ type: 'remove-links', label: removed.length === 1 ? 'Remove cable' : `Remove ${removed.length} cables`, links: removed });
      if (changes.some((c) => c.type === 'remove')) saveSoon();
    },

    onConnect(c) {
      if (!c.source || !c.target) return;
      prepareEdit();
      try {
        const link = sim.net.connect(c.source, c.target);
        set({ edges: edgesFromEngine() });
        commitEdit({ type: 'add-links', label: 'Connect devices', links: [captureLink(link)] });
        saveSoon();
      } catch (e) {
        get().setNotice(e instanceof Error ? e.message : String(e));
      }
    },

    select(id) {
      set({ selected: id });
    },

    deleteDevice(id) { get().deleteTopologyElements([id]); },

    deleteTopologyElements(nodeIds, edgeIds = []) {
      prepareEdit();
      const ids = new Set(nodeIds.filter((id) => sim.net.devices.has(id)));
      const devices = get().nodes.flatMap((n, index) => ids.has(n.id)
        ? [captureCreation(sim.net, sim.net.devices.get(n.id)!, n.position, index)] : []);
      // Include explicitly selected cables as well as every incident cable;
      // iterating the engine map deduplicates shared links in multi-node deletes.
      const links = [...sim.net.links.values()].filter((l) => edgeIds.includes(l.id) || ids.has(l.a.device.id) || ids.has(l.b.device.id)).map(captureLink);
      if (!devices.length && !links.length) return;
      const colors = Object.fromEntries(Object.entries(get().terminalColors).filter(([id]) => ids.has(id)));
      removeElements([...ids], links.map((l) => l.id));
      commitEdit(devices.length ? {
        type: 'delete-devices', label: devices.length === 1 ? 'Delete device' : `Delete ${devices.length} devices`, devices, links, colors,
      } : { type: 'remove-links', label: links.length === 1 ? 'Remove cable' : `Remove ${links.length} cables`, links });
    },

    renameDevice(id, name) {
      const d = sim.net.devices.get(id);
      const after = name.trim();
      if (!d || d.disposed || !after || d.name === after) return;
      prepareEdit();
      const before = d.name;
      d.name = after;
      get().refresh();
      commitEdit({ type: 'rename-device', label: 'Rename device', deviceId: id, before, after });
      saveSoon();
    },

    setIfaceIp(deviceId, ifaceName, value) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return 'not an IP device';
      const iface = d.getInterface(ifaceName);
      if (!iface) return 'no such interface';
      const trimmed = value.trim();
      const after = trimmed === '' ? null : parseCidr(trimmed);
      if (trimmed && !after) return 'use CIDR form, e.g. 192.168.1.10/24';
      return get().setInterfaceIpv4(deviceId, ifaceName, { mode: after ? 'static' : 'unconfigured', ip: after,
        gateway: after && iface.ipv4Mode === 'static' ? iface.gateway : null, dns: after && iface.ipv4Mode === 'static' ? iface.dns : null });
    },

    setInterfaceIpv4(deviceId, ifaceName, value, editGroup) {
      const d = sim.net.devices.get(deviceId), iface = d?.getInterface(ifaceName);
      if (!(d instanceof IpDevice) || d.disposed || !iface) return 'Interface nicht verfügbar.';
      if (!validIpv4(value)) return 'Ungültige IPv4-Konfiguration.';
      const before = iface.ipv4, after = structuredClone(value);
      if (sameIpv4(before, after)) return null;
      prepareEdit();
      const history = get().topologyHistory, previous = history.past.at(-1);
      const merge = editGroup && ipv4EditGroup?.token === editGroup && ipv4EditGroup.history === history
        && !history.future.length && previous?.type === 'set-interface-ipv4'
        && previous.deviceId === deviceId && previous.ifaceName === ifaceName && sameIpv4(previous.after, before);
      const cancelledGroup = merge && previous?.type === 'set-interface-ipv4' && sameIpv4(previous.before, after);
      iface.configureIpv4(after);
      get().refresh();
      if (merge && previous?.type === 'set-interface-ipv4') {
        historyConfiguration = configuration();
        const operation = { ...previous, after };
        set({ topologyHistory: { past: sameIpv4(previous.before, after) ? history.past.slice(0, -1)
          : [...history.past.slice(0, -1), structuredClone(operation)], future: [] } });
      } else commitEdit({ type: 'set-interface-ipv4', label: 'Configure interface IPv4', deviceId, ifaceName, before, after });
      ipv4EditGroup = editGroup && !cancelledGroup ? { token: editGroup, history: get().topologyHistory } : null;
      saveSoon();
      return null;
    },

    renewInterfaceDhcp(deviceId, ifaceName) {
      const d = sim.net.devices.get(deviceId), net = sim.net;
      const iface = d?.getInterface(ifaceName);
      if (!(d instanceof IpDevice) || d.disposed || !iface || iface.ipv4Mode !== 'dhcp' || iface.cancelDhcp) return;
      let message = '';
      runDhclient(d, [ifaceName], (text) => { message = text; }, () => {
        if (sim.net !== net || d.disposed) return;
        get().refresh();
        if (message) get().setNotice(message.trim());
      });
      get().refresh();
    },

    toggleIface(deviceId, ifaceName) {
      const d = sim.net.devices.get(deviceId);
      const iface = d?.getInterface(ifaceName);
      if (!d || d.disposed || !iface) return;
      prepareEdit();
      const before = iface.up, after = !before;
      iface.up = after;
      get().refresh();
      commitEdit({ type: 'set-iface-state', label: `Set interface ${after ? 'UP' : 'DOWN'}`, deviceId, ifaceName, before, after });
      saveSoon();
    },

    setServices(deviceId, proto, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return 'not an IP device';
      const ports = new Set<number>();
      for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
        const n = Number(part);
        if (!Number.isInteger(n) || n < 1 || n > 65535) return `invalid port "${part}"`;
        ports.add(n);
      }
      const after = sortedServicePorts(ports);
      if (sameServicePorts(d.services[proto], after)) return null;
      prepareEdit();
      const before = sortedServicePorts(d.services[proto]);
      d.services[proto] = new Set(after);
      get().refresh();
      commitEdit({ type: 'set-services', label: `Set ${proto.toUpperCase()} ports`, deviceId, proto, before, after });
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
      if (!(d instanceof IpDevice) || d.disposed) return 'not an IP device';
      const trimmed = text.trim();
      const after = trimmed === '' ? null : parseIp(trimmed);
      if (trimmed && after === null) return 'invalid nameserver address';
      if (d.manualNameserver === after) return null;
      prepareEdit();
      const before = d.manualNameserver;
      d.nameserver = after;
      get().refresh();
      commitEdit({ type: 'set-nameserver', label: after === null ? 'Remove nameserver' : 'Set nameserver', deviceId, before, after });
      saveSoon();
      return null;
    },

    toggleDhcpServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return;
      if (toggleExistingServer(d, 'dhcpServer')) return;
      prepareEdit();
      const iface = d.interfaces.find((i) => i.ip);
      const base = iface?.ip ? (iface.ip.addr & 0xffffff00) >>> 0 : parseIp('192.168.0.0')!;
      d.dhcpServer = { enabled: true, rangeStart: (base | 100) >>> 0, rangeEnd: (base | 150) >>> 0,
        router: iface?.ip?.addr ?? null, dns: d.nameserver, leases: new Map() };
      get().refresh();
      commitEdit({ type: 'create-dhcp-server', label: 'Create DHCP server', deviceId, after: dhcpSettings(d)! });
      saveSoon();
    },

    setDhcpField(deviceId, field, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed || !d.dhcpServer) return 'DHCP server not enabled';
      const trimmed = text.trim(), after = trimmed === '' ? null : parseIp(trimmed);
      if ((field === 'rangeStart' || field === 'rangeEnd' || trimmed !== '') && after === null) return 'invalid address';
      const c = d.dhcpServer;
      if (c[field] === after) return null;
      prepareEdit();
      if (field === 'router' || field === 'dns') {
        const before = c[field]; c[field] = after;
        commitEdit({ type: 'set-dhcp-field', label: 'Set DHCP ' + field, deviceId, field, before, after });
      } else {
        if (after === null) return 'invalid address';
        const before = c[field]; c[field] = after;
        commitEdit({ type: 'set-dhcp-field', label: 'Set DHCP ' + field, deviceId, field, before, after });
      }
      get().refresh(); saveSoon(); return null;
    },

    toggleDnsServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return;
      if (toggleExistingServer(d, 'dnsServer')) return;
      prepareEdit(); d.dnsServer = { enabled: true, records: new Map() };
      get().refresh();
      commitEdit({ type: 'create-dns-server', label: 'Create DNS server', deviceId, after: { enabled: true, records: [] } });
      saveSoon();
    },

    setDnsRecords(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed || !d.dnsServer) return 'DNS server not enabled';
      const records = new Map<string, number>();
      for (const line of text.split('\n')) {
        const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#')) continue;
        const [addr, name] = trimmed.split(/\s+/), ip = parseIp(addr ?? '');
        if (ip === null || !name) return 'invalid hosts line: "' + trimmed + '" (use: <ip> <name>)';
        records.set(name.toLowerCase(), ip);
      }
      const before = sortedDnsRecords(d.dnsServer.records), after = sortedDnsRecords(records);
      if (JSON.stringify(before) === JSON.stringify(after)) return null;
      prepareEdit(); d.dnsServer.records = new Map(after);
      get().refresh(); commitEdit({ type: 'set-dns-records', label: 'Set DNS A records', deviceId, before, after });
      saveSoon(); return null;
    },

    toggleHttpServer(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return;
      if (toggleExistingServer(d, 'httpServer')) return;
      prepareEdit();
      d.httpServer = { enabled: true, port: 80, body: '<html><body><h1>Hello from ' + d.name + '</h1></body></html>' };
      get().refresh();
      commitEdit({ type: 'create-http-server', label: 'Create HTTP server', deviceId, after: { ...d.httpServer } });
      saveSoon();
    },

    setHttpPort(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed || !d.httpServer) return 'web server not enabled';
      const after = Number(text.trim());
      if (!Number.isInteger(after) || after < 1 || after > 65535) return 'invalid port';
      if (d.httpServer.port === after) return null;
      prepareEdit(); const before = d.httpServer.port; d.httpServer.port = after;
      get().refresh(); commitEdit({ type: 'set-http-port', label: 'Set HTTP port', deviceId, before, after });
      saveSoon(); return null;
    },

    setHttpBody(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed || !d.httpServer || d.httpServer.body === text) return;
      prepareEdit(); const before = d.httpServer.body; d.httpServer.body = text;
      get().refresh(); commitEdit({ type: 'set-http-body', label: 'Set HTTP response', deviceId, before, after: text });
      saveSoon();
    },

    toggleRip(deviceId) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof IpDevice) || d.disposed) return;
      prepareEdit();
      const before = d.ripEnabled, after = !before;
      d.enableRip(after);
      get().refresh();
      commitEdit({ type: 'set-rip-enabled', label: after ? 'Enable RIP' : 'Disable RIP', deviceId, before, after });
      saveSoon();
    },

    resizeSwitch(deviceId, delta) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof SwitchDevice) || (delta !== 1 && delta !== -1)) return 'Kein anpassbarer Switch.';
      const error = d.portChangeError(delta);
      if (error) return error;
      prepareEdit();
      const before = d.interfaces.length;
      const port = delta === 1 ? d.addPort() : d.removeLastPort();
      get().refresh();
      commitEdit({ type: 'resize-switch', label: delta === 1 ? 'Add switch port' : 'Remove switch port', deviceId, before, after: d.interfaces.length, port: { name: port.name, mac: port.mac } });
      saveSoon();
      return null;
    },

    setPortVlan(deviceId, port, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof SwitchDevice) || d.disposed) return 'not a switch';
      if (!d.getInterface(port)) return 'no such interface';
      const vlan = Number(text.trim());
      if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) return 'VLAN must be 1–4094';
      if (d.vlanOf(port) === vlan) return null;
      prepareEdit();
      const before = d.vlanOf(port);
      applyAccessVlan(d, port, vlan);
      get().refresh();
      commitEdit({ type: 'set-port-vlan', label: 'Set access VLAN', deviceId, port, before, after: vlan });
      saveSoon();
      return null;
    },

    setSsid(deviceId, text) {
      const d = sim.net.devices.get(deviceId);
      if (!(d instanceof ApDevice) || d.disposed) return 'not an access point';
      const after = text.trim();
      if (!after) return 'SSID cannot be empty';
      if (d.ssid === after) return null;
      prepareEdit();
      const before = d.ssid;
      d.ssid = after;
      get().refresh();
      commitEdit({ type: 'set-ssid', label: 'Set access point SSID', deviceId, before, after });
      saveSoon();
      return null;
    },

    openTerminal(id) {
      const d = sim.net.devices.get(id);
      if (!d || !(d instanceof IpDevice)) return;
      getSession(d, {
        onAfterCommand: (configurationChanged) => {
          // A completed ping must not invalidate newer movement history just
          // because another editor action changed configuration while it ran.
          if (configurationChanged) checkHistoryConfiguration();
          get().refresh();
          if (configurationChanged) saveSoon();
        },
      });
      const terminals = get().terminals.includes(id) ? get().terminals : [...get().terminals, id];
      const mode = get().terminalLayoutMode;
      let terminalPanels = insertSavedTab(get().terminalPanels, id, get().activeTerminal, mode, tabDevices(), tabLayouts[mode]);
      if (terminalPanels.some((panel) => !get().terminalPanels.some((old) => old.id === panel.id) && panelPreferences[get().terminalLayoutMode][panel.id])) {
        terminalPanels = applyPanelPreferences(terminalPanels, panelPreferences, get().terminalLayoutMode);
      }
      rememberPanels(terminalPanels);
      if (tabLayouts[mode] && !tabLayouts[mode]!.some((panel) => panel.tabs.includes(id))) {
        tabLayouts[mode] = mergeTabLayouts(tabLayouts[mode], terminalPanels, terminals);
        saveTabs();
      }
      set({ terminals, terminalPanels,
        activeTerminal: id, terminalHasFocus: true, terminalDockCollapsed: false, terminalFocusRequest: get().terminalFocusRequest + 1 });
    },

    closeTerminal(id) {
      forgetTabs([id]);
      const oldPanels = get().terminalPanels;
      disposeSession(id);
      const terminals = get().terminals.filter((t) => t !== id);
      const next = prunePanelSessions(get().terminalPanels, terminals, get().activeTerminal);
      const refocus = !get().terminalDockCollapsed && id === get().activeTerminal && next.activeTerminal !== null;
      rememberPanels(next.terminalPanels, oldPanels.filter((p) => !next.terminalPanels.some((next) => next.id === p.id)).map((p) => p.id));
      set({
        terminals,
        ...next,
        terminalDockCollapsed: terminals.length > 0 && get().terminalDockCollapsed,
        terminalHasFocus: refocus || (next.activeTerminal !== null && get().terminalHasFocus),
        terminalFocusRequest: get().terminalFocusRequest + (refocus ? 1 : 0),
      });
    },

    setActiveTerminal(id) {
      if (!get().terminals.includes(id)) return;
      set({ terminalPanels: activatePanelSession(get().terminalPanels, id), activeTerminal: id,
        terminalHasFocus: true, terminalDockCollapsed: false, terminalFocusRequest: get().terminalFocusRequest + 1 });
    },

    noteTerminalFocus(id) {
      if (!get().terminals.includes(id) || (get().activeTerminal === id && get().terminalHasFocus)) return;
      set({ terminalPanels: activatePanelSession(get().terminalPanels, id), activeTerminal: id, terminalHasFocus: true });
    },

    noteTerminalPanelFocus(id) {
      const panel = get().terminalPanels.find((item) => item.id === id);
      if (panel && (get().activeTerminal !== panel.active || get().terminalHasFocus)) set({ activeTerminal: panel.active, terminalHasFocus: false });
    },

    releaseTerminalFocus() {
      if (get().terminalHasFocus) set({ terminalHasFocus: false });
    },

    setTerminalDockCollapsed(collapsed) {
      if (!get().terminals.length || collapsed === get().terminalDockCollapsed) return;
      set({ terminalDockCollapsed: collapsed, terminalHasFocus: !collapsed && get().activeTerminal !== null,
        terminalFocusRequest: get().terminalFocusRequest + (collapsed ? 0 : 1) });
    },

    setTerminalPanels(panels) {
      // Width changes only; membership and order have their own actions.
      set({ terminalPanels: get().terminalPanels.map((panel) => {
        const next = panels.find((item) => item.id === panel.id);
        if (!next || !Number.isFinite(next.weight) || next.weight <= 0) return panel;
        if (panel.lockedWidth === undefined) return { ...panel, weight: next.weight };
        // An explicit resize updates the protected pixels without changing the lock.
        const width = next.lockedWidth;
        return width !== undefined && Number.isFinite(width) && width >= MIN_TERMINAL_PANEL_WIDTH && width <= 32768
          ? { ...panel, weight: next.weight, lockedWidth: width } : panel;
      }) });
      rememberPanels(get().terminalPanels, [], true);
    },

    toggleTerminalPanelLock(id, widths) {
      const target = get().terminalPanels.find((panel) => panel.id === id);
      if (!target || !Number.isFinite(widths[id]) || widths[id] < MIN_TERMINAL_PANEL_WIDTH) return;
      const panels = get().terminalPanels.map((panel) => {
        const width = Number.isFinite(widths[panel.id]) ? Math.max(MIN_TERMINAL_PANEL_WIDTH, widths[panel.id]) : panel.weight;
        const next = panel.lockedWidth === undefined || panel.id === id ? { ...panel, weight: width } : panel;
        if (panel.id !== id) return next;
        if (panel.lockedWidth === undefined) return { ...next, lockedWidth: Math.min(32768, widths[id]) };
        const { lockedWidth: _lockedWidth, ...unlocked } = next;
        return unlocked;
      });
      set({ terminalPanels: panels });
      rememberPanels(panels, [], true);
    },

    moveTerminalTab(id, destination) {
      const previous = get().terminalPanels;
      const mode = get().terminalLayoutMode;
      const panels = movePanelSession(previous, id, destination, mode, tabLayouts[mode]?.map((p) => p.id));
      if (panels === previous) return;
      for (const openId of get().terminals) {
        const device = sim.net.devices.get(openId);
        if (device instanceof IpDevice) capturePresentationSelection(getSession(device).term);
      }
      tabLayouts[mode] = mergeTabLayouts(tabLayouts[mode], panels, get().terminals);
      saveTabs();
      rememberPanels(panels, previous.filter((old) => !panels.some((panel) => panel.id === old.id)).map((panel) => panel.id), true);
      set({ terminalPanels: panels, activeTerminal: id, terminalHasFocus: true, terminalDockCollapsed: false,
        terminalFocusRequest: get().terminalFocusRequest + 1 });
    },

    reorderTerminalPanel(id, beforeId) {
      const panels = moveTerminalPanel(get().terminalPanels, id, beforeId);
      if (panels === get().terminalPanels) return;
      const mode = get().terminalLayoutMode;
      tabLayouts[mode] = mergeTabLayouts(tabLayouts[mode], panels, get().terminals);
      saveTabs();
      rememberPanels(panels, [], true);
      // Moving a focused DOM subtree can clear native focus even though React
      // keeps its identity. Ask the existing active session to focus again.
      set({ terminalPanels: panels, terminalFocusRequest: get().terminalFocusRequest + (get().terminalHasFocus ? 1 : 0) });
    },

    setTerminalLayoutMode(value) {
      const mode = normalizeTerminalLayoutMode(value);
      if (mode === get().terminalLayoutMode) return;
      const ids = get().terminals;
      const active = get().activeTerminal;
      const terminalPanels = ids.reduce<TerminalPanel[]>((panels, id) => insertSavedTab(panels, id, active, mode, tabDevices(), tabLayouts[mode]), []);
      const activated = active ? activatePanelSession(terminalPanels, active) : terminalPanels;
      set({ terminalLayoutMode: mode, terminalPanels: applyPanelPreferences(activated, panelPreferences, mode) });
      saveSoon();
    },

    cycleTerminal(direction, origin) {
      // Read the presentation order at navigation time; never cache a second list.
      const order = get().terminalPanels.flatMap((panel) => panel.tabs);
      const next = adjacentTerminal(order, origin ?? get().activeTerminal, direction);
      if (next !== null) get().setActiveTerminal(next);
    },

    setTerminalColor(id, value) {
      const device = sim.net.devices.get(id);
      if (!device || !hasTerminalColor(device.kind)) return;
      const color = value === null ? null : normalizeTerminalColor(value);
      if (value !== null && !color) return;
      const custom = color === DEFAULT_TERMINAL_COLORS[device.kind] ? null : color;
      if ((get().terminalColors[id] ?? null) === custom) return;
      const colors = { ...get().terminalColors };
      if (custom) Object.defineProperty(colors, id, { value: custom, enumerable: true, configurable: true, writable: true });
      else delete colors[id];
      set({ terminalColors: colors });
      saveSoon();
    },

    setTerminalAppearance(preference) {
      const next = normalizeTerminalAppearance({ ...get().terminalAppearance, ...preference });
      const current = get().terminalAppearance;
      if (next.style === current.style && next.intensity === current.intensity && next.fontSize === current.fontSize && next.fontFamily === current.fontFamily) return;
      set({ terminalAppearance: next });
      saveSoon();
    },

    resetTerminalAppearance() {
      const current = get().terminalAppearance;
      const defaults = DEFAULT_TERMINAL_APPEARANCE;
      if (!Object.keys(get().terminalColors).length && Object.entries(defaults).every(([key, value]) => current[key as keyof TerminalAppearance] === value)) return;
      set({ terminalColors: {}, terminalAppearance: { ...defaults } });
      saveSoon();
    },

    flushAutosave() {
      if (saveTimer !== null) saveNow();
    },

    refresh() {
      set({
        nodes: get().nodes.map((n) => {
          const d = sim.net.devices.get(n.id);
          if (!d) return n;
          const fw = d instanceof IpDevice ? d.fw.active() : false;
          return { ...n, data: { ...n.data, label: d.name, ips: deviceIps(n.id), fw, ...(d instanceof Host ? { os: d.os } : {}) } };
        }),
      });
    },

    tick(dtMs) {
      const elapsed = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
      if (get().paused) {
        // Guided playback is independent of network pause; collecting still waits for simulated delivery.
        if (get().packetVisualizationMode === 'guided') {
          const guidedPacket = advanceGuidedPacket(currentGuided(), elapsed, packetAnimationDuration(get().packetAnimationSpeed));
          if (guidedPacket !== get().guidedPacket) set({ guidedPacket });
        }
        return;
      }
      animationNow += Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
      const dt = Math.min(dtMs, 100) * get().speed;
      sim.net.scheduler.advanceTo(sim.net.scheduler.now + dt);
      const now = sim.net.scheduler.now;
      const packets = get().packets;
      const alive = packets.filter((p) => p.visualStart + p.visualDuration > animationNow);
      const flashes = get().dropFlashes;
      const aliveFlashes = flashes.filter((f) => f.until > now);
      const pulse = Math.floor(now / 400);
      set({
        clock: now,
        ...(get().packetVisualizationMode === 'guided' ? { guidedPacket: advanceGuidedPacket(
          updateGuidedObservation(currentGuided(), now), elapsed, packetAnimationDuration(get().packetAnimationSpeed)) } : {}),
        packetAnimationClock: animationNow,
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
      labCheckGeneration++;
      get().invalidateTopologyHistory();
      ignoreDrag = false;
      tabLayouts = {};
      try { if (localStorage.getItem(TAB_LAYOUT_KEY)) writeTabLayouts([], {}); } catch { /* Optional persistence. */ }
      panelPreferences = readPanelPreferences();
      disposeAllSessions();
      sim.net = new Network();
      wireNet(sim.net);
      set({
        nodes: [],
        edges: [],
        hoveredLinkId: null,
        packets: [],
        guidedPacket: emptyGuidedPacket(),
        dropFlashes: [],
        selected: null,
        terminals: [],
        activeTerminal: null,
        terminalPanels: [],
        terminalHasFocus: false,
        terminalDockCollapsed: false,
        terminalColors: {},
        terminalAppearance: { ...DEFAULT_TERMINAL_APPEARANCE },
        terminalLayoutMode: 'free',
        lab: null,
        labStep: 0,
        labResults: {},
        labChecking: false,
        quizAnswers: {},
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
      download('netsim-topology.json', new Blob([JSON.stringify(currentSave(), null, 2)], { type: 'application/json' }));
    },

    exportConfigs() {
      const files = configBundle(sim.net);
      const entries: Record<string, Uint8Array> = {};
      for (const f of files) entries[`netsim-configs/${f.path}`] = strToU8(f.content);
      const zipped = zipSync(entries);
      download('netsim-configs.zip', new Blob([zipped.slice().buffer], { type: 'application/zip' }));
      get().setNotice('Config bundle exported — real iproute2/nftables/dnsmasq files');
    },

    exportContainerlab() {
      download('netsim.clab.yml', new Blob([containerlabYaml(sim.net)], { type: 'text/yaml' }));
      get().setNotice('containerlab topology exported — deploy with: containerlab deploy -t netsim.clab.yml');
    },

    exportCompose() {
      download('docker-compose.yml', new Blob([composeYaml(sim.net)], { type: 'text/yaml' }));
      get().setNotice('docker-compose exported (approximate L2 — see header note)');
    },

    exportSvg() {
      download('netsim-topology.svg', new Blob([currentSvg()], { type: 'image/svg+xml' }));
    },

    exportPng() {
      svgToPngBlob(currentSvg())
        .then((blob) => download('netsim-topology.png', blob))
        .catch(() => get().setNotice('PNG export failed in this browser — try the SVG export'));
    },

    exportReport() {
      const positions = get().nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const html = networkReport(sim.net, positions, new Date().toLocaleString());
      download('netsim-report.html', new Blob([html], { type: 'text/html' }));
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
      set({ packetAnimationSpeed: readPacketAnimationSpeed() });
      panelPreferences = readPanelPreferences();
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

    loadBundledLab(index) {
      const lab = LABS[index];
      if (!lab) return;
      adoptSave(JSON.parse(JSON.stringify(lab)) as SaveFile);
      saveSoon();
    },

    loadExample(index) {
      const ex = EXAMPLES[index];
      if (!ex) return;
      adoptSave(JSON.parse(JSON.stringify(ex.file)) as SaveFile);
      saveSoon();
    },

    setLabStep(step) {
      const lab = get().lab;
      if (!lab) return;
      set({ labStep: Math.max(0, Math.min(lab.steps.length - 1, step)) });
      saveSoon();
    },

    answerQuiz(qid, choice) {
      set({ quizAnswers: { ...get().quizAnswers, [qid]: choice } });
      saveSoon();
    },

    checkStep() {
      const lab = get().lab;
      if (!lab || get().labChecking) return;
      const step = lab.steps[get().labStep];
      if (!step || step.objectives.length === 0) return;
      set({ labChecking: true, paused: false });
      const generation = ++labCheckGeneration;
      runChecks(
        sim.net,
        step.objectives,
        (r) => {
          set({
            labResults: { ...get().labResults, [r.id]: { pass: r.pass, detail: r.detail } },
          });
        },
        () => {
          set({ labChecking: false });
          get().refresh();
          saveSoon();
        },
        () => generation === labCheckGeneration,
      );
    },

    exportAttempt() {
      const lab = get().lab;
      if (!lab) return;
      const blob = new Blob([JSON.stringify(currentSave(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `netsim-attempt-${lab.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      get().setNotice('Attempt exported — submit the JSON file');
    },

    closeLab() {
      set({ lab: null, labStep: 0, labResults: {}, quizAnswers: {}, labChecking: false });
      saveSoon();
    },
  };
});
