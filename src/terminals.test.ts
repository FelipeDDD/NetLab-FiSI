import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpDevice } from './engine/ipdevice';
import { parseCidr, parseIp } from './engine/ip';
import { Shell, type TermIO } from './commands/shell';
import { sim } from './sim';
import { useStore } from './store';
import { disposeAllSessions, disposeSession, getSession, type Session } from './terminals';
import { PASTE_END, PASTE_START } from './terminalInput';
import * as terminalLine from './terminalLine';
import { restoreNetwork, serializeNetwork } from './engine/serialize';
import { DEFAULT_TERMINAL_APPEARANCE, DEFAULT_TERMINAL_COLORS, type AppearanceSaveFile } from './terminalAppearance';
import { resizePanelPair } from './terminalPanels';
import { PANEL_LAYOUT_KEY } from './terminalPanelPreferences';
import { TAB_LAYOUT_KEY } from './terminalTabPreferences';

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

  it('exports and imports custom colors through the actual JSON download path', async () => {
    const { a } = pair();
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().setTerminalAppearance({ style: 'dual-glow', intensity: 63, fontFamily: 'cascadia' });
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
    expect(useStore.getState().terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style: 'dual-glow', intensity: 63, fontFamily: 'cascadia' });
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

  it('keeps a running session and partial input intact while colors change and after close/reopen', () => {
    const { a, b, net } = pair();
    const first = open(a);
    const second = open(b);
    input(first, 'host');
    input(second, 'ping 10.0.0.2\r');
    const send = vi.spyOn(b, 'sendEcho');
    const exec = vi.spyOn(Shell.prototype, 'exec');
    useStore.getState().setTerminalColor(a.id, '#123456');
    useStore.getState().setTerminalColor(b.id, '#654321');
    useStore.getState().setTerminalAppearance({ style: 'dual-glow', intensity: 95, fontSize: 18 });
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

  it('autosaves style/intensity independently of colors and preserves the engine configuration', () => {
    const { net } = pair();
    const before = serializeNetwork(net, {});
    useStore.getState().setTerminalAppearance({ style: 'dual-glow' });
    useStore.getState().setTerminalAppearance({ intensity: 55 });
    expect(serializeNetwork(net, {})).toEqual(before);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledOnce();
    const saved = JSON.parse(storage.get('netsim:autosave:v1')!);
    expect(saved.ui.terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style: 'dual-glow', intensity: 55 });
    expect(saved.ui.terminalColors).toBeUndefined();
    useStore.getState().boot();
    expect(useStore.getState().terminalAppearance).toEqual({ ...DEFAULT_TERMINAL_APPEARANCE, style: 'dual-glow', intensity: 55 });
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
