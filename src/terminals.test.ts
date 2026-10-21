import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Host, IpDevice } from './engine/ipdevice';
import { ApDevice, SwitchDevice } from './engine/switch';
import { parseCidr, parseIp } from './engine/ip';
import { Shell, type TermIO } from './commands/shell';
import { sim } from './sim';
import { useStore } from './store';
import { disposeAllSessions, disposeSession, getSession, type Session } from './terminals';
import { PASTE_END, PASTE_START } from './terminalInput';
import * as terminalLine from './terminalLine';
import { restoreNetwork, serializeNetwork } from './engine/serialize';
import { DEFAULT_TERMINAL_APPEARANCE, DEFAULT_TERMINAL_COLORS, type AppearanceSaveFile } from './terminalAppearance';
import { TERMINAL_EFFECT_GROUPS } from './terminalEffects';
import { resizePanelPair } from './terminalPanels';
import { PANEL_LAYOUT_KEY } from './terminalPanelPreferences';
import type { MoveOperation } from './topologyHistory';
import { captureCreation, captureLink, dhcpSettings, sortedDnsRecords } from './topologyEdits';
import { TAB_LAYOUT_KEY } from './terminalTabPreferences';
import { PacketCapture } from './packetCapture';
import { PACKET_ANIMATION_SPEED_KEY, packetAnimationDuration, packetAnimationProgress } from './packetAnimation';
import { HOST_CREATION_KEY } from './hostOs';
import { emptyIpv4, parseStaticIpv4 } from './engine/ipv4Config';

// Only the browser renderer is replaced. Commands, engine, store and persistence
// run together so these tests cover the actual terminal-to-autosave path.
const inputs = vi.hoisted(() => new Map<object, (data: string) => void>());
const resizes = vi.hoisted(() => new Map<object, (size: { cols: number; rows: number }) => void>());
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    write = vi.fn((_data: string, callback?: () => void) => callback?.());
    writeln = vi.fn();
    dispose = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    hasSelection = vi.fn(() => false);
    clearSelection = vi.fn();
    select = vi.fn();
    getSelection = vi.fn(() => '');
    onSelectionChange = vi.fn(() => ({ dispose: vi.fn() }));
    cols = 80;
    buffer = { active: { baseY: 0, cursorY: 0, cursorX: 0, getLine: () => undefined } };
    loadAddon() {}
    onData(listener: (data: string) => void) {
      inputs.set(this, listener);
      return { dispose: () => inputs.delete(this) };
    }
    onResize(listener: (size: { cols: number; rows: number }) => void) {
      resizes.set(this, listener);
      return { dispose: () => resizes.delete(this) };
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));

const storage = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => storage.set(key, value));

function input(session: Session, data: string): void {
  const listener = inputs.get(session.term);
  expect(listener).toBeDefined();
  listener!(data);
}

function output(session: Session): string {
  return vi.mocked(session.term.write).mock.calls.map(([data]) => data).join('');
}

function pair() {
  const store = useStore.getState();
  store.addDeviceAt('host', { x: 20, y: 30 });
  store.addDeviceAt('server', { x: 200, y: 30 });
  const [a, b] = useStore.getState().nodes.map((n) => sim.net.devices.get(n.id) as IpDevice);
  store.onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null });
  a.getInterface('eth0')!.ip = parseCidr('10.0.0.1/24');
  b.getInterface('eth0')!.ip = parseCidr('10.0.0.2/24');
  vi.advanceTimersByTime(500);
  setItem.mockClear();
  return { a, b, net: sim.net };
}

function open(device: IpDevice): Session {
  useStore.getState().openTerminal(device.id);
  return getSession(device);
}

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  setItem.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
  });
  vi.stubGlobal('location', { hash: '' });
  useStore.getState().newTopology();
  vi.advanceTimersByTime(500);
  setItem.mockClear();
});

