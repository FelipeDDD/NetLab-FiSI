import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpDevice } from './engine/ipdevice';
import { parseCidr, parseIp } from './engine/ip';
import { Shell, type TermIO } from './commands/shell';
import { sim } from './sim';
import { useStore } from './store';
import { disposeAllSessions, disposeSession, getSession, type Session } from './terminals';

// Only the browser renderer is replaced. Commands, engine, store and persistence
// run together so these tests cover the actual terminal-to-autosave path.
const inputs = vi.hoisted(() => new Map<object, (data: string) => void>());
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    write = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();
    loadAddon() {}
    onData(listener: (data: string) => void) {
      inputs.set(this, listener);
      return { dispose: () => inputs.delete(this) };
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

describe('terminal session lifetime', () => {
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
    net.scheduler.advanceTo(200);
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

  it('saves asynchronous DHCP configuration after completion and restores it on boot', () => {
    const { a, b, net } = pair();
    a.getInterface('eth0')!.ip = null;
    b.dhcpServer = {
      enabled: true, rangeStart: parseIp('10.0.0.100')!, rangeEnd: parseIp('10.0.0.110')!,
      router: parseIp('10.0.0.2'), dns: parseIp('10.0.0.2'), leases: new Map(),
    };
    const session = open(a);
    input(session, 'dhclient eth0\r');
    vi.advanceTimersByTime(500);
    expect(setItem).not.toHaveBeenCalled();
    net.scheduler.advanceTo(2000);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);
    useStore.getState().boot();
    const restored = sim.net.devices.get(a.id) as IpDevice;
    expect(restored.getInterface('eth0')!.ip).toEqual(parseCidr('10.0.0.100/24'));
    expect(restored.staticRoutes[0]?.via).toBe(parseIp('10.0.0.2'));
    expect(restored.nameserver).toBe(parseIp('10.0.0.2'));
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