afterEach(() => {
  disposeAllSessions();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('host OS profiles', () => {
  it.each(['windows', 'linux'] as const)('uses %s for a new command after a selection deferred the prompt refresh', (os) => {
    const { a, net } = pair(), store = useStore.getState();
    store.setHostOs(a.id, os === 'windows' ? 'linux' : 'windows');
    const session = open(a), configuration = a.interfaces[0].ipv4;
    vi.mocked(session.term.hasSelection).mockReturnValue(true);
    store.setHostOs(a.id, os);
    expect(session.term.clearSelection).not.toHaveBeenCalled();
    input(session, `ping ${os === 'windows' ? '-n' : '-c'} 4 10.0.0.2\r`);
    net.scheduler.advanceTo(3400);
    expect(output(session)).toContain(os === 'windows' ? 'Sent = 4, Received = 4' : '4 packets transmitted, 4 received');
    expect(output(session)).not.toContain('Invalid option');
    expect(a.interfaces[0].ipv4).toEqual(configuration); expect(getSession(a)).toBe(session);
  });
  it('groups consecutive IPv4 form confirmations and breaks the group for other edits or history navigation', () => {
    const { a } = pair(), store = () => useStore.getState(), group = {};
    const before = a.interfaces[0].ipv4;
    const first = parseStaticIpv4('10.0.0.42', '24', '', '')!;
    const second = parseStaticIpv4('10.0.0.42', '25', '', '10.0.0.2')!;
    store().invalidateTopologyHistory();
    store().setInterfaceIpv4(a.id, 'eth0', first, group);
    store().setInterfaceIpv4(a.id, 'eth0', second, group);
    store().setInterfaceIpv4(a.id, 'eth0', second, group); // Blur after debounce is a no-op.
    expect(store().topologyHistory.past).toHaveLength(1);
    store().undoTopology(); expect(a.interfaces[0].ipv4).toEqual(before);
    const history = store().topologyHistory;
    expect(store().setInterfaceIpv4(a.id, 'eth0', { ...second, ip: { addr: 1, prefix: 33 } }, group)).not.toBeNull();
    expect(store().topologyHistory).toBe(history);
    store().redoTopology(); expect(a.interfaces[0].ipv4).toEqual(second);
    store().setInterfaceIpv4(a.id, 'eth0', first, group);
    expect(store().topologyHistory.past).toHaveLength(2); // Never merge across Undo/Redo.
    store().renameDevice(a.id, 'Grouped');
    store().setInterfaceIpv4(a.id, 'eth0', second, group);
    expect(store().topologyHistory.past).toHaveLength(4);
    store().flushAutosave(); store().boot();
    expect(sim.net.devices.get(a.id)!.interfaces[0].ipv4).toEqual(second);
  });

  it('does not merge a reverted IPv4 editing group into the preceding group', () => {
    const { a } = pair(), store = () => useStore.getState();
    const first = parseStaticIpv4('10.0.0.42', '24', '', '')!;
    const second = parseStaticIpv4('10.0.0.43', '24', '', '')!, group = {};
    store().invalidateTopologyHistory();
    store().setInterfaceIpv4(a.id, 'eth0', first, {});
    store().setInterfaceIpv4(a.id, 'eth0', second, group);
    store().setInterfaceIpv4(a.id, 'eth0', first, group);
    expect(store().topologyHistory.past).toHaveLength(1);
    store().setInterfaceIpv4(a.id, 'eth0', second, group);
    expect(store().topologyHistory.past).toHaveLength(2);
    store().undoTopology(); expect(a.interfaces[0].ipv4).toEqual(first);
  });

  it('records atomic interface settings, preserves Redo on invalid/no-op edits and restores preferences after boot', () => {
    const { a, b, net } = pair(), first = open(a), other = open(b), store = () => useStore.getState();
    const config = parseStaticIpv4('10.0.0.42', '/24', '10.0.0.2', '10.0.0.2')!;
    store().invalidateTopologyHistory();
    expect(store().setInterfaceIpv4(a.id, 'eth0', config)).toBeNull();
    config.ip!.addr = 0; // History and engine own their copies.
    expect(a.interfaces[0].ip?.addr).toBe(parseIp('10.0.0.42'));
    store().setInterfaceIpv4(a.id, 'eth0', emptyIpv4('dhcp'));
    store().undoTopology();
    const history = store().topologyHistory;
    expect(store().setInterfaceIpv4(a.id, 'eth0', a.interfaces[0].ipv4)).toBeNull();
    expect(store().setInterfaceIpv4(a.id, 'eth0', { ...a.interfaces[0].ipv4, gateway: parseIp('192.0.2.1') })).not.toBeNull();
    expect(store().topologyHistory).toBe(history);
    store().redoTopology(); expect(a.interfaces[0].ipv4).toEqual(emptyIpv4('dhcp'));
    expect(sim.net).toBe(net); expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(other);
    store().flushAutosave(); store().boot();
    expect(sim.net.devices.get(a.id)!.interfaces[0].ipv4).toEqual(emptyIpv4('dhcp'));
    expect(store().terminals).toEqual([]);
  });

  it('publishes a terminal DHCP mode change immediately, before acquisition, and invalidates incompatible history', () => {
    const { a, b, net } = pair(), session = open(a), other = open(b), store = () => useStore.getState();
    store().renameDevice(a.id, 'DHCP-client');
    input(session, 'dhclient eth0\r');
    expect(a.interfaces[0].ipv4Mode).toBe('dhcp'); expect(a.interfaces[0].ip).toBeNull();
    expect(store().topologyHistory.past).toEqual([]);
    expect(store().nodes.find((n) => n.id === a.id)?.data.ip).toBeFalsy();
    store().flushAutosave();
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).devices[0].ifaces[0]).toMatchObject({ ipv4Mode: 'dhcp', ip: null });
    // An Inspector edit cancels acquisition without closing either terminal.
    store().setInterfaceIpv4(a.id, 'eth0', parseStaticIpv4('10.0.0.8', '24', '', '')!);
    net.scheduler.advanceTo(10000);
    expect(a.interfaces[0].ip?.addr).toBe(parseIp('10.0.0.8'));
    expect(getSession(a)).toBe(session); expect(getSession(b)).toBe(other);
    expect(a.dhcpListeners.size).toBe(0);
  });
  afterEach(() => useStore.getState().setHostCreationMode('linux'));

  it('serializes a profile redraw with input arriving while xterm is still painting', () => {
    const { a } = pair(), session = open(a), callbacks: (() => void)[] = [];
    vi.mocked(session.term.write).mockImplementation((_text, callback) => { if (callback) callbacks.push(callback); });
    useStore.getState().setHostOs(a.id, 'windows');
    input(session, 'hostname\r');
    expect(output(session)).not.toContain('hostname');
    while (callbacks.length) callbacks.shift()!();
    expect(output(session)).toContain('C:\\>hostname\r\n' + a.name + '\r\nC:\\>');
    expect(session.term.dispose).not.toHaveBeenCalled();
  });

  it('samples Mixed once and restores that identity through create/delete history, import and autosave', () => {
    const store = () => useStore.getState();
    store().setHostCreationMode('mixed');
    expect(storage.get(HOST_CREATION_KEY)).toBe('mixed');
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    store().addDeviceAt('host', { x: 20, y: 30 });
    const id = store().nodes[0].id, original = sim.net.devices.get(id) as Host;
    expect(original.os).toBe('windows'); expect(store().nodes[0].data.os).toBe('windows');
    vi.mocked(Math.random).mockReturnValue(0.1);
    store().undoTopology(); store().redoTopology();
    const restored = sim.net.devices.get(id) as Host;
    expect(restored.os).toBe('windows'); expect(restored.interfaces[0].mac).toBe(original.interfaces[0].mac);
    store().addDeviceAt('host', { x: 120, y: 30 });
    expect((sim.net.devices.get(store().nodes[1].id) as Host).os).toBe('linux');
    store().setHostCreationMode('windows'); store().addDeviceAt('host', { x: 220, y: 30 });
    expect((sim.net.devices.get(store().nodes[2].id) as Host).os).toBe('windows');
    store().deleteDevice(id); store().undoTopology();
    expect((sim.net.devices.get(id) as Host).os).toBe('windows');
    store().flushAutosave();
    const saved = storage.get('netsim:autosave:v1')!;
    store().boot(); expect((sim.net.devices.get(id) as Host).os).toBe('windows'); expect(store().terminals).toEqual([]);
    expect(store().importJson(saved)).toBeNull(); expect((sim.net.devices.get(id) as Host).os).toBe('windows');
    const legacy = JSON.parse(saved); delete legacy.devices.find((d: { id: string }) => d.id === id).os;
    expect(store().importJson(JSON.stringify(legacy))).toBeNull(); expect((sim.net.devices.get(id) as Host).os).toBe('linux');
  });

  it('changes profile with undo/redo without replacing active sessions, drafts, selection or pings', () => {
    const { a, b, net } = pair(), session = open(a), other = open(b), store = () => useStore.getState();
    input(session, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(500);
    store().setHostOs(a.id, 'windows'); net.scheduler.advanceTo(2500);
    expect(output(session)).toContain('icmp_seq=3'); expect(output(session)).not.toContain('C:\\>');
    input(session, '\x03'); expect(output(session)).toMatch(/C:\\>$/);
    expect(getSession(a)).toBe(session); expect(getSession(b)).toBe(other); expect(sim.net).toBe(net);
    store().undoTopology(); expect((a as Host).os).toBe('linux'); expect(output(session)).toMatch(/\$ $/);
    store().redoTopology(); expect((a as Host).os).toBe('windows'); expect(output(session)).toMatch(/C:\\>$/);
    input(session, 'ipconfig'); vi.mocked(session.term.hasSelection).mockReturnValue(true);
    store().setHostOs(a.id, 'linux');
    expect(output(session)).toMatch(/ipconfig$/);
    vi.mocked(session.term.hasSelection).mockReturnValue(false);
    input(session, '\r'); expect(output(session)).toContain('Windows IP Configuration'); expect(output(session)).toMatch(/\$ $/);
    input(session, '\x1b[A'); expect(output(session)).toMatch(/ipconfig$/);
    expect(session.term.dispose).not.toHaveBeenCalled(); expect(other.term.dispose).not.toHaveBeenCalled();
    store().undoTopology(); const history = store().topologyHistory;
    store().setHostOs(a.id, 'windows'); store().setHostOs(b.id, 'windows');
    expect(store().topologyHistory).toBe(history); // unchanged and non-host edits preserve Redo
  });

  it('captures four Windows ping round trips for Guided and continues live -t after returning', () => {
    const { a, net } = pair(), store = () => useStore.getState();
    store().setHostOs(a.id, 'windows'); const session = open(a);
    store().startPacketCapture(); store().setPacketVisualizationMode('guided');
    input(session, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(3800); store().tick(0); vi.advanceTimersByTime(100);
    expect(store().guidedPacket.playback.status).toBe('playing'); expect(store().guidedPacket.observation.attempts.map((a) => a.replied)).toEqual([true, true, true, true]);
    expect(store().packetCapture.records.some((r) => r.frame.payload.kind === 'ipv4')).toBe(true);
    expect(output(session)).toContain('Sent = 4, Received = 4'); expect(output(session)).toMatch(/C:\\>$/);
    input(session, 'ping -t 10.0.0.2\r');
    net.scheduler.advanceTo(8000); store().tick(0); expect(store().guidedPacket.playback.status).toBe('playing');
    store().setPacketVisualizationMode('live'); const before = output(session);
    net.scheduler.advanceTo(10000); expect(output(session).length).toBeGreaterThan(before.length);
    input(session, '\x03'); expect(output(session)).toMatch(/C:\\>$/); expect(getSession(a)).toBe(session);
  });

  it('autosaves DHCP changes issued by ipconfig /renew while retaining visual preferences', () => {
    const { a, b, net } = pair(); const store = () => useStore.getState();
    a.interfaces[0].configureIpv4({ mode: 'dhcp', ip: null, gateway: null, dns: null });
    b.dhcpServer = { enabled: true, rangeStart: parseIp('10.0.0.50')!, rangeEnd: parseIp('10.0.0.60')!, router: parseIp('10.0.0.2'), dns: parseIp('10.0.0.2'), leases: new Map() };
    store().setHostOs(a.id, 'windows'); store().setTerminalColor(a.id, '#123456');
    const session = open(a); input(session, 'ipconfig /renew\r'); net.scheduler.advanceTo(3000); store().flushAutosave();
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.devices.find((d: { id: string }) => d.id === a.id)).toMatchObject({ os: 'windows', ifaces: [expect.objectContaining({ ip: '10.0.0.50/24', ipv4Mode: 'dhcp', dns: '10.0.0.2' })] });
    expect(saved.ui.terminalColors[a.id]).toBe('#123456');
    expect(session.term.dispose).not.toHaveBeenCalled(); expect(output(session)).toMatch(/C:\\>$/);
  });
});

describe('terminal session lifetime', () => {
  it.each(['ctrlKey', 'metaKey'] as const)('leaves selected-text copy to the browser (%s) without cancelling ping', (modifier) => {
    const { a, net } = pair();
    const session = open(a);
    const handler = vi.mocked(session.term.attachCustomKeyEventHandler).mock.calls[0][0];
    const send = vi.spyOn(a, 'sendEcho');
    const off = vi.spyOn(a, 'offIcmp');
    input(session, 'ping 10.0.0.1\r');
    vi.mocked(session.term.hasSelection).mockReturnValue(true);
    const event = {
      key: 'c', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      isComposing: false, [modifier]: true, stopPropagation: vi.fn(), preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    expect(handler(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    net.scheduler.advanceTo(1100);
    expect(send).toHaveBeenCalledTimes(2);
    expect(off).not.toHaveBeenCalled();
    // Once selection is cleared, the normal Ctrl-C input still cancels.
    vi.mocked(session.term.hasSelection).mockReturnValue(false);
    expect(handler(event)).toBe(true);
    input(session, '\x03');
    expect(off).toHaveBeenCalledOnce();
    expect(output(session)).toContain('ping statistics');
  });

  it.each([
    { key: 'v', ctrlKey: true, altKey: true },
    { key: 'c', ctrlKey: true, altKey: true },
    { key: 'c', ctrlKey: true, shiftKey: true },
    { key: 'c', ctrlKey: true, isComposing: true },
    { key: 'c', ctrlKey: false },
  ])('does not intercept other terminal keys/modifiers: %j', (overrides) => {
    const { a } = pair();
    const session = open(a);
    vi.mocked(session.term.hasSelection).mockReturnValue(true);
    const handler = vi.mocked(session.term.attachCustomKeyEventHandler).mock.calls[0][0];
    const event = Object.assign({ metaKey: false, altKey: false, shiftKey: false, isComposing: false }, overrides);
    expect(handler(event as KeyboardEvent)).toBe(true);
  });

  it('requests focus when reopening the active session without replacing it or saving', () => {
    const { a } = pair();
    const session = open(a);
    const request = useStore.getState().terminalFocusRequest;
    expect(open(a)).toBe(session);
    expect(useStore.getState().terminalFocusRequest).toBe(request + 1);
    useStore.getState().setActiveTerminal(a.id);
    expect(useStore.getState().terminalFocusRequest).toBe(request + 2);
    expect(session.term.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('preserves session, output, history and partially typed input across tab switches', () => {
    const { a, b } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'ip addr\r');
    const previous = output(session);
    input(session, 'host');
    open(b);
    useStore.getState().setActiveTerminal(a.id);
    expect(getSession(a)).toBe(session);
    expect(output(session)).toContain(previous);
    input(session, 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    open(b);
    open(a);
    input(session, '\x1b[A');
    input(session, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    expect(session.term.dispose).not.toHaveBeenCalled();
  });

  it('keeps ping running when changing tabs and allows Ctrl-C followed by another command', () => {
    const { a, b, net } = pair();
    const session = open(a);
    const send = vi.spyOn(a, 'sendEcho');
    input(session, 'ping 10.0.0.2\r');
    open(b);
    net.scheduler.advanceTo(2200);
    expect(send).toHaveBeenCalledTimes(3);
    expect(output(session)).toContain('icmp_seq=2');
    open(a);
    input(session, '\x03');
    expect(output(session)).toContain('ping statistics');
    const calls = send.mock.calls.length;
    net.scheduler.advanceTo(10_000);
    expect(send).toHaveBeenCalledTimes(calls);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'hostname\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
  });

  it('cancels ping timers/listener on definitive close without callbacks or output', () => {
    const { a, net } = pair();
    const session = open(a);
    const send = vi.spyOn(a, 'sendEcho');
    const off = vi.spyOn(a, 'offIcmp');
    const refresh = vi.spyOn(useStore.getState(), 'refresh');
    input(session, 'ping 10.0.0.1\r');
    net.scheduler.advanceTo(10);
    const previous = output(session);
    useStore.getState().closeTerminal(a.id);
    disposeSession(a.id);
    expect(inputs.has(session.term)).toBe(false);
    expect(net.scheduler.pending).toBe(0);
    net.scheduler.advanceTo(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledTimes(1);
    expect(output(session)).toBe(previous);
    expect(refresh).not.toHaveBeenCalled();
    expect(session.term.dispose).toHaveBeenCalledTimes(1);
    expect(open(a)).not.toBe(session);
  });

  it.each(['nc -l 1234', 'nc -l -u 1234'])('removes listeners when closing %s', (line) => {
    const { a } = pair();
    const session = open(a);
    input(session, line + '\r');
    const registry = line.includes('-u') ? a.ncUdp : a.ncTcp;
    expect(registry.has(1234)).toBe(true);
    useStore.getState().closeTerminal(a.id);
    expect(registry.has(1234)).toBe(false);
  });

  it('cancels pending DHCP without retries or applying a late lease', () => {
    const { a, b, net } = pair();
    a.getInterface('eth0')!.ip = null;
    b.dhcpServer = {
      enabled: true, rangeStart: parseIp('10.0.0.100')!, rangeEnd: parseIp('10.0.0.110')!,
      router: parseIp('10.0.0.2'), dns: parseIp('10.0.0.2'), leases: new Map(),
    };
    const session = open(a);
    const send = vi.spyOn(a, 'sendDhcpClient');
    input(session, 'dhclient eth0\r');
    // Close after the request, with its ACK still travelling through the engine.
    // Address-conflict probing now precedes the offer. Stop at the actual
    // REQUEST instead of assuming a fixed DHCP handshake duration.
    for (let step = 0; step < 300 && send.mock.calls.length < 2; step++) net.scheduler.advanceTo(net.now + 10);
    expect(send).toHaveBeenCalledTimes(2);
    useStore.getState().closeTerminal(a.id);
    net.scheduler.advanceTo(10_000);
    expect(a.dhcpListeners.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(a.getInterface('eth0')!.ip).toBeNull();
    expect(a.staticRoutes).toEqual([]);
    expect(a.nameserver).toBeNull();
  });

  it('does not start ping after a cancelled DNS lookup completes', () => {
    const { a, b, net } = pair();
    a.nameserver = parseIp('10.0.0.2');
    b.dnsServer = { enabled: true, records: new Map([['peer.lan', parseIp('10.0.0.2')!]]) };
    const session = open(a);
    const send = vi.spyOn(a, 'sendEcho');
    input(session, 'ping peer.lan\r');
    useStore.getState().closeTerminal(a.id);
    net.scheduler.advanceTo(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores stale output and completion callbacks after close, including during cancel', () => {
    const { a } = pair();
    const session = open(a);
    let io!: TermIO;
    let done!: () => void;
    const cancel = vi.fn(() => { io.write('during cancel'); done(); });
    vi.spyOn(Shell.prototype, 'exec').mockImplementation((_line, commandIO, onDone) => {
      io = commandIO;
      done = onDone;
      return { cancel };
    });
    const refresh = vi.spyOn(useStore.getState(), 'refresh');
    input(session, 'test\r');
    const previous = output(session);
    useStore.getState().closeTerminal(a.id);
    const replacement = open(a);
    const replacementOutput = output(replacement);
    io.write('late output');
    done();
    done();
    session.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(output(session)).toBe(previous);
    expect(output(replacement)).toBe(replacementOutput);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    'traceroute 10.0.0.2', 'nc 10.0.0.2 80', 'nc -u 10.0.0.2 1234',
    'dig @10.0.0.2 peer.lan', 'curl -v http://10.0.0.2/',
  ])('suppresses late callbacks from an in-flight %s after close', (line) => {
    const { a, b, net } = pair();
    b.services.tcp.add(80);
    b.dnsServer = { enabled: true, records: new Map([['peer.lan', parseIp('10.0.0.2')!]]) };
    b.httpServer = { enabled: true, port: 80, body: 'late response' };
    const session = open(a);
    const refresh = vi.spyOn(useStore.getState(), 'refresh');
    input(session, line + '\r');
    const previous = output(session);
    useStore.getState().closeTerminal(a.id);
    net.scheduler.advanceTo(10_000);
    vi.advanceTimersByTime(1000);
    expect(output(session)).toBe(previous);
    expect(refresh).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignores callbacks from a completed command while a new command is running', () => {
    const { a } = pair();
    const session = open(a);
    let io!: TermIO;
    let done!: () => void;
    vi.spyOn(Shell.prototype, 'exec').mockImplementationOnce((_line, commandIO, onDone) => {
      io = commandIO;
      done = onDone;
      done();
      return null;
    });
    input(session, 'test\r');
    input(session, 'nc -l 1234\r');
    const previous = output(session);
    io.write('stale output');
    done();
    expect(output(session)).toBe(previous);
    useStore.getState().closeTerminal(a.id);
    expect(a.ncTcp.has(1234)).toBe(false);
  });

  it.each(['ping 203.0.113.1', 'traceroute 203.0.113.1', 'nc missing.lan 80', 'curl missing.lan'])(
    'accepts input after synchronous completion of %s', (line) => {
      const { a } = pair();
      const session = open(a);
      const exec = vi.spyOn(Shell.prototype, 'exec');
      input(session, line + '\r');
      input(session, 'hostname\r');
      expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    },
  );

  it('cancels all sessions when replacing the topology', () => {
    const { a, b, net } = pair();
    const first = open(a);
    const second = open(b);
    input(first, 'ping 10.0.0.1\r');
    input(second, 'nc -l 1234\r');
    const send = vi.spyOn(a, 'sendEcho');
    useStore.getState().newTopology();
    net.scheduler.advanceTo(10_000);
    expect(send).not.toHaveBeenCalled();
    expect(b.ncTcp.size).toBe(0);
    expect(first.term.dispose).toHaveBeenCalledTimes(1);
    expect(second.term.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('terminal paste', () => {
  function paste(session: Session, text: string) {
    // The installed xterm wraps each native paste / term.paste() in one event.
    input(session, `${PASTE_START}${text}${PASTE_END}`);
  }

  it.each([
    { ctrlKey: true, type: 'keydown' },
    { ctrlKey: true, type: 'keyup' },
    { ctrlKey: true, type: 'keypress' },
    { metaKey: true, type: 'keydown' },
    { ctrlKey: true, shiftKey: true, type: 'keydown' },
  ])('allows native paste without a Clipboard API read: %j', (modifiers) => {
    const readText = vi.fn().mockRejectedValue(new Error('Denied'));
    vi.stubGlobal('navigator', { clipboard: { readText } });
    const { a } = pair();
    const session = open(a);
    const handler = vi.mocked(session.term.attachCustomKeyEventHandler).mock.calls[0][0];
    const event = Object.assign({ key: 'v', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }, modifiers);
    expect(handler(event as unknown as KeyboardEvent)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });

  it('appends an IP to a typed command exactly once and waits for Enter', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'ping -c 1 ');
    paste(session, '10.0.0.1');
    expect(exec).not.toHaveBeenCalled();
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['ping -c 1 10.0.0.1']);
  });

  it.each(['hostname\nhelp\n', 'hostname\r\nhelp\r\n', 'hostname\rhelp\r', '\r', '\n', '\u2028\u2029'])(
    'never submits pasted line breaks: %j', (text) => {
      const { a } = pair();
      const session = open(a);
      const exec = vi.spyOn(Shell.prototype, 'exec');
      paste(session, text);
      expect(exec).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      input(session, '\r');
      if (text.startsWith('hostname')) expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname help ']);
      else expect(exec).not.toHaveBeenCalled();
    },
  );

  it('supports Unicode paste, typed Unicode, deletion and history across tab switches', () => {
    const { a, b } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    paste(session, 'Olá 🌐');
    input(session, '\x7f');
    input(session, '東京');
    open(b);
    open(a);
    input(session, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京');
    input(session, '\x1b[A');
    input(session, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京');
    expect(output(session)).toContain('Olá 🌐');
  });

  it('does not submit pasted configuration until Enter and then autosaves normally', () => {
    const { a } = pair();
    const session = open(a);
    paste(session, 'sysctl -w net.ipv4.ip_forward=1\r\n');
    vi.advanceTimersByTime(1000);
    expect(a.forwarding).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    input(session, '\r');
    vi.advanceTimersByTime(500);
    expect(a.forwarding).toBe(true);
    expect(setItem).toHaveBeenCalledOnce();
  });

  it('ignores paste during a command without cancelling it or queuing input', () => {
    const { a, net } = pair();
    const session = open(a);
    const send = vi.spyOn(a, 'sendEcho');
    const off = vi.spyOn(a, 'offIcmp');
    input(session, 'ping 10.0.0.1\r');
    paste(session, '\x03sysctl -w net.ipv4.ip_forward=1\r');
    net.scheduler.advanceTo(1100);
    expect(send).toHaveBeenCalledTimes(2);
    expect(off).not.toHaveBeenCalled();
    expect(a.forwarding).toBe(false);
    expect(output(session)).toContain('Stop the running command');
    input(session, '\x03');
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'hostname\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
  });

  it('strips pasted controls instead of treating them as editing or shell input', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    paste(session, 'host\x03\x7f\x16\x00name');
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
  });
});

describe('select current command', () => {
  function selectCommand(session: Session) {
    // Cell geometry is covered separately with real-width fixtures and Chromium.
    vi.spyOn(terminalLine, 'currentCommandRange').mockReturnValue({ column: 6, row: 1, length: 12 });
    const handler = vi.mocked(session.term.attachCustomKeyEventHandler).mock.calls[0][0];
    const event = {
      type: 'keydown', key: 'a', ctrlKey: true, metaKey: false, altKey: false,
      shiftKey: false, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    expect(handler(event)).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    return event;
  }

  it.each(['\x7f', '\x1b[3~'])('clears only selected input with %j, preserving history', (key) => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'hostname\r');
    const previous = output(session);
    input(session, 'discard me');
    selectCommand(session);
    expect(session.term.select).toHaveBeenCalledWith(6, 1, 12);
    input(session, key);
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
    expect(output(session)).toContain(previous);
    input(session, '\x1b[A');
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname', 'hostname']);
  });

  it.each(['typed', 'pasted'])('replaces selected input with %s Unicode without executing until Enter', (method) => {
    const { a, b } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'discard me');
    selectCommand(session);
    const text = 'Olá e\u0301 東京 🌐';
    input(session, method === 'typed' ? text : `${PASTE_START}${text}${PASTE_END}`);
    expect(exec).not.toHaveBeenCalled();
    open(b);
    open(a);
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual([text]);
  });

  it('Enter executes the selected command unchanged; history arrows replace the selection', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'hostname');
    selectCommand(session);
    input(session, '\r');
    input(session, 'discard me');
    selectCommand(session);
    input(session, '\x1b[A');
    input(session, '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname', 'hostname']);
  });

  it('does not select history on an empty line or cancel a running command', () => {
    const { a, net } = pair();
    const session = open(a);
    selectCommand(session);
    expect(session.term.select).not.toHaveBeenCalled();
    input(session, 'ping 10.0.0.1\r');
    const off = vi.spyOn(a, 'offIcmp');
    const send = vi.spyOn(a, 'sendEcho');
    selectCommand(session);
    net.scheduler.advanceTo(1100);
    expect(send).toHaveBeenCalledOnce();
    expect(off).not.toHaveBeenCalled();
    expect(session.term.select).not.toHaveBeenCalled();
    input(session, '\x03');
    expect(off).toHaveBeenCalledOnce();
  });

  it('keeps fast replacement and Enter ordered behind asynchronous xterm writes', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    const pending: (() => void)[] = [];
    vi.mocked(session.term.write).mockImplementation((_data, callback) => { if (callback) pending.push(callback); });
    input(session, 'old');
    selectCommand(session);
    input(session, 'hostname\r');
    expect(exec).not.toHaveBeenCalled();
    while (pending.length) pending.shift()!();
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
  });

  it('retains replacement intent when xterm clears its highlight just before onData', async () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'old');
    selectCommand(session);
    const changed = vi.mocked(session.term.onSelectionChange).mock.calls[0][0];
    changed();
    input(session, 'hostname\r');
    await Promise.resolve();
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
  });

  it('returns to appending after the user clears the selection without entering text', async () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'host');
    selectCommand(session);
    const changed = vi.mocked(session.term.onSelectionChange).mock.calls[0][0];
    changed();
    await Promise.resolve();
    input(session, 'name\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
  });

  it('ignores queued selection/edit callbacks after the session is closed', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    const pending: (() => void)[] = [];
    vi.mocked(session.term.write).mockImplementation((_data, callback) => { if (callback) pending.push(callback); });
    input(session, 'old');
    selectCommand(session);
    input(session, 'hostname\r');
    session.dispose();
    const previous = output(session);
    while (pending.length) pending.shift()!();
    expect(exec).not.toHaveBeenCalled();
    expect(session.term.select).not.toHaveBeenCalled();
    expect(output(session)).toBe(previous);
  });

  it('can select and replace the command after a column/font reflow', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'Olá 東京 🌐 '.repeat(15));
    resizes.get(session.term)!({ cols: 40, rows: 12 });
    selectCommand(session);
    input(session, 'hostname\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
  });
});

describe('editable input after xterm reflow', () => {
  it('redraws only when columns change and preserves input/history without submitting', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(session, 'hostname\r');
    input(session, 'Olá 東京 ');
    const resize = resizes.get(session.term)!;
    const before = output(session);
    resize({ cols: 80, rows: 9 });
    expect(output(session)).toBe(before);
    resize({ cols: 35, rows: 9 });
    expect(output(session)).toContain('Olá 東京 ');
    expect(exec).toHaveBeenCalledOnce();
    input(session, '🌐\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京 🌐');
    input(session, '\x1b[A');
    input(session, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京 🌐');
  });

  it('orders a queued resize before fast typing/Enter and ignores callbacks after disposal', () => {
    const { a } = pair();
    const session = open(a);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    const pending: (() => void)[] = [];
    vi.mocked(session.term.write).mockImplementation((_text, callback) => { if (callback) pending.push(callback); });
    input(session, 'host');
    const resize = resizes.get(session.term)!;
    resize({ cols: 40, rows: 12 });
    resize({ cols: 35, rows: 12 });
    input(session, 'name\r');
    expect(exec).not.toHaveBeenCalled();
    while (pending.length) pending.shift()!();
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname']);
    session.dispose();
    const previous = output(session);
    resize({ cols: 30, rows: 10 });
    expect(resizes.has(session.term)).toBe(false);
    expect(output(session)).toBe(previous);
  });

  it('leaves running commands untouched by column changes', () => {
    const { a, net } = pair();
    const session = open(a);
    input(session, 'ping 10.0.0.1\r');
    const before = output(session);
    const off = vi.spyOn(a, 'offIcmp');
    resizes.get(session.term)!({ cols: 35, rows: 12 });
    expect(output(session)).toBe(before);
    expect(off).not.toHaveBeenCalled();
    net.scheduler.advanceTo(1100);
    expect(output(session)).toContain('icmp_seq=1');
  });
});

describe('cycling terminal sessions', () => {
  function createDevices() {
    const store = useStore.getState();
    for (const kind of ['host', 'server', 'router', 'firewall', 'host', 'server'] as const) {
      store.addDeviceAt(kind, { x: 0, y: 0 });
    }
    return useStore.getState().nodes.map((node) => sim.net.devices.get(node.id) as IpDevice);
  }

  function assertVisualCycle(ids: string[]) {
    const store = useStore.getState();
    store.setActiveTerminal(ids[0]);
    for (const id of [...ids.slice(1), ids[0]]) {
      store.cycleTerminal(1);
      expect(useStore.getState().activeTerminal).toBe(id);
      expect(useStore.getState().terminalHasFocus).toBe(true);
      expect(useStore.getState().terminalPanels.find((panel) => panel.tabs.includes(id))?.active).toBe(id);
    }
    for (const id of [...ids.slice(1).reverse(), ids[0]]) {
      store.cycleTerminal(-1);
      expect(useStore.getState().activeTerminal).toBe(id);
    }
    // A shortcut's DOM origin may differ from the globally active session.
    store.cycleTerminal(1, ids[0]);
    expect(useStore.getState().activeTerminal).toBe(ids[1] ?? ids[0]);
  }

  it.each([
    { mode: 'free', opened: [0, 1, 2, 3, 4, 5], expected: [0, 1, 2, 3, 4, 5] },
    { mode: 'free', opened: [3, 2, 1, 0, 5, 4], expected: [3, 2, 1, 0, 5, 4] },
    { mode: 'by-type', opened: [0, 1, 2, 3, 4, 5], expected: [0, 4, 1, 5, 2, 3] },
    { mode: 'by-type', opened: [4, 3, 5, 2, 1, 0], expected: [4, 0, 5, 1, 2, 3] },
  ] as const)('follows panels and local tabs in both directions: %j', ({ mode, opened, expected }) => {
    const devices = createDevices();
    const store = useStore.getState();
    store.setTerminalLayoutMode(mode);
    opened.forEach((index, position) => {
      if (position === 4 && mode === 'free') store.setActiveTerminal(devices[1].id);
      open(devices[index]);
    });
    const openingOrder = opened.map((index) => devices[index].id);
    assertVisualCycle(expected.map((index) => devices[index].id));
    expect(useStore.getState().terminals).toEqual(openingOrder);
    devices.forEach((device) => expect(getSession(device).term.dispose).not.toHaveBeenCalled());
  });

  it('recalculates order immediately after mode changes, opening, tab closure and empty-group removal', () => {
    const devices = createDevices();
    const store = useStore.getState();
    devices.slice(0, 4).forEach(open);
    store.setActiveTerminal(devices[1].id);
    open(devices[4]);
    assertVisualCycle([0, 1, 2, 3, 4].map((i) => devices[i].id));
    store.setTerminalLayoutMode('by-type');
    assertVisualCycle([0, 4, 1, 2, 3].map((i) => devices[i].id));
    open(devices[5]);
    assertVisualCycle([0, 4, 1, 5, 2, 3].map((i) => devices[i].id));
    store.closeTerminal(devices[4].id);
    assertVisualCycle([0, 1, 5, 2, 3].map((i) => devices[i].id));
    store.closeTerminal(devices[3].id);
    assertVisualCycle([0, 1, 5, 2].map((i) => devices[i].id));
    store.setTerminalLayoutMode('free');
    assertVisualCycle([0, 1, 2, 5].map((i) => devices[i].id));
  });

  it('reads changed panel and tab positions directly without modifying the opening registry', () => {
    const devices = createDevices();
    const store = useStore.getState();
    devices.slice(0, 4).forEach(open);
    store.setActiveTerminal(devices[1].id);
    devices.slice(4).forEach(open);
    store.moveTerminalTab(devices[4].id, { panelId: 'terminal-pane-2' });
    store.moveTerminalTab(devices[5].id, { panelId: 'terminal-pane-2' });
    // Navigation reads the displayed order, including local tabs.
    useStore.setState({ terminalPanels: [...useStore.getState().terminalPanels].reverse()
      .map((panel) => ({ ...panel, tabs: [...panel.tabs].reverse() })) });
    assertVisualCycle([3, 2, 5, 4, 1, 0].map((i) => devices[i].id));
    expect(useStore.getState().terminals).toEqual(devices.map((device) => device.id));
  });

  it('handles an empty dock and a single session after closure', () => {
    const store = useStore.getState();
    store.cycleTerminal(1);
    store.cycleTerminal(-1);
    expect(useStore.getState().activeTerminal).toBeNull();
    const { a, b } = pair();
    open(a);
    open(b);
    store.closeTerminal(b.id);
    assertVisualCycle([a.id]);
  });

  it('wraps, requests focus and retains partial input, history and running commands without saving', () => {
    const { a, b, net } = pair();
    const first = open(a);
    const second = open(b);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(first, 'hostname\r');
    input(first, 'host');
    input(second, 'ping 10.0.0.2\r');
    const send = vi.spyOn(b, 'sendEcho');
    const request = useStore.getState().terminalFocusRequest;
    useStore.getState().cycleTerminal(1);
    expect(useStore.getState().activeTerminal).toBe(a.id);
    expect(useStore.getState().terminalFocusRequest).toBe(request + 1);
    input(first, 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    input(first, '\x1b[A');
    input(first, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    useStore.getState().cycleTerminal(-1);
    expect(useStore.getState().activeTerminal).toBe(b.id);
    // Origin can differ from the global active session (future pane focus).
    useStore.getState().cycleTerminal(1, a.id);
    expect(useStore.getState().activeTerminal).toBe(b.id);
    net.scheduler.advanceTo(1100);
    expect(send).toHaveBeenCalledOnce();
    expect(getSession(a)).toBe(first);
    expect(getSession(b)).toBe(second);
    expect(first.term.dispose).not.toHaveBeenCalled();
    expect(second.term.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
    useStore.getState().closeTerminal(b.id);
    expect(second.term.dispose).toHaveBeenCalledOnce();
    const calls = send.mock.calls.length;
    net.scheduler.advanceTo(5000);
    expect(send).toHaveBeenCalledTimes(calls);
  });
});

describe('split terminal sessions', () => {
  function devices() {
    const { net } = pair();
    for (let index = 0; index < 4; index++) useStore.getState().addDeviceAt('host', { x: index * 100, y: 200 });
    const hosts = useStore.getState().nodes.map((node) => net.devices.get(node.id) as IpDevice);
    hosts.forEach((host, index) => { host.getInterface('eth0')!.ip = parseCidr(`10.0.0.${index + 1}/24`); });
    vi.advanceTimersByTime(500);
    setItem.mockClear();
    return { hosts, net };
  }

  it('opens six independent panels regardless of which panel was focused', () => {
    const { hosts } = devices();
    hosts.slice(0, 4).forEach(open);
    expect(useStore.getState().terminalPanels.map((panel) => panel.tabs)).toEqual(hosts.slice(0, 4).map((host) => [host.id]));
    const request = useStore.getState().terminalFocusRequest;
    useStore.getState().noteTerminalFocus(hosts[1].id);
    expect(useStore.getState().terminalFocusRequest).toBe(request);
    open(hosts[4]);
    open(hosts[5]);
    const panels = useStore.getState().terminalPanels;
    expect(panels).toHaveLength(6);
    expect(panels.map((p) => p.tabs)).toEqual(hosts.map((h) => [h.id]));
    useStore.getState().noteTerminalPanelFocus(panels[0].id);
    expect(useStore.getState().activeTerminal).toBe(hosts[0].id);
    expect(useStore.getState().terminalHasFocus).toBe(false);
    expect(useStore.getState().terminalFocusRequest).toBe(request + 2);
  });

  it('preserves four running pings while adding tabs, cycling, resizing and leaving focus', () => {
    const { hosts, net } = devices();
    const sessions = hosts.slice(0, 4).map(open);
    const sends = hosts.slice(0, 4).map((host) => vi.spyOn(host, 'sendEcho'));
    const off = hosts.slice(0, 4).map((host) => vi.spyOn(host, 'offIcmp'));
    sessions.forEach((session, index) => input(session, `ping 10.0.0.${index + 1}\r`));
    useStore.getState().noteTerminalFocus(hosts[1].id);
    open(hosts[4]);
    open(hosts[5]);
    for (let index = 0; index < 6; index++) useStore.getState().cycleTerminal(1);
    const panels = useStore.getState().terminalPanels;
    useStore.getState().setTerminalPanels(resizePanelPair(panels, panels[0].id, panels[1].id, 0.6, 0.35));
    useStore.getState().releaseTerminalFocus();
    net.scheduler.advanceTo(2200);
    sends.forEach((send) => expect(send).toHaveBeenCalledTimes(3));
    off.forEach((cancel) => expect(cancel).not.toHaveBeenCalled());
    sessions.forEach((session, index) => {
      expect(getSession(hosts[index])).toBe(session);
      expect(session.term.dispose).not.toHaveBeenCalled();
      expect(output(session)).toContain('icmp_seq=2');
    });
    expect(useStore.getState().terminalHasFocus).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([PANEL_LAYOUT_KEY]);
    useStore.getState().closeTerminal(hosts[1].id);
    expect(off[1]).toHaveBeenCalledOnce();
    expect(sessions[1].term.dispose).toHaveBeenCalledOnce();
    net.scheduler.advanceTo(3300);
    expect(sends[1]).toHaveBeenCalledTimes(3);
    [0, 2, 3].forEach((index) => expect(sends[index]).toHaveBeenCalledTimes(4));
  });

  it('keeps partial Unicode input/history in excess tabs and selects the local neighbor on close', () => {
    const { hosts } = devices();
    hosts.slice(0, 4).forEach(open);
    const fifth = open(hosts[4]);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(fifth, 'hostname\r');
    input(fifth, 'Olá 東京 ');
    open(hosts[5]);
    useStore.getState().moveTerminalTab(hosts[5].id, { panelId: 'terminal-pane-5' });
    useStore.getState().setActiveTerminal(hosts[4].id);
    input(fifth, '🌐\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京 🌐');
    useStore.getState().cycleTerminal(1);
    useStore.getState().cycleTerminal(-1);
    input(fifth, '\x1b[A');
    input(fifth, '\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京 🌐');
    useStore.getState().closeTerminal(hosts[4].id);
    expect(useStore.getState().activeTerminal).toBe(hosts[5].id);
    expect(useStore.getState().terminalPanels).toHaveLength(5);
    expect(fifth.term.dispose).toHaveBeenCalledOnce();
  });

  it.each(['deleteDevice', 'onNodesChange'] as const)('removes panel membership when deleting devices via %s', (method) => {
    const { hosts } = devices();
    hosts.slice(0, 4).forEach(open);
    if (method === 'deleteDevice') useStore.getState().deleteDevice(hosts[2].id);
    else useStore.getState().onNodesChange([{ type: 'remove', id: hosts[2].id }]);
    expect(useStore.getState().terminalPanels).toHaveLength(3);
    expect(useStore.getState().terminalPanels.flatMap((panel) => panel.tabs)).not.toContain(hosts[2].id);
    useStore.getState().newTopology();
    expect(useStore.getState().terminalPanels).toEqual([]);
    expect(useStore.getState().terminalHasFocus).toBe(false);
  });
});

describe('manual terminal tab movement', () => {
  it('restores panel order and locks independently in both modes after explicit reopening', () => {
    pair();
    const store = useStore.getState();
    for (const kind of ['router', 'firewall', 'host', 'server', 'host', 'server'] as const) store.addDeviceAt(kind, { x: 300, y: 200 });
    const ids = useStore.getState().nodes.map((n) => n.id);
    ids.forEach(store.openTerminal);
    store.toggleTerminalPanelLock('terminal-pane-6', Object.fromEntries(useStore.getState().terminalPanels.map((p) => [p.id, 350])));
    store.reorderTerminalPanel('terminal-pane-6', 'terminal-pane-1');
    store.moveTerminalTab(ids[7], { panelId: 'terminal-pane-6' });
    const free = useStore.getState().terminalPanels.map(({ id, tabs, lockedWidth }) => ({ id, tabs, lockedWidth }));
    store.setTerminalLayoutMode('by-type');
    store.reorderTerminalPanel('terminal-group-firewall', 'terminal-group-host');
    store.moveTerminalTab(ids[6], { panelId: 'terminal-group-host', beforeId: ids[0] });
    const grouped = useStore.getState().terminalPanels.map(({ id, tabs }) => ({ id, tabs }));
    store.flushAutosave();
    store.boot();
    expect(useStore.getState().terminals).toEqual([]);
    [...ids].reverse().forEach(store.openTerminal);
    expect(useStore.getState().terminalPanels.map(({ id, tabs }) => ({ id, tabs }))).toEqual(grouped);
    store.setTerminalLayoutMode('free');
    expect(useStore.getState().terminalPanels.map(({ id, tabs, lockedWidth }) => ({ id, tabs, lockedWidth }))).toEqual(free);
    const visual = useStore.getState().terminalPanels.flatMap((p) => p.tabs);
    store.setActiveTerminal(visual[0]);
    for (const id of [...visual.slice(1), visual[0]]) { store.cycleTerminal(1); expect(useStore.getState().activeTerminal).toBe(id); }
    expect(storage.get('netsim:autosave:v1')).not.toContain('terminal-pane-');
  });

  it('moves only presentation while four pings, partial input, locks, visual navigation and opening order survive', () => {
    const { net } = pair();
    const store = useStore.getState();
    for (const kind of ['router', 'firewall', 'host', 'server'] as const) store.addDeviceAt(kind, { x: 300, y: 200 });
    const devices = useStore.getState().nodes.map((n) => sim.net.devices.get(n.id) as IpDevice);
    devices.forEach((d, i) => { d.getInterface('eth0')!.ip = parseCidr(`10.0.0.${i + 1}/24`); });
    const sessions = devices.map(open);
    sessions.slice(0, 4).forEach((session, i) => input(session, `ping 10.0.0.${i + 1}\r`));
    input(sessions[4], 'host');
    const off = devices.slice(0, 4).map((d) => vi.spyOn(d, 'offIcmp'));
    const widths = Object.fromEntries(useStore.getState().terminalPanels.map((p) => [p.id, 350]));
    store.toggleTerminalPanelLock('terminal-pane-1', widths);
    vi.advanceTimersByTime(500); setItem.mockClear();
    const before = serializeNetwork(net, {});
    const focusRequest = useStore.getState().terminalFocusRequest;
    const active = useStore.getState().activeTerminal;
    store.reorderTerminalPanel('terminal-pane-6', 'terminal-pane-3');
    expect(useStore.getState().activeTerminal).toBe(active);
    expect(useStore.getState().terminalFocusRequest).toBe(focusRequest + 1);
    store.moveTerminalTab(devices[2].id, { panelId: 'terminal-pane-4' });
    expect(useStore.getState().terminalPanels).toHaveLength(5);
    store.moveTerminalTab(devices[4].id, { panelId: 'terminal-pane-1' });
    expect(useStore.getState().terminalPanels[0]).toMatchObject({ tabs: [devices[0].id, devices[4].id], lockedWidth: 350 });
    store.cycleTerminal(-1);
    expect(useStore.getState().activeTerminal).toBe(devices[0].id);
    store.moveTerminalTab(devices[4].id, { panelId: null });
    expect(useStore.getState().terminalPanels).toHaveLength(5);
    expect(useStore.getState().terminals).toEqual(devices.map((d) => d.id));
    store.setTerminalDockCollapsed(true); store.setTerminalDockCollapsed(false);
    net.scheduler.advanceTo(2200);
    off.forEach((cancel) => expect(cancel).not.toHaveBeenCalled());
    sessions.forEach((session, i) => {
      expect(getSession(devices[i])).toBe(session);
      expect(session.term.dispose).not.toHaveBeenCalled();
      if (i < 4) expect(output(session)).toContain('icmp_seq=2');
    });
    const exec = vi.spyOn(Shell.prototype, 'exec'); input(sessions[4], 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    expect(serializeNetwork(net, {})).toEqual(before);
    vi.advanceTimersByTime(1000);
    expect(setItem.mock.calls.every(([key]) => [PANEL_LAYOUT_KEY, TAB_LAYOUT_KEY].includes(key))).toBe(true);
  });

  it('restores independent manual layouts on explicit reopening after F5, and forgets definitive closures', () => {
    const { a, b } = pair();
    const store = useStore.getState();
    store.addDeviceAt('host', { x: 300, y: 200 });
    const c = sim.net.devices.get(useStore.getState().nodes[2].id) as IpDevice;
    open(a); open(b); open(c);
    store.moveTerminalTab(c.id, { panelId: 'terminal-pane-1', beforeId: a.id });
    const free = useStore.getState().terminalPanels.map(({ id, tabs }) => ({ id, tabs }));
    store.setTerminalLayoutMode('by-type');
    store.moveTerminalTab(c.id, { panelId: 'terminal-group-host', beforeId: a.id });
    store.flushAutosave();
    expect(storage.get('netsim:autosave:v1')).not.toContain('terminal-pane-');
    store.boot();
    expect(useStore.getState().terminals).toEqual([]);
    store.openTerminal(b.id); store.openTerminal(a.id); store.openTerminal(c.id);
    expect(useStore.getState().terminalPanels.map((p) => p.tabs)).toEqual([[c.id, a.id], [b.id]]);
    store.setTerminalLayoutMode('free');
    expect(useStore.getState().terminalPanels.map(({ id, tabs }) => ({ id, tabs }))).toEqual(free);
    expect(useStore.getState().terminals).toEqual([b.id, a.id, c.id]);
    store.closeTerminal(c.id); store.openTerminal(c.id);
    expect(useStore.getState().terminalPanels.find((p) => p.tabs.includes(c.id))?.tabs).toEqual([c.id]);
    store.setTerminalLayoutMode('by-type');
    expect(useStore.getState().terminalPanels[0].tabs).toEqual([a.id, c.id]);
    store.newTopology();
    expect(useStore.getState().terminals).toEqual([]);
  });

});

describe('collapsing terminal presentation', () => {
  it.each(['free', 'by-type'] as const)('keeps four pings, partial input and locked layout intact through repeated collapse/expand in %s', (mode) => {
    const { net } = pair();
    const store = useStore.getState();
    for (const kind of ['router', 'firewall', 'host'] as const) store.addDeviceAt(kind, { x: 300, y: 200 });
    const devices = useStore.getState().nodes.map((n) => sim.net.devices.get(n.id) as IpDevice);
    devices.forEach((device, i) => { device.getInterface('eth0')!.ip = parseCidr(`10.0.0.${i + 1}/24`); });
    store.setTerminalLayoutMode(mode);
    const sessions = devices.map(open);
    sessions.slice(0, 4).forEach((session, i) => input(session, `ping 10.0.0.${i + 1}\r`));
    input(sessions[4], 'hostname\r');
    input(sessions[4], 'host');
    const off = devices.slice(0, 4).map((device) => vi.spyOn(device, 'offIcmp'));
    const widths = Object.fromEntries(useStore.getState().terminalPanels.map((panel) => [panel.id, 350]));
    store.toggleTerminalPanelLock(useStore.getState().terminalPanels[0].id, widths);
    vi.advanceTimersByTime(500);
    setItem.mockClear();
    const panels = useStore.getState().terminalPanels;
    const terminals = useStore.getState().terminals;
    sessions.forEach((session) => vi.mocked(session.term.clearSelection).mockClear());
    const exec = vi.spyOn(Shell.prototype, 'exec');
    for (let step = 1; step <= 3; step++) {
      const request = useStore.getState().terminalFocusRequest;
      store.setTerminalDockCollapsed(true);
      expect(useStore.getState().terminalHasFocus).toBe(false);
      expect(useStore.getState().terminalFocusRequest).toBe(request);
      expect(useStore.getState().terminalPanels).toBe(panels);
      net.scheduler.advanceTo(step * 1100);
      store.setTerminalDockCollapsed(false);
      expect(useStore.getState().terminalHasFocus).toBe(true);
      expect(useStore.getState().terminalFocusRequest).toBe(request + 1);
      expect(useStore.getState().activeTerminal).toBe(devices[4].id);
      expect(useStore.getState().terminals).toBe(terminals);
    }
    sessions.forEach((session, i) => {
      expect(getSession(devices[i])).toBe(session);
      expect(session.term.dispose).not.toHaveBeenCalled();
      expect(session.term.clearSelection).not.toHaveBeenCalled();
    });
    off.forEach((cancel) => expect(cancel).not.toHaveBeenCalled());
    sessions.slice(0, 4).forEach((session) => expect(output(session)).toContain('icmp_seq=3'));
    input(sessions[4], 'name\r');
    input(sessions[4], '\x1b[A');
    input(sessions[4], '\r');
    expect(exec.mock.calls.map(([line]) => line)).toEqual(['hostname', 'hostname']);
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('expands on explicit session access and resets transient collapse on boot without reopening sessions', () => {
    const { a, b } = pair();
    const store = useStore.getState();
    store.setTerminalDockCollapsed(true);
    expect(useStore.getState().terminalDockCollapsed).toBe(false);
    open(a); open(b);
    store.setTerminalDockCollapsed(true);
    store.openTerminal(a.id);
    expect(useStore.getState().terminalDockCollapsed).toBe(false);
    store.setTerminalDockCollapsed(true);
    store.setActiveTerminal(b.id);
    expect(useStore.getState().terminalDockCollapsed).toBe(false);
    store.setTerminalDockCollapsed(true);
    store.closeTerminal(b.id);
    expect(useStore.getState().terminalDockCollapsed).toBe(true);
    expect(useStore.getState().terminalHasFocus).toBe(false);
    store.closeTerminal(a.id);
    expect(useStore.getState().terminalDockCollapsed).toBe(false);
    open(a);
    store.setTerminalDockCollapsed(true);
    const saved = storage.get('netsim:autosave:v1')!;
    expect(saved).not.toContain('terminalDockCollapsed');
    store.boot();
    expect(useStore.getState().terminals).toEqual([]);
    expect(useStore.getState().terminalDockCollapsed).toBe(false);
  });
});

describe('switching terminal organization modes', () => {
  it.each(['free', 'by-type'] as const)('persists manually resized locks in %s through redistribution and explicit reopening', (mode) => {
    const { net } = pair();
    const store = useStore.getState();
    for (const kind of ['router', 'firewall', 'host', 'server'] as const) store.addDeviceAt(kind, { x: 300, y: 200 });
    const devices = useStore.getState().nodes.map((n) => sim.net.devices.get(n.id) as IpDevice);
    devices.forEach((device, i) => { device.getInterface('eth0')!.ip = parseCidr(`10.0.0.${i + 1}/24`); });
    const sessions = devices.map(open);
    sessions.slice(0, 4).forEach((session, i) => input(session, `ping 10.0.0.${i + 1}\r`));
    input(sessions[4], 'host');
    store.setTerminalLayoutMode(mode);
    let panels = useStore.getState().terminalPanels;
    store.toggleTerminalPanelLock(panels[0].id, Object.fromEntries(panels.map((p) => [p.id, 400])));
    store.toggleTerminalPanelLock(panels[1].id, Object.fromEntries(panels.map((p) => [p.id, 400])));
    store.toggleTerminalPanelLock(panels[2].id, Object.fromEntries(panels.map((p) => [p.id, 400])));
    panels = useStore.getState().terminalPanels;
    store.flushAutosave(); setItem.mockClear();
    const before = serializeNetwork(net, {});
    store.setTerminalPanels(resizePanelPair(panels, panels[0].id, panels[1].id, 0.625, 280 / 800, panels.map(() => 400)));
    const expected = useStore.getState().terminalPanels;
    expect(expected[0].lockedWidth).toBe(500);
    expect(expected[1].lockedWidth).toBe(300);
    expect(expected[2].lockedWidth).toBe(400);
    expect(expected.map((p) => p.tabs)).toEqual(panels.map((p) => p.tabs));
    store.addDeviceAt('host', { x: 300, y: 200 });
    const extra = useStore.getState().nodes.at(-1)!.id;
    store.openTerminal(extra);
    expect(useStore.getState().terminalPanels.slice(0, 3).map((p) => p.lockedWidth)).toEqual([500, 300, 400]);
    store.closeTerminal(extra);
    expect(useStore.getState().terminalPanels.slice(0, 3).map((p) => p.lockedWidth)).toEqual([500, 300, 400]);
    store.deleteDevice(extra);
    net.scheduler.advanceTo(2200);
    sessions.forEach((session, i) => {
      expect(getSession(devices[i])).toBe(session);
      expect(session.term.dispose).not.toHaveBeenCalled();
      if (i < 4) expect(output(session)).toContain('icmp_seq=2');
    });
    input(sessions[4], 'name\r');
    expect(output(sessions[4])).not.toContain('command not found');
    expect(serializeNetwork(net, {})).toEqual(before);
    store.flushAutosave();
    expect(storage.get('netsim:autosave:v1')).not.toContain('lockedWidth');
    const local = JSON.parse(storage.get(PANEL_LAYOUT_KEY)!);
    expect(local[mode][panels[0].id].lockedWidth).toBe(500);
    expect(local[mode][panels[1].id].lockedWidth).toBe(300);
    store.boot();
    expect(useStore.getState().terminals).toEqual([]);
    devices.forEach((device) => store.openTerminal(device.id));
    expect(useStore.getState().terminalPanels.slice(0, 3).map((p) => p.lockedWidth)).toEqual([500, 300, 400]);
    store.setTerminalLayoutMode(mode === 'free' ? 'by-type' : 'free');
    store.setTerminalLayoutMode(mode);
    expect(useStore.getState().terminalPanels.slice(0, 3).map((p) => p.lockedWidth)).toEqual([500, 300, 400]);
  });

  it('keeps a panel lock through tab changes and redistribution while sessions keep running', () => {
    const { a, b, net } = pair();
    const store = useStore.getState();
    store.addDeviceAt('host', { x: 300, y: 200 });
    const c = sim.net.devices.get(useStore.getState().nodes[2].id) as IpDevice;
    const first = open(a), second = open(b);
    input(first, 'host');
    input(second, 'ping 10.0.0.2\r');
    const off = vi.spyOn(b, 'offIcmp');
    const before = serializeNetwork(net, {});
    store.toggleTerminalPanelLock('terminal-pane-1', { 'terminal-pane-1': 450, 'terminal-pane-2': 750 });
    open(c);
    expect(useStore.getState().terminalPanels[0].lockedWidth).toBe(450);
    store.closeTerminal(c.id);
    expect(useStore.getState().terminalPanels[0].lockedWidth).toBe(450);
    store.setTerminalLayoutMode('by-type');
    open(c);
    store.toggleTerminalPanelLock('terminal-group-host', { 'terminal-group-host': 550, 'terminal-group-server': 650 });
    store.setActiveTerminal(a.id);
    expect(useStore.getState().terminalPanels[0]).toMatchObject({ tabs: [a.id, c.id], lockedWidth: 550 });
    store.setTerminalLayoutMode('free');
    expect(useStore.getState().terminalPanels[0].lockedWidth).toBe(450);
    net.scheduler.advanceTo(1100);
    expect(output(second)).toContain('icmp_seq=1');
    expect(off).not.toHaveBeenCalled();
    expect(getSession(a)).toBe(first);
    expect(getSession(b)).toBe(second);
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(first, 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    expect(serializeNetwork(net, {})).toEqual(before);
  });

  it('restores local width preferences after boot by mode and panel slot, without restoring or reordering sessions', () => {
    const { a, b } = pair();
    const store = useStore.getState();
    open(a); open(b);
    store.toggleTerminalPanelLock('terminal-pane-1', { 'terminal-pane-1': 450, 'terminal-pane-2': 750 });
    store.setTerminalLayoutMode('by-type');
    store.toggleTerminalPanelLock('terminal-group-server', { 'terminal-group-host': 600, 'terminal-group-server': 350 });
    store.setTerminalLayoutMode('free');
    store.flushAutosave();
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(JSON.stringify(saved)).not.toContain('lockedWidth');
    store.boot();
    expect(useStore.getState().terminals).toEqual([]);
    store.openTerminal(b.id); store.openTerminal(a.id);
    expect(useStore.getState().terminals).toEqual([b.id, a.id]);
    expect(useStore.getState().terminalPanels[0]).toMatchObject({ tabs: [b.id], lockedWidth: 450 });
    store.setTerminalLayoutMode('by-type');
    expect(useStore.getState().terminalPanels.find((p) => p.kind === 'server')?.lockedWidth).toBe(350);
    store.setTerminalLayoutMode('free');
    store.closeTerminal(b.id);
    store.openTerminal(b.id);
    expect(useStore.getState().terminalPanels.find((p) => p.tabs.includes(b.id))?.lockedWidth).toBeUndefined();
  });

  it('regroups live sessions without disposing buffers, partial input, focus or commands', () => {
    const { a, b, net } = pair();
    const store = useStore.getState();
    for (const kind of ['router', 'firewall', 'host'] as const) store.addDeviceAt(kind, { x: 300, y: 200 });
    const devices = useStore.getState().nodes.map((n) => sim.net.devices.get(n.id) as IpDevice);
    const sessions = devices.map(open);
    input(sessions[0], 'host');
    input(sessions[1], 'ping 10.0.0.2\r');
    store.setActiveTerminal(a.id);
    const request = useStore.getState().terminalFocusRequest;
    const before = serializeNetwork(net, {});
    const off = vi.spyOn(b, 'offIcmp');
    store.setTerminalLayoutMode('by-type');
    expect(useStore.getState().terminalPanels.map((p) => p.kind)).toEqual(['host', 'server', 'router', 'firewall']);
    expect(useStore.getState().terminalPanels[0].tabs).toEqual([a.id, devices[4].id]);
    expect(useStore.getState().terminalPanels[0].active).toBe(a.id);
    expect(useStore.getState().activeTerminal).toBe(a.id);
    expect(useStore.getState().terminalFocusRequest).toBe(request);
    expect(useStore.getState().terminalHasFocus).toBe(true);
    const groupedOrder = [a.id, devices[4].id, b.id, devices[2].id, devices[3].id];
    for (const expected of [...groupedOrder.slice(1), groupedOrder[0]]) {
      store.cycleTerminal(1);
      expect(useStore.getState().activeTerminal).toBe(expected);
      expect(useStore.getState().terminalPanels.find((p) => p.tabs.includes(useStore.getState().activeTerminal!))?.active).toBe(useStore.getState().activeTerminal);
    }
    store.setTerminalLayoutMode('free');
    expect(useStore.getState().terminalPanels).toHaveLength(5);
    expect(useStore.getState().terminalPanels.every((p) => !p.kind)).toBe(true);
    expect(useStore.getState().terminalPanels.flatMap((p) => p.tabs).sort()).toEqual(devices.map((d) => d.id).sort());
    devices.forEach((device, i) => {
      expect(getSession(device)).toBe(sessions[i]);
      expect(sessions[i].term.dispose).not.toHaveBeenCalled();
    });
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(sessions[0], 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    net.scheduler.advanceTo(1100);
    expect(output(sessions[1])).toContain('icmp_seq=1');
    expect(off).not.toHaveBeenCalled();
    expect(serializeNetwork(net, {})).toEqual(before);
  });

  it.each(['closeTerminal', 'deleteDevice', 'onNodesChange'] as const)('removes tabs and empty groups through %s without closing other types', (method) => {
    const { a, b } = pair();
    const store = useStore.getState();
    store.addDeviceAt('host', { x: 300, y: 200 });
    const other = sim.net.devices.get(useStore.getState().nodes[2].id) as IpDevice;
    store.setTerminalLayoutMode('by-type');
    const first = open(a), server = open(b), second = open(other);
    expect(useStore.getState().terminalPanels).toHaveLength(2);
    const remove = (id: string) => method === 'onNodesChange' ? store.onNodesChange([{ type: 'remove', id }]) : store[method](id);
    remove(other.id);
    expect(second.term.dispose).toHaveBeenCalledOnce();
    expect(useStore.getState().terminalPanels[0]).toMatchObject({ tabs: [a.id], active: a.id, kind: 'host' });
    remove(a.id);
    expect(first.term.dispose).toHaveBeenCalledOnce();
    expect(useStore.getState().terminalPanels.map((p) => p.kind)).toEqual(['server']);
    expect(server.term.dispose).not.toHaveBeenCalled();
    expect(getSession(b)).toBe(server);
    store.closeTerminal(b.id);
    expect(useStore.getState().terminalPanels).toEqual([]);
    expect(useStore.getState().terminalLayoutMode).toBe('by-type');
    store.openTerminal(b.id);
    expect(useStore.getState().terminalPanels[0].kind).toBe('server');
  });

  it('debounces mode persistence, ignores no-op changes and restores legacy files as free panels', () => {
    const { a, net } = pair();
    const store = useStore.getState();
    const before = serializeNetwork(net, {});
    store.setTerminalLayoutMode('free');
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
    const session = open(a);
    input(session, 'ping 10.0.0.1\r');
    store.setTerminalLayoutMode('by-type');
    store.setTerminalLayoutMode('by-type');
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).ui.terminalLayoutMode).toBe('by-type');
    setItem.mockClear();
    net.scheduler.advanceTo(2100);
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
    store.boot();
    expect(useStore.getState().terminalLayoutMode).toBe('by-type');
    expect(useStore.getState().terminalPanels).toEqual([]);
    expect(serializeNetwork(sim.net, {})).toEqual(before);
    store.openTerminal(a.id);
    expect(useStore.getState().terminalPanels[0].kind).toBe('host');
    store.importJson(JSON.stringify(before));
    expect(useStore.getState().terminalLayoutMode).toBe('free');
    store.importJson(JSON.stringify({ ...before, ui: { terminalLayoutMode: 'invalid' } }));
    expect(useStore.getState().terminalLayoutMode).toBe('free');
    store.setTerminalLayoutMode('by-type');
    store.newTopology();
    expect(useStore.getState().terminalLayoutMode).toBe('free');
  });
});

describe('per-device terminal appearance persistence', () => {
  it('debounces colors into autosave, restores them on boot and leaves network configuration unchanged', () => {
    const { a, b, net } = pair();
    const before = serializeNetwork(net, {});
    const store = useStore.getState();
    store.setTerminalColor(a.id, '#ABCDEF');
    store.setTerminalColor(a.id, '#123456');
    store.setTerminalColor(b.id, '#654321');
    expect(setItem).not.toHaveBeenCalled();
    expect(serializeNetwork(net, {})).toEqual(before);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!) as AppearanceSaveFile;
    expect(saved.ui?.terminalColors).toEqual({ [a.id]: '#123456', [b.id]: '#654321' });
    store.boot();
    expect(useStore.getState().terminalColors).toEqual(saved.ui?.terminalColors);
    // The existing engine loader also accepts the extended file unchanged.
    expect(serializeNetwork(restoreNetwork(saved), {})).toEqual(before);
  });

  it.each(['dual-glow', 'aurora-lines', 'aurora-flow', ...TERMINAL_EFFECT_GROUPS.flatMap((group) => group.presets.map((preset) => preset.id))] as const)('exports and imports custom colors with %s through the actual JSON download path', async (style) => {
    const { a } = pair();
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().setTerminalAppearance({ style, intensity: 63, fontFamily: 'cascadia' });
    useStore.getState().setTerminalLayoutMode('by-type');
    let downloaded!: Blob;
    const click = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ click }) });
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => { downloaded = blob; return 'blob:topology-test'; },
      revokeObjectURL: vi.fn(),
    });
    useStore.getState().exportJson();
    expect(click).toHaveBeenCalledOnce();
    const json = await downloaded.text();
    useStore.getState().newTopology();
    expect(useStore.getState().importJson(json)).toBeNull();
    expect(useStore.getState().terminalColors).toEqual({ [a.id]: '#123456' });
    expect(useStore.getState().terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style, intensity: 63, fontFamily: 'cascadia' });
    expect(useStore.getState().terminalLayoutMode).toBe('by-type');
  });

  it('restores the default without persisting redundant overrides and ignores invalid/no-op changes', () => {
    const { a } = pair();
    const store = useStore.getState();
    store.setTerminalColor(a.id, 'red');
    store.setTerminalColor('missing', '#123456');
    store.setTerminalColor(a.id, null);
    store.setTerminalColor(a.id, DEFAULT_TERMINAL_COLORS.host);
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
    store.setTerminalColor(a.id, '#123456');
    store.setTerminalColor(a.id, null);
    vi.advanceTimersByTime(500);
    expect(useStore.getState().terminalColors).toEqual({});
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).ui.terminalColors).toBeUndefined();
    setItem.mockClear();
    store.setTerminalColor(a.id, '#ABCDEF');
    vi.advanceTimersByTime(500);
    setItem.mockClear();
    store.setTerminalColor(a.id, '#abcdef');
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
    store.setTerminalColor(a.id, DEFAULT_TERMINAL_COLORS.host);
    expect(useStore.getState().terminalColors).toEqual({});
  });

  it.each(['dual-glow', 'aurora-lines', 'aurora-flow', 'fx-aurora-balanced', 'fx-lines-flow', 'fx-signal-pulse', 'fx-mesh-prism'] as const)('keeps a running session and partial input intact with %s and after close/reopen', (style) => {
    const { a, b, net } = pair();
    const first = open(a);
    const second = open(b);
    input(first, 'host');
    input(second, 'ping 10.0.0.2\r');
    const send = vi.spyOn(b, 'sendEcho');
    const exec = vi.spyOn(Shell.prototype, 'exec');
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().setTerminalColor(b.id, '#654321');
    useStore.getState().setTerminalAppearance({ style, intensity: 95, fontSize: 18 });
    net.scheduler.advanceTo(1100);
    expect(send).toHaveBeenCalledOnce();
    expect(first.term.dispose).not.toHaveBeenCalled();
    expect(second.term.dispose).not.toHaveBeenCalled();
    open(a);
    input(first, 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    vi.advanceTimersByTime(500);
    setItem.mockClear();
    net.scheduler.advanceTo(3100);
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
    useStore.getState().closeTerminal(a.id);
    expect(open(a)).not.toBe(first);
    expect(useStore.getState().terminalColors[a.id]).toBe('#123456');
  });

  it.each(['deleteDevice', 'onNodesChange'] as const)('removes orphan colors when deleting with %s', (method) => {
    const { a, b } = pair();
    const store = useStore.getState();
    store.setTerminalColor(a.id, '#123456');
    store.setTerminalColor(b.id, '#654321');
    if (method === 'deleteDevice') store.deleteDevice(a.id);
    else store.onNodesChange([{ type: 'remove', id: a.id }]);
    expect(useStore.getState().terminalColors).toEqual({ [b.id]: '#654321' });
    store.newTopology();
    expect(useStore.getState().terminalColors).toEqual({});
  });

  it('loads legacy files, examples and labs without leaking colors from an earlier topology', () => {
    const { a, net } = pair();
    const legacy = JSON.stringify(serializeNetwork(net, {}));
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().setTerminalAppearance({ style: 'dual-glow', intensity: 99 });
    expect(useStore.getState().importJson(legacy)).toBeNull();
    expect(useStore.getState().terminalColors).toEqual({});
    expect(useStore.getState().terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, fontSize: 13 });
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().loadBundledLab(0);
    expect(useStore.getState().terminalColors).toEqual({});
    useStore.getState().loadExample(0);
    expect(useStore.getState().terminalColors).toEqual({});
  });

  it.each(['dual-glow', 'aurora-lines', 'aurora-flow', 'fx-aurora-balanced', 'fx-lines-flow', 'fx-signal-pulse', 'fx-mesh-prism'] as const)('autosaves %s/intensity independently of colors and preserves the engine configuration', (style) => {
    const { net } = pair();
    const before = serializeNetwork(net, {});
    useStore.getState().setTerminalAppearance({ style });
    useStore.getState().setTerminalAppearance({ intensity: 55 });
    expect(serializeNetwork(net, {})).toEqual(before);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.ui.terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style, intensity: 55 });
    expect(saved.ui.terminalColors).toBeUndefined();
    useStore.getState().boot();
    expect(useStore.getState().terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style, intensity: 55 });
    useStore.getState().newTopology();
    expect(useStore.getState().terminalAppearance).toEqual(DEFAULT_TERMINAL_APPEARANCE);
  });

  it('does not save unchanged preferences and keeps the explicit font default when resetting styles', () => {
    pair();
    useStore.getState().setTerminalAppearance({ ...DEFAULT_TERMINAL_APPEARANCE });
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
    useStore.getState().setTerminalAppearance({ style: 'dual-glow', intensity: 100 });
    useStore.getState().setTerminalAppearance({ ...DEFAULT_TERMINAL_APPEARANCE });
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).ui).toEqual({ terminalAppearance: DEFAULT_TERMINAL_APPEARANCE });
  });

  it.each([12, 13, 14, 18])('persists a font-only change (%ipx) and restores it after boot without changing the engine', (fontSize) => {
    const { net } = pair();
    const before = serializeNetwork(net, {});
    useStore.getState().setTerminalAppearance({ fontSize });
    // At 14px the first call is a no-op; toggle back to the default to verify
    // that autosave records it explicitly instead of producing a legacy file.
    if (fontSize === 14) {
      useStore.getState().setTerminalAppearance({ fontSize: 13 });
      useStore.getState().setTerminalAppearance({ fontSize: 14 });
    }
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    expect(serializeNetwork(net, {})).toEqual(before);
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).ui.terminalAppearance.fontSize).toBe(fontSize);
    useStore.getState().boot();
    expect(useStore.getState().terminalAppearance.fontSize).toBe(fontSize);
    setItem.mockClear();
    useStore.getState().setTerminalAppearance({ fontSize });
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(['system', 'consolas', 'cascadia', 'courier'] as const)('autosaves the %s family without changing network configuration', (fontFamily) => {
    const { net } = pair();
    const before = serializeNetwork(net, {});
    const store = useStore.getState();
    if (fontFamily === 'system') store.setTerminalAppearance({ fontFamily: 'courier' });
    store.setTerminalAppearance({ fontFamily });
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    expect(serializeNetwork(net, {})).toEqual(before);
    store.boot();
    expect(useStore.getState().terminalAppearance.fontFamily).toBe(fontFamily);
    setItem.mockClear();
    useStore.getState().setTerminalAppearance({ fontFamily });
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores all appearance defaults atomically without disturbing panels, input or a running command', () => {
    const { a, b, net } = pair();
    const first = open(a), second = open(b);
    const before = serializeNetwork(net, {});
    const store = useStore.getState();
    input(first, 'host');
    input(second, 'ping 10.0.0.2\r');
    store.setTerminalColor(a.id, '#123456');
    store.setTerminalColor(b.id, '#654321');
    store.setTerminalAppearance({ style: 'dual-glow', intensity: 15, fontSize: 18, fontFamily: 'courier' });
    vi.advanceTimersByTime(500);
    setItem.mockClear();
    const panels = useStore.getState().terminalPanels;
    const off = vi.spyOn(b, 'offIcmp');
    store.resetTerminalAppearance();
    expect(useStore.getState().terminalColors).toEqual({});
    expect(useStore.getState().terminalAppearance).toEqual(DEFAULT_TERMINAL_APPEARANCE);
    expect(useStore.getState().terminalPanels).toBe(panels);
    expect(getSession(a)).toBe(first);
    expect(getSession(b)).toBe(second);
    expect(off).not.toHaveBeenCalled();
    expect(serializeNetwork(net, {})).toEqual(before);
    net.scheduler.advanceTo(1100);
    expect(output(second)).toContain('icmp_seq=1');
    const exec = vi.spyOn(Shell.prototype, 'exec');
    input(first, 'name\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('hostname');
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).ui).toEqual({ terminalAppearance: DEFAULT_TERMINAL_APPEARANCE });
    store.boot();
    expect(useStore.getState().terminalAppearance).toEqual(DEFAULT_TERMINAL_APPEARANCE);
    expect(useStore.getState().terminalColors).toEqual({});
    setItem.mockClear();
    useStore.getState().resetTerminalAppearance();
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('autosave from terminal commands', () => {
  it('debounces configuration edits and restores address, routes, forwarding, firewall and link state on boot', () => {
    const { a } = pair();
    const session = open(a);
    input(session, 'ip addr del 10.0.0.1/24 dev eth0\r');
    input(session, 'ip addr add 10.0.0.10/24 dev eth0\r');
    input(session, 'ip route add default via 10.0.0.2\r');
    input(session, 'sysctl -w net.ipv4.ip_forward=1\r');
    input(session, 'iptables -P INPUT DROP\r');
    input(session, 'ip link set eth0 down\r');
    vi.advanceTimersByTime(499);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    useStore.getState().boot();
    const restored = sim.net.devices.get(a.id) as IpDevice;
    expect(restored).not.toBe(a);
    expect(restored.getInterface('eth0')!.ip).toEqual(parseCidr('10.0.0.10/24'));
    expect(restored.getInterface('eth0')!.up).toBe(false);
    expect(restored.staticRoutes[0]?.via).toBe(parseIp('10.0.0.2'));
    expect(restored.forwarding).toBe(true);
    expect(restored.fw.filter.input.policy).toBe('drop');
    expect(useStore.getState().nodes.find((n) => n.id === a.id)?.position).toEqual({ x: 20, y: 30 });
    vi.advanceTimersByTime(10_000);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('saves asynchronous DHCP configuration and avoids reissuing the occupied address after boot', () => {
    const { a, b, net } = pair();
    a.getInterface('eth0')!.ip = null;
    b.dhcpServer = {
      enabled: true, rangeStart: parseIp('10.0.0.100')!, rangeEnd: parseIp('10.0.0.110')!,
      router: parseIp('10.0.0.2'), dns: parseIp('10.0.0.2'), leases: new Map(),
    };
    const session = open(a);
    input(session, 'dhclient eth0\r');
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1); // DHCP mode is saved immediately, before an ACK.
    net.scheduler.advanceTo(2000);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(2);
    useStore.getState().boot();
    const restored = sim.net.devices.get(a.id) as IpDevice;
    expect(restored.getInterface('eth0')!.ip).toEqual(parseCidr('10.0.0.100/24'));
    expect(restored.routes().find((r) => r.prefix === 0)?.via).toBe(parseIp('10.0.0.2'));
    expect(restored.nameserver).toBe(parseIp('10.0.0.2'));
    const store = () => useStore.getState();
    store().onEdgesChange([{ type: 'remove', id: store().edges[0].id }]);
    store().addDeviceAt('switch', { x: 100, y: 100 }); const sw = store().nodes.at(-1)!.id;
    store().addDeviceAt('host', { x: 200, y: 100 }); const fresh = sim.net.devices.get(store().nodes.at(-1)!.id) as Host;
    for (const id of [a.id, b.id, fresh.id]) store().onConnect({ source: id, target: sw, sourceHandle: null, targetHandle: null });
    store().setHostOs(fresh.id, 'windows'); fresh.interfaces[0].configureIpv4({ mode: 'dhcp', ip: null, gateway: null, dns: null });
    const terminal = open(fresh); input(terminal, 'ipconfig /renew\r'); sim.net.scheduler.advanceTo(5000);
    expect(fresh.interfaces[0].ip?.addr).toBe(parseIp('10.0.0.101'));
    expect(restored.interfaces[0].ip?.addr).toBe(parseIp('10.0.0.100'));
  });

  it('does not save read-only commands, errors, packet output or ping cancellation', () => {
    const { a, net } = pair();
    const session = open(a);
    for (const line of ['hostname', 'ip addr', 'ip route', 'ip addr add invalid dev eth0', 'clear']) {
      input(session, line + '\r');
    }
    input(session, 'ping 10.0.0.2\r');
    for (let t = 1000; t <= 4000; t += 1000) {
      net.scheduler.advanceTo(t);
      vi.advanceTimersByTime(1000);
    }
    expect(output(session)).toContain('icmp_seq=3');
    input(session, '\x03');
    input(session, 'ping -c 1 10.0.0.2\r');
    net.scheduler.advanceTo(8000);
    vi.advanceTimersByTime(1000);
    expect(a.arpTable.size).toBeGreaterThan(0);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('flushes pending edits before page exit without duplicate writes', () => {
    const { a } = pair();
    input(open(a), 'sysctl -w net.ipv4.ip_forward=1\r');
    expect(setItem).not.toHaveBeenCalled();
    // This is the same action registered for pagehide in main.tsx.
    useStore.getState().flushAutosave();
    useStore.getState().flushAutosave();
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);
    useStore.getState().boot();
    expect((sim.net.devices.get(a.id) as IpDevice).forwarding).toBe(true);
  });
});


describe('topology movement history', () => {
  function move(ids: string[], x: number, dragging = false) {
    useStore.getState().onNodesChange(ids.map((id) => ({ id, type: 'position' as const, position: { x, y: 30 }, dragging })));
  }
  it('groups continuous multi-device drags, autosaves undo/redo, and ignores derived/UI state', () => {
    const { a, b, net } = pair();
    const store = useStore.getState();
    const start = store.nodes.map((n) => ({ ...n.position }));
    store.beginNodeMovement('drag');
    move([a.id, b.id], 50, true); move([a.id, b.id], 90, true); move([a.id, b.id], 100);
    store.finishNodeMovement();
    expect(useStore.getState().topologyHistory.past).toHaveLength(1);
    expect((useStore.getState().topologyHistory.past[0] as MoveOperation).changes).toHaveLength(2);
    store.tick(20); store.refresh(); store.select(a.id); store.setSpeed(2);
    expect(useStore.getState().topologyHistory.past).toHaveLength(1);
    store.undoTopology();
    expect(useStore.getState().nodes.map((n) => n.position)).toEqual(start);
    vi.advanceTimersByTime(500);
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).devices.map((d: { x: number; y: number }) => ({ x: d.x, y: d.y }))).toEqual(start);
    expect(storage.get('netsim:autosave:v1')).not.toContain('topologyHistory');
    store.redoTopology(); vi.advanceTimersByTime(500);
    expect(useStore.getState().nodes.map((n) => n.position.x)).toEqual([100, 100]);
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).devices.map((d: { x: number }) => d.x)).toEqual([100, 100]);
    expect(sim.net).toBe(net); expect(sim.net.devices.get(a.id)).toBe(a);
  });
  it('groups keyboard repeats, supports successive undo/redo, and clears redo on a new move', () => {
    const { a } = pair(); const store = useStore.getState();
    store.beginNodeMovement('keyboard'); move([a.id], 25); store.beginNodeMovement('keyboard'); move([a.id], 30); store.finishNodeMovement();
    move([a.id], 40); expect(useStore.getState().topologyHistory.past).toHaveLength(2);
    store.undoTopology(); store.undoTopology(); expect(useStore.getState().nodes[0].position.x).toBe(20);
    store.redoTopology(); store.redoTopology(); expect(useStore.getState().nodes[0].position.x).toBe(40);
    store.undoTopology(); move([a.id], 45);
    expect(useStore.getState().topologyHistory.future).toEqual([]);
  });
  it('does not record unchanged/cancelled gestures or selection/dimension changes', () => {
    const { a } = pair(); const store = useStore.getState();
    move([a.id], 20); store.beginNodeMovement('drag'); move([a.id], 60, true); store.cancelNodeMovement();
    move([a.id], 70, true); move([a.id], 80); store.finishNodeMovement();
    expect(useStore.getState().nodes[0].position.x).toBe(20);
    store.onNodesChange([{ type: 'select', id: a.id, selected: true }, { type: 'dimensions', id: a.id, dimensions: { width: 120, height: 80 } }]);
    expect(useStore.getState().topologyHistory).toEqual({ past: [], future: [] });
  });
  it('preserves live sessions, partial Unicode, buffers and running pings through moves and undo/redo', () => {
    const { a, b, net } = pair(); const first = open(a), second = open(b), store = useStore.getState();
    input(first, 'Olá 東京 '); input(second, 'ping 10.0.0.2\r'); const cancel = vi.spyOn(b, 'offIcmp');
    move([a.id, b.id], 80); store.undoTopology(); store.redoTopology(); net.scheduler.advanceTo(2200);
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second); expect(sim.net).toBe(net);
    expect(first.term.dispose).not.toHaveBeenCalled(); expect(first.term.clearSelection).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled(); expect(output(second)).toContain('icmp_seq=2');
    const exec = vi.spyOn(Shell.prototype, 'exec'); input(first, '🌐\r');
    expect(exec.mock.calls.at(-1)?.[0]).toBe('Olá 東京 🌐');
  });
  it('invalidates on incompatible structure/configuration but not failed edits or non-mutating commands', () => {
    const { a, b } = pair(); const store = useStore.getState(); const first = open(a), second = open(b);
    const seed = () => { move([a.id], useStore.getState().nodes[0].position.x + 5); expect(useStore.getState().topologyHistory.past.length).toBeGreaterThan(0); };
    seed(); expect(store.setIfaceIp(a.id, 'eth0', 'bad')).not.toBeNull(); input(first, 'hostname\r');
    expect(useStore.getState().topologyHistory.past).toHaveLength(1);
    store.setIfaceIp(a.id, 'eth0', '10.0.0.9/24'); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('set-interface-ipv4');
    seed(); store.renameDevice(a.id, 'pc-new'); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('rename-device');
    seed(); input(first, 'ip link set eth0 down\r'); expect(useStore.getState().topologyHistory.past).toEqual([]);
    input(second, 'ping 10.0.0.2\r'); input(first, 'sysctl -w net.ipv4.ip_forward=1\r'); seed(); input(second, '\x03');
    expect(useStore.getState().topologyHistory.past).toHaveLength(1);
    store.onEdgesChange([{ type: 'remove', id: useStore.getState().edges[0].id }]); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('remove-links');
    seed(); store.onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null }); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('add-links');
    seed(); store.addDeviceAt('host', { x: 1, y: 1 }); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('create-device');
    seed(); store.deleteDevice(b.id); expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('delete-devices');
  });
  it('guards unreported configuration changes before undo and clears history only on successful loads', () => {
    const { a } = pair(); const store = useStore.getState();
    move([a.id], 80); store.undoTopology(); a.nameserver = parseIp('10.0.0.2'); store.redoTopology();
    expect(useStore.getState().nodes[0].position.x).toBe(20); expect(useStore.getState().topologyHistory.future).toEqual([]);
    move([a.id], 85); const history = useStore.getState().topologyHistory;
    for (const invalid of ['{', '{}', '{"app":"netsim","version":99,"devices":[],"links":[]}']) {
      expect(store.importJson(invalid)).not.toBeNull(); expect(useStore.getState().topologyHistory).toBe(history);
    }
    const save = serializeNetwork(sim.net, {}); expect(store.importJson(JSON.stringify(save))).toBeNull();
    expect(useStore.getState().topologyHistory.past).toEqual([]);
    move([a.id], 48); store.flushAutosave(); store.boot();
    expect(useStore.getState().topologyHistory).toEqual({ past: [], future: [] });
    expect(useStore.getState().terminals).toEqual([]);
    expect(useStore.getState().nodes[0].position.x).toBe(48);
    move([a.id], 50); store.loadDemo(); expect(useStore.getState().topologyHistory.past).toEqual([]);
    move([useStore.getState().nodes[0].id], 60); store.loadExample(0); expect(useStore.getState().topologyHistory.past).toEqual([]);
    move([useStore.getState().nodes[0].id], 70); store.loadBundledLab(0); expect(useStore.getState().topologyHistory.past).toEqual([]);
    move([useStore.getState().nodes[0].id], 80); store.newTopology(); expect(useStore.getState().topologyHistory.past).toEqual([]);
  });
});

describe('topology creation and cable history', () => {
  const store = () => useStore.getState();
  const add = (kind: 'host' | 'switch' | 'router') => {
    store().addDeviceAt(kind, { x: 90, y: 40 });
    return sim.net.devices.get(store().nodes.at(-1)!.id)!;
  };
  const connect = (a: string, b: string) => store().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });

  it('replays interleaved creation, movement, connection and disconnection without rebuilding the network', () => {
    const net = sim.net, a = add('switch'), b = add('router');
    const initial = captureCreation(net, b, { x: 90, y: 40 }, 1);
    connect(a.id, b.id);
    const link = captureLink([...net.links.values()][0]);
    store().onNodesChange([{ type: 'position', id: b.id, position: { x: 150, y: 40 }, dragging: false }]);
    store().onEdgesChange([{ type: 'remove', id: link.id }]);
    expect(store().topologyHistory.past.map((o) => o.type)).toEqual(['create-device', 'create-device', 'add-links', 'move-nodes', 'remove-links']);
    store().undoTopology(); expect(captureLink(net.links.get(link.id)!)).toEqual(link);
    store().undoTopology(); expect(store().nodes[1].position).toEqual({ x: 90, y: 40 });
    store().undoTopology(); expect(net.links.size).toBe(0);
    store().undoTopology(); expect(net.devices.get(a.id)).toBe(a); expect(net.devices.has(b.id)).toBe(false);
    store().undoTopology(); expect(net.devices.size).toBe(0);
    for (let i = 0; i < 5; i++) store().redoTopology();
    expect(sim.net).toBe(net); expect(net.links.size).toBe(0);
    expect(store().nodes[1].position).toEqual({ x: 150, y: 40 });
    expect(captureCreation(net, net.devices.get(b.id)!, { x: 90, y: 40 }, 1)).toEqual(initial);
    store().undoTopology(); expect(captureLink(net.links.get(link.id)!)).toEqual(link);
    for (let i = 0; i < 3; i++) { store().redoTopology(); store().undoTopology(); }
    expect(net.links.size).toBe(1); expect(store().edges.map((e) => e.id)).toEqual([link.id]);
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.links).toEqual([link]);
    expect(saved.devices[1].x).toBe(150);
  });

  it('undoes a batch of removed cables as one action with the exact original interfaces', () => {
    const a = add('switch'), b = add('router'), c = add('host');
    // Load a baseline with deliberately non-first-free interfaces.
    sim.net.connect(a.id, b.id, { aIface: 'eth4', bIface: 'eth2' });
    sim.net.connect(a.id, c.id, { aIface: 'eth6', bIface: 'eth0' });
    const saved = serializeNetwork(sim.net, {});
    expect(store().importJson(JSON.stringify(saved))).toBeNull();
    const links = [...sim.net.links.values()].map(captureLink);
    store().onEdgesChange(links.map((l) => ({ type: 'remove', id: l.id })));
    expect(store().topologyHistory.past).toHaveLength(1); expect(sim.net.links.size).toBe(0);
    store().undoTopology(); expect([...sim.net.links.values()].map(captureLink)).toEqual(links);
    store().redoTopology(); expect(sim.net.links.size).toBe(0);
    store().undoTopology();
    const history = store().topologyHistory;
    store().onEdgesChange([{ type: 'remove', id: 'missing' }]);
    connect(a.id, a.id); // Failed edits must leave Redo intact.
    expect(store().topologyHistory).toBe(history);
    store().onEdgesChange([{ type: 'remove', id: links[0].id }]);
    expect(store().topologyHistory.future).toEqual([]);
  });

  it('keeps simultaneous pings, terminal identity and input through cable removal/restoration and creation undo', () => {
    const { a, b, net } = pair();
    const left = add('switch'), right = add('switch');
    store().onEdgesChange([{ type: 'remove', id: store().edges[0].id }]);
    connect(a.id, left.id); connect(left.id, right.id); connect(right.id, b.id);
    const first = open(a), second = open(b);
    input(first, 'ping 10.0.0.2\r'); input(second, 'ping 10.0.0.1\r');
    vi.mocked(first.term.clearSelection).mockClear();
    net.scheduler.advanceTo(1000);
    const link = captureLink([...net.links.values()][1]);
    store().onEdgesChange([{ type: 'remove', id: link.id }]);
    net.scheduler.advanceTo(3600);
    expect(output(first)).toContain('no answer yet');
    store().undoTopology(); net.scheduler.advanceTo(6500);
    expect(output(first)).toContain('icmp_seq=6'); expect(output(second)).toContain('icmp_seq=6');
    const extra = add('host') as IpDevice, transient = open(extra);
    input(transient, 'nc -l 9000\r'); expect(extra.ncTcp.has(9000)).toBe(true);
    store().setActiveTerminal(a.id); store().noteTerminalFocus(a.id);
    const stale = vi.fn(); extra.schedule(1000, stale);
    store().undoTopology();
    expect(transient.term.dispose).toHaveBeenCalledOnce(); expect(extra.disposed).toBe(true);
    expect(extra.ncTcp.size).toBe(0); expect(store().terminals).toEqual([a.id, b.id]);
    expect(store().activeTerminal).toBe(a.id); expect(store().terminalHasFocus).toBe(true);
    store().redoTopology(); expect(store().terminals).toEqual([a.id, b.id]);
    net.scheduler.advanceTo(9500); expect(stale).not.toHaveBeenCalled();
    expect(output(first)).toContain('icmp_seq=9'); expect(output(second)).toContain('icmp_seq=9');
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second);
    expect(first.term.dispose).not.toHaveBeenCalled(); expect(second.term.dispose).not.toHaveBeenCalled();
    expect(first.term.clearSelection).not.toHaveBeenCalled();
    expect(store().topologyHistory.past.at(-1)?.type).toBe('create-device');
    store().tick(100); store().refresh();
    expect(store().topologyHistory.past.at(-1)?.type).toBe('create-device');
    store().undoTopology();
    vi.advanceTimersByTime(500);
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).devices.map((d: { id: string }) => d.id)).toEqual([a.id, b.id, left.id, right.id]);
  });

  it('invalidates redo on a new creation, keeps the 50-operation limit and clears on unsupported configuration/load', () => {
    const survivor = add('host');
    for (let i = 0; i < 54; i++) add('host');
    expect(store().topologyHistory.past).toHaveLength(50);
    store().undoTopology(); expect(store().topologyHistory.future).toHaveLength(1);
    add('switch'); expect(store().topologyHistory.future).toHaveLength(0);
    store().deleteDevice(survivor.id); expect(store().topologyHistory.past).toHaveLength(50); expect(store().topologyHistory.past.at(-1)?.type).toBe('delete-devices');
    const next = add('host'); store().setIfaceIp(next.id, 'eth0', '192.0.2.1/24');
    expect(store().topologyHistory.past.at(-1)?.type).toBe('set-interface-ipv4');
    input(open(next as IpDevice), 'sysctl -w net.ipv4.ip_forward=1\r'); expect(store().topologyHistory.past).toEqual([]);
    add('host'); expect(store().importJson('{')).not.toBeNull(); expect(store().topologyHistory.past).toHaveLength(1);
    store().flushAutosave(); store().boot();
    expect(store().topologyHistory).toEqual({ past: [], future: [] }); expect(store().terminals).toEqual([]);
  });

  it('cancels DHCP on deletion and Undo without letting old callbacks affect the same-ID replacement', () => {
    const device = add('host') as IpDevice, session = open(device), net = sim.net;
    input(session, 'dhclient eth0\r');
    expect(device.dhcpListeners.size).toBe(1); expect(net.scheduler.pending).toBeGreaterThan(0);
    store().deleteDevice(device.id); store().undoTopology();
    const restored = net.devices.get(device.id) as IpDevice;
    expect(restored).not.toBe(device); expect(store().terminals).toEqual([]);
    expect(device.dhcpListeners.size).toBe(0); expect(net.scheduler.pending).toBe(0);
    const text = output(session); net.scheduler.advanceTo(60_000);
    expect(output(session)).toBe(text); expect(restored.interfaces[0].ip).toBeNull();
    expect(session.term.dispose).toHaveBeenCalledOnce();
    expect(store().topologyHistory.future).toHaveLength(1);
  });

  it('captures a React Flow delete before edge/node callbacks and ignores duplicate removal notifications', () => {
    const a = add('switch'), b = add('host'); connect(a.id, b.id);
    const link = captureLink([...sim.net.links.values()][0]), count = store().topologyHistory.past.length;
    store().deleteTopologyElements([b.id], [link.id]); // onBeforeDelete owns the transaction.
    store().onEdgesChange([{ type: 'remove', id: link.id }]);
    store().onNodesChange([{ type: 'remove', id: b.id }]);
    expect(store().topologyHistory.past).toHaveLength(count + 1);
    store().undoTopology(); expect(sim.net.devices.has(b.id)).toBe(true);
    expect(sim.net.devices.get(a.id)).toBe(a); expect(captureLink(sim.net.links.get(link.id)!)).toEqual(link);
  });
});

describe('device deletion history', () => {
  const store = () => useStore.getState();
  function add(kind: 'host' | 'switch' | 'router' | 'firewall', x = 100) {
    store().addDeviceAt(kind, { x, y: 80 });
    return sim.net.devices.get(store().nodes.at(-1)!.id)!;
  }

  it.each(['host', 'switch', 'router', 'firewall'] as const)('restores existing %s configuration, MACs, position, colors and exact incident cables', (kind) => {
    const device = add(kind), survivor = add('switch', 350), net = sim.net;
    const iface = device.interfaces.at(-1)!;
    const link = net.connect(device.id, survivor.id, { aIface: iface.name, bIface: 'eth6' }); link.latency = 147;
    device.name = `custom-${kind}`; iface.up = false;
    if (device instanceof IpDevice) {
      iface.ip = parseCidr('192.0.2.1/24'); device.nameserver = parseIp('192.0.2.53');
      device.staticRoutes.push({ dest: parseIp('203.0.113.0')!, prefix: 24, via: parseIp('192.0.2.254'), ifaceName: iface.name, kind: 'static' });
      device.services.tcp.add(443); device.httpServer = { enabled: true, port: 8080, body: 'Hello Unicode 🌐' };
      if (kind === 'firewall') new Shell(device).exec('iptables -A FORWARD -p tcp --dport 23 -j DROP', { write: () => {} }, () => {});
      if (kind === 'router') device.enableRip(true);
      store().setTerminalColor(device.id, '#123456');
    } else if (device instanceof SwitchDevice) device.vlans.set(iface.name, 12);
    store().refresh(); store().invalidateTopologyHistory();
    const expected = captureCreation(net, device, { x: 100, y: 80 }, 0), cable = captureLink(link);
    store().deleteDevice(device.id);
    expect(device.disposed).toBe(true); expect(store().topologyHistory.past).toHaveLength(1);
    store().undoTopology();
    const restored = net.devices.get(device.id)!;
    expect(restored).not.toBe(device); expect(captureCreation(net, restored, { x: 100, y: 80 }, 0)).toEqual(expected);
    expect(store().nodes[0].position).toEqual({ x: 100, y: 80 }); expect(store().nodes[0].data.label).toBe(device.name);
    expect(captureLink(net.links.get(link.id)!)).toEqual(cable);
    expect(net.devices.get(survivor.id)).toBe(survivor); expect(sim.net).toBe(net);
    if (device instanceof IpDevice) expect(store().terminalColors[device.id]).toBe('#123456');
    store().redoTopology(); expect(restored.disposed).toBe(true); expect(net.devices.has(device.id)).toBe(false);
    store().undoTopology(); expect(captureCreation(net, net.devices.get(device.id)!, { x: 100, y: 80 }, 0)).toEqual(expected);
    expect(net.links.size).toBe(1); expect(store().terminals).toEqual([]);
  });

  it('deletes multiple devices and shared cables once, including separately selected survivor cables', () => {
    const a = add('host'), sw = add('switch'), r = add('router'), other = add('host'), net = sim.net;
    const links = [net.connect(a.id, sw.id), net.connect(sw.id, r.id), net.connect(r.id, other.id)].map(captureLink);
    const order = store().nodes.map((n) => n.id); store().invalidateTopologyHistory();
    store().deleteTopologyElements([a.id, sw.id, a.id], [links[2].id, links[0].id]);
    const operation = store().topologyHistory.past[0]; expect(operation.type).toBe('delete-devices');
    if (operation.type !== 'delete-devices') throw new Error('wrong operation');
    expect(operation.devices).toHaveLength(2); expect(operation.links).toHaveLength(3); expect(net.links.size).toBe(0);
    store().undoTopology();
    expect(store().nodes.map((n) => n.id)).toEqual(order);
    expect([...net.links.values()].map(captureLink)).toEqual(links);
    expect(net.devices.get(r.id)).toBe(r); expect(net.devices.get(other.id)).toBe(other);
    store().redoTopology(); store().undoTopology(); expect(net.links.size).toBe(3);
    expect(store().edges.map((e) => e.id)).toEqual(links.map((l) => l.id));
    store().onNodesChange([{ type: 'position', id: a.id, position: { x: 70, y: 80 }, dragging: false }]);
    expect(store().topologyHistory.future).toEqual([]);
  });

  it('replays creation, movement, connection and multi-device deletion in the same sequence', () => {
    const a = add('host'), sw = add('switch'), net = sim.net;
    store().onConnect({ source: a.id, target: sw.id, sourceHandle: null, targetHandle: null });
    const cable = captureLink([...net.links.values()][0]);
    store().onNodesChange([a.id, sw.id].map((id) => ({ type: 'position', id, position: { x: 250, y: 80 }, dragging: false })));
    store().deleteTopologyElements([a.id, sw.id]);
    expect(store().topologyHistory.past.map((o) => o.type)).toEqual(['create-device', 'create-device', 'add-links', 'move-nodes', 'delete-devices']);
    for (let cycle = 0; cycle < 3; cycle++) {
      store().undoTopology(); expect(captureLink(net.links.get(cable.id)!)).toEqual(cable);
      expect(store().nodes.map((n) => n.position.x)).toEqual([250, 250]);
      for (let i = 0; i < 4; i++) store().undoTopology();
      expect(net.devices.size).toBe(0); expect(net.links.size).toBe(0);
      for (let i = 0; i < 5; i++) store().redoTopology();
      expect(net.devices.size).toBe(0); expect(net.links.size).toBe(0); expect(sim.net).toBe(net);
    }
  });

  it('disposes removed sessions, RIP and async commands while preserving other pings, input and sessions', () => {
    const { a, b, net } = pair(), first = open(a), second = open(b);
    const router = add('router') as IpDevice, dhcp = add('host') as IpDevice;
    router.interfaces[0].ip = parseCidr('192.0.2.1/24'); router.enableRip(true);
    const ping = open(router), client = open(dhcp);
    input(first, 'Unicode 🌐'); input(second, 'ping 10.0.0.1\r'); input(ping, 'ping 192.0.2.1\r'); input(client, 'dhclient eth0\r');
    net.scheduler.advanceTo(500); store().invalidateTopologyHistory(); store().setActiveTerminal(a.id); store().noteTerminalFocus(a.id);
    const stale = vi.fn(), event = router.schedule(1000, stale), cancel = vi.spyOn(b, 'offIcmp');
    store().deleteTopologyElements([router.id, dhcp.id]);
    const ended = [output(ping), output(client)];
    store().undoTopology(); event.fn(); net.scheduler.advanceTo(10_500);
    expect(stale).not.toHaveBeenCalled(); expect(output(ping)).toBe(ended[0]); expect(output(client)).toBe(ended[1]);
    expect(ping.term.dispose).toHaveBeenCalledOnce(); expect(client.term.dispose).toHaveBeenCalledOnce();
    expect(router.disposed).toBe(true); expect(router.ripEnabled).toBe(false); expect(dhcp.dhcpListeners.size).toBe(0);
    expect((net.devices.get(router.id) as IpDevice).ripEnabled).toBe(true);
    expect(store().terminals).toEqual([a.id, b.id]); expect(store().activeTerminal).toBe(a.id); expect(store().terminalHasFocus).toBe(true);
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second); expect(cancel).not.toHaveBeenCalled();
    expect(output(second)).toContain('icmp_seq=10'); expect(first.term.dispose).not.toHaveBeenCalled();
    const exec = vi.spyOn(Shell.prototype, 'exec'); input(first, '\r'); expect(exec.mock.calls.at(-1)?.[0]).toBe('Unicode 🌐');
    store().redoTopology(); net.scheduler.advanceTo(20_500); expect(output(second)).toContain('icmp_seq=20');
  });

  it('autosaves deletion and restoration and boots with exact MACs, ports and latency but no sessions/history', () => {
    const { a, b, net } = pair(), session = open(a), link = [...net.links.values()][0]; link.latency = 211;
    const macs = a.interfaces.map((i) => i.mac), cable = captureLink(link);
    store().deleteDevice(a.id); vi.advanceTimersByTime(500);
    expect(JSON.parse(storage.get('netsim:autosave:v1')!).devices.map((d: { id: string }) => d.id)).toEqual([b.id]);
    store().undoTopology(); vi.advanceTimersByTime(500);
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.links).toEqual([cable]); expect(saved.devices.find((d: { id: string }) => d.id === a.id).ifaces.map((i: { mac: string }) => i.mac)).toEqual(macs);
    store().boot(); expect(sim.net.devices.get(a.id)?.interfaces.map((i) => i.mac)).toEqual(macs);
    expect(captureLink(sim.net.links.get(link.id)!)).toEqual(cable);
    expect(store().terminals).toEqual([]); expect(store().topologyHistory).toEqual({ past: [], future: [] });
    expect(session.term.dispose).toHaveBeenCalledOnce();
  });

  it('ignores old asynchronous lab results after deletion and same-ID restoration', () => {
    const { a, b, net } = pair();
    useStore.setState({ lab: { id: 'deletion-check', title: 'Check', blurb: '', steps: [{ title: 'Step', body: '', objectives: [
      { id: 'ping', label: 'Ping', check: { type: 'ping', from: a.name, toDevice: b.name, expect: 'success' } },
      { id: 'next', label: 'Address', check: { type: 'iface-ip', device: b.name, iface: 'eth0' } },
    ] }] } });
    store().checkStep(); expect(store().labChecking).toBe(true);
    store().deleteDevice(a.id); store().undoTopology(); net.scheduler.advanceTo(5000);
    expect(store().labChecking).toBe(false); expect(store().labResults).toEqual({});
    store().checkStep(); net.scheduler.advanceTo(10_000);
    expect(store().labResults.ping.pass).toBe(true); expect(store().labResults.next.pass).toBe(true);
  });
});

describe('basic Inspector history', () => {
  const store = () => useStore.getState();
  const setup = () => { const result = pair(); store().invalidateTopologyHistory(); return result; };

  it('renames, undoes and redoes without replacing devices or sessions and updates node labels', () => {
    const { a, b, net } = setup(), session = open(a), before = a.name;
    store().renameDevice(a.id, '  PC-Lab  ');
    expect(store().topologyHistory.past.at(-1)?.type).toBe('rename-device'); expect(a.name).toBe('PC-Lab');
    expect(store().nodes.find((n) => n.id === a.id)?.data.label).toBe('PC-Lab');
    store().undoTopology(); expect(a.name).toBe(before);
    store().redoTopology(); expect(a.name).toBe('PC-Lab');
    expect(net.devices.get(a.id)).toBe(a); expect(net.devices.get(b.id)).toBe(b); expect(sim.net).toBe(net);
    expect(getSession(a)).toBe(session); expect(session.term.dispose).not.toHaveBeenCalled();
  });

  it('copies IPv4 values, changes prefixes, removes addresses and restores successive edits', () => {
    const { a } = setup(), iface = a.interfaces[0], initial = iface.ip!;
    store().setIfaceIp(a.id, 'eth0', '192.0.2.20/25');
    initial.addr = 0; // The history must not retain the previous mutable object.
    expect(store().nodes.find((n) => n.id === a.id)?.data.ips).toEqual(['192.0.2.20/25']);
    store().setIfaceIp(a.id, 'eth0', '192.0.2.20/26'); store().setIfaceIp(a.id, 'eth0', '');
    expect(iface.ip).toBeNull(); store().undoTopology(); expect(iface.ip).toEqual(parseCidr('192.0.2.20/26'));
    store().undoTopology(); expect(iface.ip).toEqual(parseCidr('192.0.2.20/25'));
    store().undoTopology(); expect(iface.ip).toEqual(parseCidr('10.0.0.1/24'));
    for (let i = 0; i < 3; i++) store().redoTopology(); expect(iface.ip).toBeNull();
    expect(a.interfaces[0]).toBe(iface);
  });

  it('toggles exact interfaces on hosts and switches', () => {
    const { a } = setup(); store().addDeviceAt('switch', { x: 0, y: 0 });
    const sw = sim.net.devices.get(store().nodes.at(-1)!.id)!;
    store().invalidateTopologyHistory(); store().toggleIface(a.id, 'eth0'); store().toggleIface(sw.id, 'eth7');
    expect(a.interfaces[0].up).toBe(false); expect(sw.interfaces[7].up).toBe(false);
    store().undoTopology(); expect(sw.interfaces[7].up).toBe(true); expect(a.interfaces[0].up).toBe(false);
    store().undoTopology(); expect(a.interfaces[0].up).toBe(true);
    store().redoTopology(); store().redoTopology(); expect(sw.interfaces[7].up).toBe(false);
  });

  it('leaves Redo and autosave untouched for invalid, identical, canonical-equivalent or missing-target edits', () => {
    const { a } = setup(); store().renameDevice(a.id, 'changed'); store().undoTopology();
    vi.advanceTimersByTime(500); setItem.mockClear(); const history = store().topologyHistory;
    store().renameDevice(a.id, ''); store().renameDevice(a.id, `  ${a.name}  `); store().renameDevice('missing', 'PC');
    for (const value of ['bad', '10.0.0.1/33', '10.0.0.999/24']) expect(store().setIfaceIp(a.id, 'eth0', value)).not.toBeNull();
    expect(store().setIfaceIp(a.id, 'eth0', ' 010.000.000.001/24 ')).toBeNull();
    expect(store().setIfaceIp(a.id, 'missing', '')).not.toBeNull();
    store().toggleIface('missing', 'eth0'); store().toggleIface(a.id, 'missing');
    expect(store().topologyHistory).toBe(history); vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
    store().redoTopology(); expect(a.name).toBe('changed'); store().undoTopology();
    store().setIfaceIp(a.id, 'eth0', '10.0.0.1/25'); expect(store().topologyHistory.future).toEqual([]);
  });

  it('interleaves edits with movement, cables, creation and deletion in the same history', () => {
    const { a, b, net } = setup(), originalName = a.name, link = [...net.links.values()][0];
    store().renameDevice(a.id, 'PC-Lab'); store().setIfaceIp(a.id, 'eth0', '10.0.0.9/25');
    store().onNodesChange([{ type: 'position', id: a.id, position: { x: 77, y: 30 }, dragging: false }]);
    store().toggleIface(a.id, 'eth0'); store().onEdgesChange([{ type: 'remove', id: link.id }]);
    store().addDeviceAt('switch', { x: 300, y: 40 }); store().deleteDevice(a.id);
    expect(store().topologyHistory.past).toHaveLength(7);
    for (let i = 0; i < 7; i++) store().undoTopology();
    const restored = net.devices.get(a.id)!;
    expect(restored.name).toBe(originalName); expect(restored.interfaces[0].ip).toEqual(parseCidr('10.0.0.1/24'));
    expect(restored.interfaces[0].up).toBe(true); expect(store().nodes[0].position).toEqual({ x: 20, y: 30 });
    expect(net.links.has(link.id)).toBe(true); expect(net.devices.get(b.id)).toBe(b);
    for (let i = 0; i < 7; i++) store().redoTopology(); expect(net.devices.has(a.id)).toBe(false);
  });

  it('keeps external commands and unsupported settings as barriers, but not output or completion of older pings', () => {
    const { a, b, net } = setup(), terminal = open(a), second = open(b);
    input(second, 'ping 10.0.0.1\r'); store().renameDevice(a.id, 'PC-Lab'); net.scheduler.advanceTo(2500); input(second, '\x03');
    expect(store().topologyHistory.past).toHaveLength(1);
    input(terminal, 'hostname\r'); expect(store().topologyHistory.past).toHaveLength(1);
    input(terminal, 'ip link set eth0 down\r'); expect(store().topologyHistory.past).toEqual([]);
    store().setIfaceIp(a.id, 'eth0', '10.0.0.9/24'); input(terminal, 'ip addr del 10.0.0.9/24 dev eth0\r');
    input(terminal, 'ip addr add 10.0.0.7/24 dev eth0\r');
    expect(store().topologyHistory.past).toEqual([]);
    store().toggleIface(a.id, 'eth0'); input(terminal, 'sysctl -w net.ipv4.ip_forward=1\r'); expect(store().topologyHistory.past).toEqual([]);
    store().renameDevice(a.id, 'Another'); a.nameserver = parseIp('10.0.0.54'); store().undoTopology();
    expect(a.name).toBe('Another'); expect(store().topologyHistory.past).toEqual([]);
  });

  it('keeps four running pings and sessions through basic edits, Undo/Redo and normal refreshes', () => {
    const { a, b, net } = setup();
    for (const kind of ['router', 'firewall'] as const) store().addDeviceAt(kind, { x: 0, y: 0 });
    const extra = [...net.devices.values()].slice(2) as IpDevice[];
    extra.forEach((d, i) => { d.interfaces[0].ip = parseCidr(`192.0.2.${i + 1}/24`); });
    store().invalidateTopologyHistory(); const devices = [a, b, ...extra], sessions = devices.map(open);
    sessions.forEach((session, i) => input(session, `ping ${i === 0 ? '10.0.0.2' : i === 1 ? '10.0.0.1' : `192.0.2.${i - 1}`}\r`));
    net.scheduler.advanceTo(1000);
    store().renameDevice(b.id, 'Server-Lab'); store().setIfaceIp(a.id, 'eth0', '10.0.0.1/25'); store().toggleIface(extra[0].id, 'eth3');
    for (let i = 0; i < 3; i++) store().undoTopology(); for (let i = 0; i < 3; i++) store().redoTopology();
    net.scheduler.advanceTo(8500); store().tick(10); store().refresh();
    expect(store().topologyHistory.past).toHaveLength(3);
    sessions.forEach((session, i) => {
      expect(getSession(devices[i])).toBe(session); expect(session.term.dispose).not.toHaveBeenCalled();
      expect(output(session)).toContain('icmp_seq=8');
    });
    expect(sim.net).toBe(net);
  });

  it('limits basic edits to 50 operations and autosaves restored values without persisting history or sessions', () => {
    const { a } = setup(); for (let i = 0; i < 55; i++) store().renameDevice(a.id, `PC-${i}`);
    expect(store().topologyHistory.past).toHaveLength(50);
    store().setIfaceIp(a.id, 'eth0', '192.0.2.1/25'); store().toggleIface(a.id, 'eth0'); store().undoTopology();
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!), device = saved.devices.find((d: { id: string }) => d.id === a.id);
    expect(device.name).toBe('PC-54'); expect(device.ifaces[0].ip).toBe('192.0.2.1/25'); expect(device.ifaces[0].up).toBe(true);
    store().boot(); expect(store().topologyHistory).toEqual({ past: [], future: [] }); expect(store().terminals).toEqual([]);
    const reloaded = sim.net.devices.get(a.id)!; expect(reloaded.name).toBe('PC-54'); expect(reloaded.interfaces[0].ip).toEqual(parseCidr('192.0.2.1/25'));
  });
});

describe('additional Inspector history', () => {
  const store = () => useStore.getState();
  function setup() {
    const result = pair();
    store().addDeviceAt('ap', { x: 400, y: 60 });
    const ap = sim.net.devices.get(store().nodes.at(-1)!.id) as ApDevice;
    store().invalidateTopologyHistory(); return { ...result, ap };
  }

  it('does not invalidate history when the same service ports have a different insertion order', () => {
    const { a } = setup(); a.services.tcp = new Set([443, 22]);
    store().setNameserver(a.id, '192.0.2.53');
    a.services.tcp = new Set([22, 443]);
    store().undoTopology(); expect(a.nameserver).toBeNull(); expect(store().topologyHistory.future).toHaveLength(1);
    store().redoTopology(); expect(a.nameserver).toBe(parseIp('192.0.2.53'));
  });

  it('sets and removes nameservers, orders TCP/UDP ports and restores empty sets with independent snapshots', () => {
    const { a } = setup(), old = a.services.tcp;
    store().setNameserver(a.id, '192.0.2.53'); store().setNameserver(a.id, '');
    store().setServices(a.id, 'tcp', '443, 22, 443'); store().setServices(a.id, 'udp', '161, 53');
    old.add(9000);
    expect([...a.services.tcp]).toEqual([22, 443]); expect([...a.services.udp]).toEqual([53, 161]);
    const operation = store().topologyHistory.past[2];
    expect(operation.type).toBe('set-services');
    store().undoTopology(); expect(a.services.udp.size).toBe(0);
    store().undoTopology(); expect(a.services.tcp.size).toBe(0);
    store().undoTopology(); expect(a.nameserver).toBe(parseIp('192.0.2.53'));
    store().undoTopology(); expect(a.nameserver).toBeNull();
    for (let i = 0; i < 4; i++) store().redoTopology();
    expect([...a.services.tcp]).toEqual([22, 443]); expect(a.nameserver).toBeNull();
    store().setServices(a.id, 'tcp', ''); store().undoTopology(); expect([...a.services.tcp]).toEqual([22, 443]);
  });

  it('preserves Redo, MAC learning and autosave on invalid or equivalent inputs for all new fields', () => {
    const { a, ap } = setup();
    store().setNameserver(a.id, '192.0.2.53'); store().setServices(a.id, 'tcp', '80,22'); store().setPortVlan(ap.id, 'eth0', '20');
    store().setSsid(ap.id, 'Changed'); store().undoTopology(); vi.advanceTimersByTime(500); setItem.mockClear();
    const history = store().topologyHistory;
    expect(store().setNameserver(a.id, ' 192.000.002.053 ')).toBeNull();
    expect(store().setServices(a.id, 'tcp', '22, 80,22')).toBeNull();
    expect(store().setSsid(ap.id, ' netsim-wifi ')).toBeNull();
    const key = '20|sample'; ap.macTable.set(key, ap.interfaces[0]);
    expect(store().setPortVlan(ap.id, 'eth0', '020')).toBeNull(); expect(ap.macTable.has(key)).toBe(true);
    for (const text of ['bad', '256.0.0.1']) expect(store().setNameserver(a.id, text)).not.toBeNull();
    for (const text of ['0', '65536', '80,wrong']) expect(store().setServices(a.id, 'udp', text)).not.toBeNull();
    expect(store().setSsid(ap.id, ' ')).not.toBeNull(); expect(store().setSsid(a.id, 'Lab')).not.toBeNull();
    for (const text of ['', '0', '4095', '1.5']) expect(store().setPortVlan(ap.id, 'eth0', text)).not.toBeNull();
    expect(store().setPortVlan(ap.id, 'missing', '20')).not.toBeNull(); expect(store().setNameserver(ap.id, '1.1.1.1')).not.toBeNull();
    expect(store().topologyHistory).toBe(history); vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
    store().redoTopology(); expect(ap.ssid).toBe('Changed');
  });

  it('relearns the changed VLAN port, keeps unrelated MAC entries and resumes continuous pings after Undo', () => {
    const { a, b, ap, net } = setup();
    store().onEdgesChange([{ type: 'remove', id: store().edges[0].id }]);
    for (const d of [a, b]) store().onConnect({ source: d.id, target: ap.id, sourceHandle: null, targetHandle: null });
    store().invalidateTopologyHistory(); const first = open(a), second = open(b);
    input(first, 'ping 10.0.0.2\r'); input(second, 'ping 10.0.0.1\r'); net.scheduler.advanceTo(1000);
    const changed = ap.interfaces[1], other = ap.interfaces[0];
    expect([...ap.macTable.values()]).toContain(changed); expect([...ap.macTable.values()]).toContain(other);
    store().setPortVlan(ap.id, changed.name, '20');
    expect([...ap.macTable.values()]).not.toContain(changed); expect([...ap.macTable.values()]).toContain(other);
    net.scheduler.advanceTo(4300); expect(output(first)).toContain('no answer yet');
    expect([...ap.macTable.keys()]).toContain(`20|${b.interfaces[0].mac}`);
    store().undoTopology(); expect(ap.vlanOf(changed.name)).toBe(1); expect(ap.vlans.has(changed.name)).toBe(false);
    expect(ap.macTable.has(`20|${b.interfaces[0].mac}`)).toBe(false);
    net.scheduler.advanceTo(8500); expect(output(first)).toContain('icmp_seq=8'); expect(output(second)).toContain('icmp_seq=8');
    store().redoTopology(); expect(ap.vlanOf(changed.name)).toBe(20);
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second); expect(first.term.dispose).not.toHaveBeenCalled();
  });

  it('interleaves all four settings with basic edits, movement and cables, and persists them on boot', () => {
    const { a, ap, net } = setup(), original = a.name, session = open(a), cable = store().edges[0].id;
    store().renameDevice(a.id, 'PC-Lab'); store().setNameserver(a.id, '192.0.2.53'); store().setServices(a.id, 'udp', '53,161');
    store().setSsid(ap.id, 'NetLab 🌐'); store().setPortVlan(ap.id, 'eth7', '20');
    store().onNodesChange([{ type: 'position', id: a.id, position: { x: 90, y: 30 }, dragging: false }]);
    store().onEdgesChange([{ type: 'remove', id: cable }]);
    for (let i = 0; i < 7; i++) store().undoTopology();
    expect(a.name).toBe(original); expect(a.nameserver).toBeNull(); expect(a.services.udp.size).toBe(0);
    expect(ap.ssid).toBe('netsim-wifi'); expect(ap.vlanOf('eth7')).toBe(1); expect(net.links.has(cable)).toBe(true);
    for (let i = 0; i < 7; i++) store().redoTopology();
    expect(sim.net).toBe(net); expect(getSession(a)).toBe(session);
    vi.advanceTimersByTime(500); store().boot();
    const restored = sim.net.devices.get(a.id) as IpDevice, restoredAp = sim.net.devices.get(ap.id) as ApDevice;
    expect(restored.name).toBe('PC-Lab'); expect(restored.nameserver).toBe(parseIp('192.0.2.53'));
    expect([...restored.services.udp]).toEqual([53, 161]); expect(restoredAp.ssid).toBe('NetLab 🌐'); expect(restoredAp.vlanOf('eth7')).toBe(20);
    expect(store().terminals).toEqual([]); expect(store().topologyHistory).toEqual({ past: [], future: [] });
  });

  it('keeps unsupported changes and terminal configuration as barriers, but not live nc listeners or ping output', () => {
    const { a, b, ap, net } = setup(), first = open(a), second = open(b);
    input(second, 'ping 10.0.0.1\r'); store().setNameserver(a.id, '192.0.2.53'); store().setSsid(ap.id, 'Lab');
    input(first, 'nc -l 9000\r'); net.scheduler.advanceTo(2200); input(first, '\x03'); input(second, '\x03');
    expect(store().topologyHistory.past).toHaveLength(2);
    input(first, 'ip link set eth0 down\r'); expect(store().topologyHistory.past).toEqual([]);
    store().setServices(a.id, 'tcp', '22'); input(first, 'sysctl -w net.ipv4.ip_forward=1\r'); expect(store().topologyHistory.past).toEqual([]);
    store().setSsid(ap.id, 'New'); a.services.udp.add(5000); store().undoTopology();
    expect(ap.ssid).toBe('New'); expect(store().topologyHistory.past).toEqual([]);
  });
});

describe('Inspector server configuration history', () => {
  const store = () => useStore.getState();
  function setup() { const result = pair(); store().invalidateTopologyHistory(); return result; }

  it.each(['dhcpServer', 'dnsServer', 'httpServer'] as const)('restores absent %s configurations and toggles existing ones without resetting dynamic state', (server) => {
    const { b, net } = setup();
    const toggle = () => server === 'dhcpServer' ? store().toggleDhcpServer(b.id) : server === 'dnsServer' ? store().toggleDnsServer(b.id) : store().toggleHttpServer(b.id);
    expect(b[server]).toBeNull(); toggle();
    const initial = serializeNetwork(net, {}).devices.find((d) => d.id === b.id)![server];
    const entry = JSON.stringify(store().topologyHistory.past[0]); expect(entry).not.toContain('leases');
    if (server === 'dhcpServer') b.dhcpServer!.leases.set('client', parseIp('10.0.0.100')!);
    store().undoTopology(); expect(b[server]).toBeNull(); store().redoTopology();
    expect(serializeNetwork(net, {}).devices.find((d) => d.id === b.id)![server]).toEqual(initial);
    const config = b[server], leases = b.dhcpServer?.leases;
    if (leases) leases.set('new-client', parseIp('10.0.0.101')!);
    toggle(); expect(b[server]?.enabled).toBe(false); store().undoTopology(); expect(b[server]?.enabled).toBe(true);
    expect(b[server]).toBe(config); expect(b.dhcpServer?.leases).toBe(leases);
    if (leases) expect(leases.size).toBe(1);
    store().redoTopology(); expect(b[server]?.enabled).toBe(false); expect(sim.net).toBe(net); expect(net.devices.get(b.id)).toBe(b);
  });

  it('restores each DHCP field without reverting leases, including nullable router and DNS', () => {
    const { b } = setup(); store().toggleDhcpServer(b.id); store().invalidateTopologyHistory();
    const initial = dhcpSettings(b), config = b.dhcpServer!, leases = config.leases;
    store().setDhcpField(b.id, 'rangeStart', '10.0.0.110'); store().setDhcpField(b.id, 'rangeEnd', '10.0.0.180');
    store().setDhcpField(b.id, 'router', ''); store().setDhcpField(b.id, 'dns', '10.0.0.53');
    leases.set('later-client', parseIp('10.0.0.120')!);
    expect(store().topologyHistory.past).toHaveLength(4);
    for (let i = 0; i < 4; i++) store().undoTopology(); expect(dhcpSettings(b)).toEqual(initial);
    expect(config.leases).toBe(leases); expect(leases.get('later-client')).toBe(parseIp('10.0.0.120')); expect(b.dhcpServer).toBe(config);
    for (let i = 0; i < 4; i++) store().redoTopology();
    expect(config.rangeStart).toBe(parseIp('10.0.0.110')); expect(config.rangeEnd).toBe(parseIp('10.0.0.180'));
    expect(config.router).toBeNull(); expect(config.dns).toBe(parseIp('10.0.0.53'));
  });

  it('normalizes DNS records, copies maps and preserves Redo for equivalent text or invalid input', () => {
    const { b } = setup(); store().toggleDnsServer(b.id); store().setDnsRecords(b.id, '10.0.0.1 old.lan');
    const oldMap = b.dnsServer!.records; store().setDnsRecords(b.id, '10.0.0.2 WEB.LAN\n10.0.0.1 a.lan');
    oldMap.set('ghost', 1); store().undoTopology();
    expect(sortedDnsRecords(b.dnsServer!.records)).toEqual([['old.lan', parseIp('10.0.0.1')]]);
    vi.advanceTimersByTime(500); setItem.mockClear(); const history = store().topologyHistory;
    expect(store().setDnsRecords(b.id, '# comment\n 010.000.000.001   OLD.LAN\n10.0.0.1 old.lan\n')).toBeNull();
    expect(store().setDnsRecords(b.id, 'invalid name')).not.toBeNull(); expect(store().topologyHistory).toBe(history);
    vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
    store().redoTopology(); expect(sortedDnsRecords(b.dnsServer!.records)).toEqual([['a.lan', parseIp('10.0.0.1')], ['web.lan', parseIp('10.0.0.2')]]);
    store().setDnsRecords(b.id, '# empty'); expect(b.dnsServer!.records.size).toBe(0); store().undoTopology(); expect(b.dnsServer!.records.size).toBe(2);
    b.dnsServer!.records = new Map([...b.dnsServer!.records].reverse()); store().undoTopology();
    expect(b.dnsServer!.records.has('old.lan')).toBe(true);
  });

  it('confirms multiline HTTP bodies and ports independently, without creating history for no-ops or invalid values', () => {
    const { b } = setup(); store().toggleHttpServer(b.id); const config = b.httpServer!, originalBody = config.body;
    const body = '<h1>Olá 🌐</h1>\n  exact whitespace\n';
    store().setHttpBody(b.id, body); store().setHttpPort(b.id, '8080');
    expect(store().topologyHistory.past).toHaveLength(3);
    store().undoTopology(); vi.advanceTimersByTime(500); setItem.mockClear(); const history = store().topologyHistory;
    store().setHttpBody(b.id, body); expect(store().setHttpPort(b.id, '080')).toBeNull();
    for (const text of ['', '0', '65536', 'wrong']) expect(store().setHttpPort(b.id, text)).not.toBeNull();
    expect(store().topologyHistory).toBe(history); vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
    store().undoTopology(); expect(config.body).toBe(originalBody); expect(b.httpServer).toBe(config);
    store().redoTopology(); store().redoTopology(); expect(config.body).toBe(body); expect(config.port).toBe(8080);
    store().setHttpBody(b.id, ''); store().undoTopology(); expect(config.body).toBe(body);
  });

  it('does not save invalid or identical DHCP fields and preserves the current Redo branch', () => {
    const { a, b } = setup(); store().toggleDhcpServer(b.id); store().setDhcpField(b.id, 'dns', '10.0.0.53'); store().undoTopology();
    vi.advanceTimersByTime(500); setItem.mockClear(); const history = store().topologyHistory;
    expect(store().setDhcpField(b.id, 'dns', ' ')).toBeNull();
    expect(store().setDhcpField(b.id, 'rangeStart', '010.000.000.100')).toBeNull();
    for (const field of ['rangeStart', 'rangeEnd', 'router', 'dns'] as const) expect(store().setDhcpField(b.id, field, 'bad')).not.toBeNull();
    expect(store().setDhcpField(b.id, 'rangeStart', '')).not.toBeNull(); expect(store().setDhcpField(a.id, 'dns', '')).not.toBeNull();
    expect(store().setDnsRecords(a.id, '')).not.toBeNull(); expect(store().setHttpPort(a.id, '80')).not.toBeNull();
    store().setHttpBody(a.id, 'no configuration'); expect(store().topologyHistory).toBe(history);
    vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
  });

  it('preserves sessions and pings, and applies pending HTTP traffic once against the restored live configuration', () => {
    const { a, b, net } = setup(), first = open(a), second = open(b);
    input(first, 'ping 10.0.0.2\r'); input(second, 'ping 10.0.0.1\r'); net.scheduler.advanceTo(1000);
    store().toggleHttpServer(b.id); store().setHttpBody(b.id, 'Original response'); store().toggleDnsServer(b.id); store().toggleDhcpServer(b.id);
    const responses: string[] = [], done = vi.fn();
    new Shell(a).exec('curl http://10.0.0.2/', { write: (text) => responses.push(text) }, done);
    const pending = net.scheduler.pending, clock = net.now;
    store().setHttpBody(b.id, 'Temporary response'); store().undoTopology();
    expect(net.scheduler.pending).toBe(pending); expect(net.now).toBe(clock);
    net.scheduler.advanceTo(8500);
    expect(responses.join('')).toContain('Original response'); expect(responses.join('')).not.toContain('Temporary response'); expect(done).toHaveBeenCalledOnce();
    expect(output(first)).toContain('icmp_seq=8'); expect(output(second)).toContain('icmp_seq=8');
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second); expect(first.term.dispose).not.toHaveBeenCalled();
  });

  it('interleaves server fields with structural operations and persists configurations without restoring leases or sessions', () => {
    const { a, b, net } = setup();
    store().toggleDhcpServer(b.id); store().setDhcpField(b.id, 'dns', '10.0.0.53');
    store().toggleDnsServer(b.id); store().setDnsRecords(b.id, '10.0.0.2 web.lan');
    store().toggleHttpServer(b.id); store().setHttpBody(b.id, 'Saved body');
    store().onNodesChange([{ type: 'position', id: b.id, position: { x: 260, y: 30 }, dragging: false }]);
    store().deleteDevice(b.id);
    for (let i = 0; i < 8; i++) store().undoTopology();
    const restored = net.devices.get(b.id) as IpDevice;
    expect(restored.dhcpServer).toBeNull(); expect(restored.dnsServer).toBeNull(); expect(restored.httpServer).toBeNull();
    expect(net.devices.get(a.id)).toBe(a); expect(sim.net).toBe(net);
    for (let i = 0; i < 8; i++) store().redoTopology(); store().undoTopology();
    (net.devices.get(b.id) as IpDevice).dhcpServer!.leases.set('runtime', parseIp('10.0.0.100')!);
    vi.advanceTimersByTime(500); store().boot();
    const loaded = sim.net.devices.get(b.id) as IpDevice;
    expect(loaded.dhcpServer!.dns).toBe(parseIp('10.0.0.53')); expect(loaded.dhcpServer!.leases.size).toBe(0);
    expect(loaded.dnsServer!.records.get('web.lan')).toBe(parseIp('10.0.0.2')); expect(loaded.httpServer!.body).toBe('Saved body');
    expect(store().terminals).toEqual([]); expect(store().topologyHistory).toEqual({ past: [], future: [] });
  });

  it('invalidates server history on incompatible external configuration and terminal commands', () => {
    const { a, b } = setup(), terminal = open(a);
    store().toggleDnsServer(b.id); b.httpServer = { enabled: true, port: 80, body: 'external' }; store().undoTopology();
    expect(b.dnsServer).not.toBeNull(); expect(store().topologyHistory.past).toEqual([]);
    store().setDnsRecords(b.id, '10.0.0.2 web.lan'); input(terminal, 'ip link set eth0 down\r'); expect(store().topologyHistory.past).toEqual([]);
    store().toggleDhcpServer(b.id); input(terminal, 'sysctl -w net.ipv4.ip_forward=1\r'); expect(store().topologyHistory.past).toEqual([]);
  });
});

describe('independent packet animation', () => {
  const store = () => useStore.getState();

  it('uses the engine predecessor in the store while preserving concurrent sessions, capture and topology resets', () => {
    const { a, b, net } = pair(), first = open(a), second = open(b);
    store().onEdgesChange([{ type: 'remove', id: store().edges[0].id }]);
    store().addDeviceAt('switch', { x: 100, y: 100 });
    const relay = store().nodes.find((n) => n.data.kind === 'switch')!;
    store().onConnect({ source: a.id, target: relay.id, sourceHandle: null, targetHandle: null });
    store().onConnect({ source: b.id, target: relay.id, sourceHandle: null, targetHandle: null });
    store().setPacketAnimationSpeed(1); store().startPacketCapture();
    input(first, 'ping 10.0.0.2\r'); input(second, 'ping 10.0.0.1\r');
    net.scheduler.advanceTo(800); vi.advanceTimersByTime(100);
    const records = store().packetCapture.records;
    const requests = records.filter((r) => r.frame.payload.kind === 'ipv4' && r.frame.payload.l4.kind === 'icmp' && r.frame.payload.l4.msg.type === 'echo-request');
    expect(requests).toHaveLength(4);
    for (const source of [a.id, b.id]) {
      const start = requests.find((r) => r.fromDeviceId === source)!;
      const parent = store().packets.find((p) => p.id === start.id)!;
      const child = store().packets.find((p) => p.parentTransferId === parent.id)!;
      expect(child.visualStart).toBe(parent.visualStart + parent.visualDuration);
      expect(child.fromDeviceId).toBe(relay.id);
    }
    expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second);
    expect(first.term.dispose).not.toHaveBeenCalled(); expect(second.term.dispose).not.toHaveBeenCalled();
    const oldCallback = net.onWireTransfer!, oldPacket = store().packets[0];
    store().newTopology();
    oldCallback(oldPacket, { frame: records[0].frame, fromInterface: 'eth0', toInterface: 'eth0', fromDeviceName: a.name, toDeviceName: b.name });
    expect(store().packets).toEqual([]);
  });

  it.each([0.5, 1, 4])('keeps ping and captured 80 ms link timing unchanged at %s× visual speed', (speed) => {
    const { a, net } = pair(), session = open(a);
    store().setPaused(false); store().setSpeed(1); store().setPacketAnimationSpeed(speed);
    const history = store().topologyHistory; store().startPacketCapture();
    input(session, 'ping -c 1 10.0.0.2\r');
    for (let i = 0; i < 16; i++) store().tick(20);
    expect(net.now).toBe(320); expect([...net.links.values()][0].latency).toBe(80);
    expect(output(session)).toContain('time=320.0 ms'); expect(getSession(a)).toBe(session);
    vi.advanceTimersByTime(100);
    expect(store().packetCapture.records.map((r) => [r.start, r.end])).toEqual([[0, 80], [80, 160], [160, 240], [240, 320]]);
    for (const captured of store().packetCapture.records) expect(captured).not.toHaveProperty('visualDuration');
    expect(store().packets.length).toBeGreaterThan(0);
    expect(store().packets.every((p) => p.visualDuration === packetAnimationDuration(speed))).toBe(true);
    expect(store().topologyHistory).toBe(history);
    expect(setItem.mock.calls.filter(([key]) => key === 'netsim:autosave:v1')).toHaveLength(0);
  });

  it('freezes on pause, keeps position during changes, ignores simulation speed and expires a bounded queue after background gaps', () => {
    const { a, b, net } = pair(); store().setPaused(false); store().setSpeed(1); store().setPacketAnimationSpeed(1);
    a.sendEcho(parseIp('10.0.0.2')!, 1, 1); net.onFwDrop!(a.id); store().tick(100);
    const packet = store().packets[0], visualClock = store().packetAnimationClock, clock = net.now;
    const progress = packetAnimationProgress(packet, visualClock), flashes = store().dropFlashes;
    store().setPaused(true); store().tick(60000);
    expect(net.now).toBe(clock); expect(store().packetAnimationClock).toBe(visualClock);
    store().setPacketAnimationSpeed(0.5);
    expect(packetAnimationProgress(store().packets[0], visualClock)).toBeCloseTo(progress!);
    expect(store().dropFlashes).toBe(flashes); expect(flashes[0].until - flashes[0].start).toBe(700);
    store().setPaused(false); store().setSpeed(4); store().tick(100);
    expect(net.now - clock).toBe(400); expect(store().packetAnimationClock - visualClock).toBe(100);
    const timers = vi.getTimerCount(), link = [...net.links.values()][0];
    const frame = { srcMac: a.interfaces[0].mac, dstMac: b.interfaces[0].mac,
      payload: { kind: 'arp' as const, op: 'request' as const, senderIp: 1, targetIp: 2, senderMac: a.interfaces[0].mac, targetMac: null } };
    for (let i = 0; i < 200; i++) net.emitWire(link, a, b, frame);
    expect(store().packets).toHaveLength(150); expect(vi.getTimerCount()).toBe(timers);
    store().tick(60000); expect(store().packets).toEqual([]);
    net.scheduler.schedule(50, () => net.emitWire(link, a, b, frame));
    store().tick(60000);
    expect(store().packets).toHaveLength(1);
    expect(store().packets[0].visualStart).toBe(store().packetAnimationClock);
    expect(packetAnimationProgress(store().packets[0], store().packetAnimationClock)).toBe(0);
    store().tick(3000); expect(store().packets).toEqual([]);
    store().setPacketAnimationSpeed(4); expect(store().packets).toEqual([]);
    expect(storage.get(PACKET_ANIMATION_SPEED_KEY)).toBe('4');
    store().flushAutosave();
    expect(JSON.parse(storage.get('netsim:autosave:v1')!)).not.toHaveProperty('packetAnimationSpeed');
    store().boot(); expect(store().packetAnimationSpeed).toBe(4);
  });
});

describe('guided packet visualization', () => {
  const store = () => useStore.getState();
  const guided = () => store().guidedPacket;
  afterEach(() => store().setPacketVisualizationMode('live'));
  function topology() {
    const devices = pair(), { a, b } = devices;
    store().onEdgesChange([{ type: 'remove', id: store().edges[0].id }]);
    store().addDeviceAt('switch', { x: 100, y: 100 });
    const relay = store().nodes.find((n) => n.data.kind === 'switch')!;
    for (const device of [a, b]) store().onConnect({ source: device.id, target: relay.id, sourceHandle: null, targetHandle: null });
    vi.advanceTimersByTime(500); setItem.mockClear();
    store().setPacketAnimationSpeed(1); store().setSpeed(1); store().setPaused(false);
    return { ...devices, relay };
  }
  it.each(['windows', 'linux'] as const)('animates three consecutive %s commands from the first hop without rearming, with cold and warm ARP', os => {
    const { a, net } = topology(); store().setHostOs(a.id, os);
    const session = open(a), option = os === 'windows' ? '-n' : '-c';
    store().setPacketVisualizationMode('guided'); store().startPacketCapture();
    for (let round = 0; round < 3; round++) {
      const start = net.now;
      input(session, `ping ${option} 4 10.0.0.2\r`);
      expect(guided().observation.session).toEqual({ deviceId: a.id, icmpId: round + 1 });
      net.scheduler.advanceTo(start + 320); // First ICMP after initial ARP, well before fourth request.
      expect(guided().playback.status).toBe('playing'); expect(guided().playback.hops[0].ping).toBe(1);
      net.scheduler.advanceTo(start + 3320);
      expect(guided().observation.status).toBe('complete');
      expect(guided().observation.attempts.map(a => a.replied)).toEqual([true, true, true, true]);
      expect(guided().observation.observed).toHaveLength(16);
      expect(getSession(a)).toBe(session);
      store().replayGuidedPacket(); // The next command must also preempt Replay.
    }
    vi.advanceTimersByTime(100);
    expect(store().packetCapture.records.filter(r => r.frame.payload.kind === 'ipv4')).toHaveLength(48);
    expect(output(session)).toContain(os === 'windows' ? 'Sent = 4, Received = 4' : '4 packets transmitted, 4 received');
  });
  it('a newly opened PC terminal wins before ARP, without cancelling the older continuous ping or losing capture', () => {
    const { a, b, net, relay } = topology(), first = open(a);
    store().addDeviceAt('host', { x: 80, y: 100 });
    const secondHost = sim.net.devices.get(store().nodes[store().nodes.length - 1].id) as Host;
    secondHost.interfaces[0].ip = parseCidr('10.0.0.3/24');
    store().onConnect({ source: secondHost.id, target: relay.id, sourceHandle: null, targetHandle: null });
    store().setPacketVisualizationMode('guided'); store().startPacketCapture();
    input(first, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(400); // First reply is still on its way.
    const second = open(secondHost); input(second, 'ping -c 4 10.0.0.2\r');
    expect(guided().observation.session).toEqual({ deviceId: secondHost.id, icmpId: 1 });
    expect(guided().playback.hops).toEqual([]);
    net.scheduler.advanceTo(1000);
    expect(guided().observation.session?.deviceId).toBe(secondHost.id);
    expect(guided().observation.observed.every(h => h.fromDeviceId !== a.id && h.toDeviceId !== a.id)).toBe(true);
    net.scheduler.advanceTo(5000); vi.advanceTimersByTime(100);
    expect(output(first)).toContain('icmp_seq=5'); expect(output(second)).toContain('4 packets transmitted, 4 received');
    expect(getSession(a)).toBe(first); expect(getSession(secondHost)).toBe(second);
    expect(store().packetCapture.records.some(r => r.fromDeviceId === a.id && r.frame.payload.kind === 'ipv4')).toBe(true);
    expect(store().packetCapture.records.some(r => r.fromDeviceId === secondHost.id && r.frame.payload.kind === 'ipv4')).toBe(true);
    expect(b.interfaces[0].ip).toEqual(parseCidr('10.0.0.2/24'));
  });
  it('focuses a command at start, before DNS, and does not let older attempts reclaim it if resolution fails', () => {
    const { a, b, net } = topology(), first = open(a), second = open(b);
    store().setPacketVisualizationMode('guided'); input(first, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(500);
    b.nameserver = parseIp('10.0.0.99');
    input(second, 'ping unavailable.test\r');
    expect(guided().observation.session?.deviceId).toBe(b.id); expect(guided().playback.hops).toEqual([]);
    net.scheduler.advanceTo(10000);
    expect(guided().observation.session?.deviceId).toBe(b.id); expect(guided().playback.hops).toEqual([]);
    expect(output(first)).toContain('icmp_seq=10'); input(second, '\x03');
    expect(guided().observation.sourceFinished).toBe(true);
  });
  it('entering Guided keeps the newest command started in Live even if an older ping emits first', () => {
    const { a, b, net } = topology(), first = open(a), second = open(b);
    input(first, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(500);
    input(second, 'ping 10.0.0.1\r'); net.scheduler.advanceTo(900);
    store().setPacketVisualizationMode('guided');
    expect(guided().observation.session?.deviceId).toBe(b.id);
    net.scheduler.advanceTo(1320); // Older host emitted at 1000.
    expect(guided().observation.observed).toEqual([]);
    net.scheduler.advanceTo(1820); expect(guided().observation.observed).toHaveLength(4);
    expect(guided().observation.session?.deviceId).toBe(b.id);
  });
  it('follows continuous ping beyond four attempts with bounded memory, OS switching and Ctrl+C', () => {
    const { a, net } = topology(), session = open(a), initial = serializeNetwork(net, {});
    store().setPacketVisualizationMode('guided'); input(session, 'ping 10.0.0.2\r');
    net.scheduler.advanceTo(500); store().setHostOs(a.id, 'windows');
    for (let t = 600; t <= 20000; t += 100) store().tick(100);
    expect(guided().observation.attempts.at(-1)!.seq).toBeGreaterThan(4);
    expect(guided().observation.attempts).toHaveLength(4);
    expect(guided().observation.observed.length).toBeLessThanOrEqual(256);
    expect(guided().playback.hops.length).toBeLessThanOrEqual(32);
    expect(output(session)).toContain('icmp_seq=20'); input(session, '\x03');
    expect(output(session)).toMatch(/C:\\>$/); expect(getSession(a)).toBe(session);
    store().setHostOs(a.id, 'linux'); expect(serializeNetwork(net, {})).toEqual(initial);
  });
  it('continues observation during Replay and visual pause; a new command preempts either immediately', () => {
    const { a, net } = topology(), session = open(a);
    store().setPacketVisualizationMode('guided'); input(session, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(640);
    store().replayGuidedPacket(); const replay = guided().playback;
    net.scheduler.advanceTo(2320);
    expect(guided().playback).toBe(replay); expect(guided().observation.attempts).toHaveLength(3);
    store().toggleGuidedPlayback(); const paused = guided().playback;
    net.scheduler.advanceTo(3320); expect(guided().playback).toBe(paused);
    input(session, '\x03'); input(session, 'ping -c 1 10.0.0.2\r');
    expect(guided().playback.kind).toBe('follow'); expect(guided().playback.status).toBe('playing');
    expect(guided().observation.session?.icmpId).toBe(2);
  });
  it.each(['windows', 'linux'] as const)('explains %s local/unreachable ping and automatically accepts the next command', os => {
    const { a, net } = topology(); store().setHostOs(a.id, os);
    const session = open(a), option = os === 'windows' ? '-n' : '-c';
    store().setPacketVisualizationMode('guided'); store().startPacketCapture();
    input(session, `ping ${option} 4 10.0.0.1\r`); net.scheduler.advanceTo(3002);
    expect(guided().observation.message).toContain('Local ping'); expect(guided().playback.hops).toEqual([]);
    vi.advanceTimersByTime(100); expect(store().packetCapture.records).toEqual([]);
    input(session, `ping ${option} 4 10.0.0.99\r`); net.scheduler.advanceTo(8002);
    expect(guided().observation.message).toContain('No ICMP link transmission');
    input(session, `ping ${option} 1 10.0.0.2\r`); net.scheduler.advanceTo(8642);
    expect(guided().playback.hops).toHaveLength(4);
  });
  it('keeps actual missing replies/timeouts and late in-flight frames without stopping observation', () => {
    const { a, b, net } = topology(); a.sendEcho(parseIp('10.0.0.2')!, 99, 1); net.scheduler.advanceTo(800);
    b.interfaces[0].up = false;
    const session = open(a); store().setPacketVisualizationMode('guided'); input(session, 'ping -c 4 10.0.0.2\r');
    net.scheduler.advanceTo(5800);
    expect(guided().observation.attempts.every(a => a.settled && !a.replied)).toBe(true);
    expect(guided().observation.observed.every(h => h.direction === 'request')).toBe(true);
    b.interfaces[0].up = true;
    for (const link of net.links.values()) link.latency = 600;
    input(session, 'ping -c 1 10.0.0.2\r'); net.scheduler.advanceTo(7800);
    expect(guided().observation.sourceFinished).toBe(true); expect(guided().observation.status).toBe('observing');
    net.scheduler.advanceTo(8200); store().tick(0);
    expect(guided().observation.observed).toHaveLength(4); expect(guided().observation.status).toBe('complete');
  });
  it('preserves Replay speed, Step and pause independent of the network clock', () => {
    const { a, net } = topology(), session = open(a);
    store().setPacketVisualizationMode('guided'); input(session, 'ping -c 1 10.0.0.2\r'); net.scheduler.advanceTo(640);
    store().replayGuidedPacket(); store().setPaused(true); const now = net.now;
    store().tick(500); expect(guided().playback.progress).toBe(.5);
    store().setPacketAnimationSpeed(2); store().tick(250); expect(guided().playback.index).toBe(1);
    store().nextGuidedHop(); expect(guided().playback.status).toBe('paused');
    store().tick(2000); expect(guided().playback.index).toBe(2); expect(net.now).toBe(now);
    store().toggleGuidedPlayback(); store().tick(2000); expect(guided().playback.status).toBe('finished');
  });
  it('reenters Guided during a command, preserves network/capture/history, and clears invalid paths/topologies', () => {
    const { a, net } = topology(), session = open(a), history = store().topologyHistory;
    store().startPacketCapture(); input(session, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(1500);
    for (let round = 0; round < 3; round++) {
      store().setPacketVisualizationMode('guided'); net.scheduler.advanceTo(net.now + 1000);
      expect(guided().playback.hops.length).toBeGreaterThan(0);
      store().setPacketVisualizationMode('live'); net.scheduler.advanceTo(net.now + 1000);
      expect(store().packets.length).toBeGreaterThan(0);
    }
    expect(store().topologyHistory).toBe(history); expect(getSession(a)).toBe(session);
    store().setPacketVisualizationMode('guided'); net.scheduler.advanceTo(net.now + 1000);
    const edge = guided().observation.observed[0].linkId;
    store().onEdgesChange([{ type: 'remove', id: edge }]); expect(guided().observation.status).toBe('incomplete');
    store().undoTopology(); expect(guided().playback.hops).toEqual([]);
    const saved = JSON.stringify(serializeNetwork(sim.net, {})), oldProgress = net.onPingProgress!, oldWire = net.onWireTransfer!;
    expect(store().importJson('{')).not.toBeNull(); expect(guided().observation.status).toBe('incomplete');
    expect(store().importJson(saved)).toBeNull(); expect(guided().observation.session).toBeNull();
    oldProgress({ type: 'started', deviceId: a.id, icmpId: 999 });
    oldWire({ id: 999, linkId: edge, fromDeviceId: a.id, toDeviceId: a.id, kind: 'icmp', start: 0, end: 80 }, {
      fromDeviceName: 'old', toDeviceName: 'old', fromInterface: 'eth0', toInterface: 'eth0',
      frame: { srcMac: 'a', dstMac: 'b', payload: { kind: 'arp', op: 'request', senderIp: 1, targetIp: 2, senderMac: 'a', targetMac: 'b' } },
    });
    expect(guided().observation.session).toBeNull(); expect(guided().playback.hops).toEqual([]);
  });
});

describe('packet capture store integration', () => {
  const store = () => useStore.getState();

  it('opens and closes the packet panel without changing capture, selection, history or terminal sessions', () => {
    const { a, b, net } = pair(), session = open(a), cable = store().edges[0].id;
    store().select(b.id); store().onEdgesChange([{ type: 'select', id: cable, selected: true }]);
    store().startPacketCapture(); input(session, 'ping 10.0.0.2\r');
    const capture = store().packetCapture, history = store().topologyHistory, panels = store().terminalPanels;
    for (const openPanel of [true, false, true, false]) store().setPacketInspectorOpen(openPanel);
    expect(store().packetCapture).toBe(capture); expect(store().selected).toBe(b.id);
    expect(store().edges.find((edge) => edge.id === cable)?.selected).toBe(true);
    expect(store().topologyHistory).toBe(history); expect(store().terminalPanels).toBe(panels);
    net.scheduler.advanceTo(2500); expect(output(session)).toContain('icmp_seq=2');
    expect(getSession(a)).toBe(session); expect(session.term.dispose).not.toHaveBeenCalled(); expect(sim.net).toBe(net);
  });

  it('publishes capture in batches without per-packet capture updates, autosaves or history edits', () => {
    const { a, b, net } = pair(), first = open(a), second = open(b);
    store().renameDevice(a.id, 'Capture-PC'); vi.advanceTimersByTime(500); setItem.mockClear();
    const history = store().topologyHistory;
    store().startPacketCapture();
    let captureUpdates = 0, animationUpdates = 0;
    const unsubscribe = useStore.subscribe((next, previous) => {
      if (next.packetCapture !== previous.packetCapture) captureUpdates++;
      if (next.packets !== previous.packets) animationUpdates++;
    });
    try {
      input(first, 'ping 10.0.0.2\r'); input(second, 'ping 10.0.0.1\r'); net.scheduler.advanceTo(2200);
      expect(animationUpdates).toBeGreaterThan(4); expect(captureUpdates).toBe(0);
      expect(store().packetCapture.records).toEqual([]);
      vi.advanceTimersByTime(100); expect(captureUpdates).toBe(1);
      expect(store().packetCapture.records).toHaveLength(animationUpdates);
      store().pausePacketCapture(); store().resumePacketCapture(); store().clearPacketCapture(); store().stopPacketCapture();
      vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled(); expect(store().topologyHistory).toBe(history);
      net.scheduler.advanceTo(8500);
      expect(output(first)).toContain('icmp_seq=8'); expect(output(second)).toContain('icmp_seq=8');
      expect(getSession(a)).toBe(first); expect(getSession(b)).toBe(second);
      expect(first.term.dispose).not.toHaveBeenCalled(); expect(second.term.dispose).not.toHaveBeenCalled();
      store().undoTopology(); store().redoTopology(); expect(a.name).toBe('Capture-PC');
      vi.advanceTimersByTime(500);
      const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
      expect(saved).not.toHaveProperty('packetCapture'); expect(saved).not.toHaveProperty('packets');
    } finally { unsubscribe(); }
  });

  it.each(['new', 'import'] as const)('resets capture on %s topology and rejects old network callbacks and pending batches', (load) => {
    const { a, net } = pair(), linkId = [...net.links.keys()][0];
    store().startPacketCapture(linkId); a.sendEcho(parseIp('10.0.0.2')!, 1, 1); net.scheduler.advanceTo(1000);
    store().pausePacketCapture(); const record = store().packetCapture.records[0], callback = net.onWireTransfer!;
    expect(record).toBeDefined();
    const beforeInvalid = store().packetCapture;
    expect(store().importJson('{')).not.toBeNull(); expect(store().packetCapture).toBe(beforeInvalid);
    store().startPacketCapture('missing'); expect(store().packetCapture).toBe(beforeInvalid);
    store().resumePacketCapture(); a.sendEcho(parseIp('10.0.0.2')!, 1, 2);
    const saved = JSON.stringify(serializeNetwork(net, {}));
    if (load === 'new') store().newTopology(); else expect(store().importJson(saved)).toBeNull();
    expect(store().packetCapture).toEqual({ status: 'stopped', linkId: null, records: [], discarded: 0 });
    expect(net.onWireTransfer).toBeNull(); expect(net.onFwDrop).toBeNull();
    store().startPacketCapture(); const current = store().packetCapture, packets = store().packets;
    callback(record, record); net.scheduler.advanceTo(5000); vi.advanceTimersByTime(100);
    expect(store().packetCapture).toBe(current); expect(store().packets).toBe(packets);
  });

  it('retains historical snapshots after deletion and keeps capture failure isolated from animations and ping delivery', () => {
    const { a, b, net } = pair(), session = open(a), originalName = b.name;
    store().startPacketCapture(); input(session, 'ping 10.0.0.2\r'); net.scheduler.advanceTo(900); vi.advanceTimersByTime(100);
    const records = store().packetCapture.records;
    expect(records.some((r) => r.toDeviceName === originalName)).toBe(true);
    const observe = vi.spyOn(PacketCapture.prototype, 'observe').mockImplementation(() => { throw new Error('capture failed'); });
    net.scheduler.advanceTo(2500);
    expect(output(session)).toContain('icmp_seq=2'); expect(store().packets.length).toBeGreaterThan(records.length);
    observe.mockRestore(); store().deleteDevice(b.id);
    expect(store().packetCapture.records).toBe(records); expect(net.devices.has(b.id)).toBe(false);
    expect(getSession(a)).toBe(session); expect(session.term.dispose).not.toHaveBeenCalled();
  });
});

describe('Inspector RIP history', () => {
  const store = () => useStore.getState();
  const router = () => {
    store().addDeviceAt('router', { x: 400, y: 30 });
    return sim.net.devices.get(store().nodes.at(-1)!.id) as IpDevice;
  };

  it('records enable and disable, with one timer after repeated Undo/Redo and no traffic-derived history', () => {
    const device = router(), net = sim.net, session = open(device);
    store().invalidateTopologyHistory();
    store().toggleRip(device.id);
    expect(store().topologyHistory.past).toEqual([
      { type: 'set-rip-enabled', label: 'Enable RIP', deviceId: device.id, before: false, after: true },
    ]);
    for (let i = 0; i < 5; i++) {
      store().undoTopology(); expect(device.ripEnabled).toBe(false); expect(net.scheduler.pending).toBe(0);
      store().redoTopology(); expect(device.ripEnabled).toBe(true); expect(net.scheduler.pending).toBe(1);
    }
    net.scheduler.advanceTo(30_000); store().tick(50); store().refresh();
    expect(store().topologyHistory.past).toHaveLength(1); expect(net.scheduler.pending).toBe(1);
    store().toggleRip(device.id);
    expect(store().topologyHistory.past.at(-1)).toMatchObject({ label: 'Disable RIP', before: true, after: false });
    store().undoTopology(); expect(device.ripEnabled).toBe(true); expect(net.scheduler.pending).toBe(1);
    store().redoTopology(); expect(device.ripEnabled).toBe(false); expect(net.scheduler.pending).toBe(0);
    expect(sim.net).toBe(net); expect(net.devices.get(device.id)).toBe(device);
    expect(getSession(device)).toBe(session); expect(session.term.dispose).not.toHaveBeenCalled();
  });

  it('preserves four active sessions through interleaved edits and autosaves replayed RIP settings for boot', () => {
    const { a, b, net } = pair(), left = router(), right = router(), devices = [a, b, left, right];
    store().setIfaceIp(left.id, 'eth0', '192.0.2.1/24'); store().setIfaceIp(right.id, 'eth0', '192.0.2.2/24');
    store().invalidateTopologyHistory();
    const sessions = devices.map(open), original = left.name;
    sessions.forEach((session, i) => input(session, `ping ${i < 2 ? `10.0.0.${2 - i}` : `192.0.2.${i - 1}`}\r`));
    store().toggleRip(left.id); store().renameDevice(left.id, 'R-Lab');
    store().onConnect({ source: left.id, target: right.id, sourceHandle: null, targetHandle: null });
    const cable = [...net.links.keys()].at(-1)!;
    store().toggleRip(right.id); store().setServices(b.id, 'udp', '53');
    store().onNodesChange([{ type: 'position', id: left.id, position: { x: 500, y: 30 }, dragging: false }]);
    for (let i = 0; i < 6; i++) store().undoTopology();
    expect(left.ripEnabled).toBe(false); expect(right.ripEnabled).toBe(false);
    expect(left.name).toBe(original); expect(net.links.has(cable)).toBe(false); expect(b.services.udp.size).toBe(0);
    for (let i = 0; i < 6; i++) store().redoTopology();
    net.scheduler.advanceTo(8500); store().refresh();
    expect(store().topologyHistory.past).toHaveLength(6);
    expect(left.ripEnabled).toBe(true); expect(right.ripEnabled).toBe(true);
    expect(sim.net).toBe(net); expect(net.links.has(cable)).toBe(true);
    sessions.forEach((session, i) => {
      expect(net.devices.get(devices[i].id)).toBe(devices[i]); expect(getSession(devices[i])).toBe(session);
      expect(session.term.dispose).not.toHaveBeenCalled(); expect(output(session)).toContain('icmp_seq=8');
    });
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.devices.find((d: { id: string }) => d.id === left.id).ripEnabled).toBe(true);
    store().boot();
    expect((sim.net.devices.get(left.id) as IpDevice).ripEnabled).toBe(true);
    expect((sim.net.devices.get(right.id) as IpDevice).ripEnabled).toBe(true);
    expect(store().terminals).toEqual([]); expect(store().topologyHistory).toEqual({ past: [], future: [] });
  });

  it('preserves Redo for missing or unsupported targets and invalidates it on incompatible external RIP changes', () => {
    const device = router(); store().addDeviceAt('switch', { x: 0, y: 0 }); const sw = store().nodes.at(-1)!.id;
    store().invalidateTopologyHistory(); store().toggleRip(device.id); store().undoTopology();
    vi.advanceTimersByTime(500); setItem.mockClear(); const history = store().topologyHistory;
    store().toggleRip('missing'); store().toggleRip(sw);
    expect(store().topologyHistory).toBe(history); vi.advanceTimersByTime(500); expect(setItem).not.toHaveBeenCalled();
    device.enableRip(true); store().redoTopology();
    expect(device.ripEnabled).toBe(true); expect(store().topologyHistory).toEqual({ past: [], future: [] });
    store().toggleRip(device.id); const terminal = open(device);
    input(terminal, 'ip link set eth0 down\r'); expect(store().topologyHistory.past).toEqual([]);
    store().toggleRip(device.id); store().undoTopology(); store().renameDevice(device.id, 'R-New');
    expect(store().topologyHistory.future).toEqual([]);
  });
});
