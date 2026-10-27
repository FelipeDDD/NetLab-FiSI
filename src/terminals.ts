import { hasTerminalKind } from './engine/device';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Shell, type Running } from './commands/shell';
import type { IpDevice } from './engine/ipdevice';
import { serializeNetwork } from './engine/serialize';
import { inputBoundary, normalizeTerminalPaste, PASTE_END, PASTE_START, terminalInputDecoder } from './terminalInput';
import { commandCursorPosition, currentCommandRange, inputStartRow } from './terminalLine';
import { LEGACY_TERMINAL_FONT_SIZE, TERMINAL_THEME, terminalFontFamily } from './terminalAppearance';

export interface SessionOpts {
  onAfterCommand?: (configurationChanged: boolean) => void;
  onSchedulerRequired?: () => 'manual-pause' | void;
}

export interface Session {
  term: Terminal;
  fit: FitAddon;
  opened: boolean;
  configure(opts: SessionOpts): void;
  executeCommand(command: string): 'accepted' | 'busy' | 'unapplied-input' | 'disposed';
  refreshProfile(): void;
  dispose(): void;
}

const sessions = new Map<string, Session>();

export function getSession(device: IpDevice, opts: SessionOpts = {}): Session {
  if (!hasTerminalKind(device.kind)) throw new Error('No terminal for this device');
  const existing = sessions.get(device.id);
  if (existing) { existing.configure(opts); return existing; }
  opts = { ...opts };

  const term = new Terminal({
    cursorBlink: true,
    // API-only sessions retain the original reference. The view applies the
    // persisted preference before its first fit without recreating the terminal.
    fontSize: LEGACY_TERMINAL_FONT_SIZE,
    fontFamily: terminalFontFamily('system'),
    scrollback: 2000,
    // Set before open(). Keep the built-in DOM renderer and a static CSS
    // background; changing a device color never recreates a session or its theme.
    allowTransparency: true,
    minimumContrastRatio: 4.5,
    theme: { ...TERMINAL_THEME },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.attachCustomKeyEventHandler((event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      !event.isComposing && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'keydown') {
        selectedCommand = !running;
        enqueueInput('\x01');
      }
      return false;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing &&
      event.key.toLowerCase() === 'v') {
      // Do not emit ^V or cancel the browser's native paste action. The paste
      // event is handled once by xterm, without reading navigator.clipboard.
      event.stopPropagation();
      return false;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      !event.isComposing && event.key.toLowerCase() === 'c' && term.hasSelection()) {
      // Let the browser's native copy event reach xterm's clipboard handler.
      // With no selection, xterm still sends Ctrl-C to the running command.
      event.stopPropagation();
      return false;
    }
    return true;
  });

  const shell = new Shell(device);
  let promptOs = shell.os;
  const promptStr = (adoptProfile = true) => {
    if (adoptProfile) promptOs = shell.os;
    return promptOs === 'windows' ? 'C:\\>' : `\x1b[1;32m${device.name}\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
  };
  let buf = '';
  let cursor = 0;
  let running: Running | null = null;
  let disposed = false;
  let selectedCommand = false;
  let paintingSelection = false;
  let selectionRevision = 0;
  let inputBusy = false;
  let draining = false;
  // null requests a redraw after xterm column reflow, serialized with input.
  const inputQueue: { data: string | null; replace: boolean; refreshProfile?: boolean }[] = [];
  const history: string[] = [];
  let hIdx = 0;
  let historyDraft = { text: '', cursor: 0 };
  const decodeInput = terminalInputDecoder();

  const redrawLine = (next: string, done: () => void, nextCursor = next.length) => {
    buf = next;
    cursor = nextCursor;
    term.clearSelection();
    // Wait for pending writes/reflow before measuring wrapped input. Only
    // editable viewport rows are erased; earlier output/scrollback is retained.
    term.write('', () => {
      if (disposed) return done();
      const buffer = term.buffer.active;
      const up = buffer.cursorY - Math.max(0, inputStartRow(buffer) - buffer.baseY);
      term.write(`\r${up ? `\x1b[${up}A` : ''}\x1b[J${promptStr(false)}${next}`, () => {
        if (disposed) return done();
        const buffer = term.buffer.active;
        const position = commandCursorPosition(buffer, term.cols, next, nextCursor);
        if (!position) return done();
        const up = buffer.baseY + buffer.cursorY - position.row;
        term.write(`\r${up > 0 ? `\x1b[${up}A` : ''}${position.column ? `\x1b[${position.column}C` : ''}`, done);
      });
    });
  };

  const insertText = (text: string, replace: boolean, done: () => void) => {
    if (replace) return redrawLine(text, done);
    if (cursor === buf.length) {
      buf += text;
      cursor = buf.length;
      term.write(text, done);
      return;
    }
    const next = buf.slice(0, cursor) + text + buf.slice(cursor);
    // Joining a combining mark/emoji can absorb the old boundary.
    const end = cursor + text.length;
    const nextCursor = inputBoundary(next, inputBoundary(next, end, -1), 1);
    return redrawLine(next, done, text ? nextCursor : cursor);
  };

  const submit = () => {
    const line = buf;
    buf = '';
    cursor = 0;
    hIdx = history.length;
    historyDraft = { text: '', cursor: 0 };
    term.write('\r\n');
    const trimmed = line.trim();
    if (!trimmed) {
      term.write(promptStr());
      return;
    }
    history.push(line);
    hIdx = history.length;
    if (promptOs === 'linux' && trimmed === 'clear') {
      term.write('\x1b[2J\x1b[H');
      term.write(promptStr());
      return;
    }
    // Compare only persisted configuration, not ARP/conntrack caches or output.
    const before = JSON.stringify(serializeNetwork(device.network, {}));
    let completed = false;
    const command = shell.exec(line, {
      write: (s) => {
        if (!disposed && !completed) term.write(s.replace(/\n/g, '\r\n'));
      },
    }, () => {
      if (disposed || completed) return;
      completed = true;
      running = null;
      opts.onAfterCommand?.(before !== JSON.stringify(serializeNetwork(device.network, {})));
      if (!disposed) term.write(promptStr());
    }, promptOs);
    // Some commands call done synchronously and still return a cancel handle.
    running = completed ? null : command;
    if (running?.needsScheduler && opts.onSchedulerRequired?.() === 'manual-pause') {
      term.write('\r\n\x1b[90mSimulation pausiert · Zum Fortsetzen Run klicken.\x1b[0m\r\n');
    }
  };

  // An edit that needs rendered coordinates holds the queue until xterm has
  // parsed it. Fast typing/paste/Enter cannot overtake a selection or redraw.
  const drainInput = () => {
    if (draining || disposed) return;
    draining = true;
    while (!inputBusy && inputQueue.length && !disposed) {
      inputBusy = true;
      const action = inputQueue.shift()!;
      processInput(action.data, action.replace, () => {
        inputBusy = false;
        if (!draining) drainInput();
      }, action.refreshProfile);
    }
    draining = false;
  };

  const enqueueInput = (data: string) => {
    if (disposed) return;
    for (const part of decodeInput(data)) {
      const replace = selectedCommand;
      if (part !== '\x01') selectedCommand = false;
      inputQueue.push({ data: part, replace });
    }
    drainInput();
  };

  const processInput = (data: string | null, replace: boolean, done: () => void, refreshProfile = false) => {
    if (refreshProfile) {
      if (running || buf || term.hasSelection() || promptOs === shell.os) return done();
      promptOs = shell.os;
      return redrawLine('', done);
    }
    if (data === null) {
      // Reflow can leave wide Unicode cells inconsistent with the line buffer.
      // Repaint editable input from the authoritative text, never command output.
      selectedCommand = false;
      if (!running && buf) return redrawLine(buf, done, cursor);
      return done();
    }
    // A selection may defer a profile refresh, but must not bind a NEW command
    // to the old OS. Existing drafts and running commands keep their profile.
    if (!running && !buf && promptOs !== shell.os &&
      (data === '\r' || data === '\x1b[A' || data.startsWith(PASTE_START) || data >= ' ')) {
      promptOs = shell.os;
      return redrawLine('', () => processInput(data, replace, done));
    }
    if (data === '\x01') {
      if (running || !buf) {
        selectedCommand = false;
        term.clearSelection();
        return done();
      }
      paintingSelection = true;
      redrawLine(buf, () => {
        if (disposed) return done();
        const range = currentCommandRange(term.buffer.active, term.cols, buf);
        term.clearSelection();
        if (range) term.select(range.column, range.row, range.length);
        else selectedCommand = false;
        paintingSelection = false;
        done();
      });
      return;
    }
    if (data.startsWith(PASTE_START) && data.endsWith(PASTE_END)) {
      if (running) {
        term.write('\r\n\x1b[90mStop the running command with Ctrl+C before pasting.\x1b[0m\r\n');
        return done();
      }
      const text = normalizeTerminalPaste(data.slice(PASTE_START.length, -PASTE_END.length));
      return insertText(text, replace, done);
    }
    if (running) {
      if (data === '\x03') {
        term.write('^C\r\n');
        running.cancel();
      }
      return done();
    }
    if (data === '\x1b[A' || data === '\x1bOA') {
      if (history.length && hIdx > 0) {
        if (hIdx === history.length) historyDraft = { text: buf, cursor };
        return redrawLine(history[--hIdx], done);
      }
      return done();
    }
    if (data === '\x1b[B' || data === '\x1bOB') {
      if (hIdx < history.length - 1) return redrawLine(history[++hIdx], done);
      if (hIdx < history.length) {
        hIdx = history.length;
        return redrawLine(historyDraft.text, done, historyDraft.cursor);
      }
      return done();
    }
    if (['\x1b[D', '\x1bOD', '\x1b[C', '\x1bOC', '\x1b[H', '\x1bOH', '\x1b[1~', '\x1b[7~', '\x1b[F', '\x1bOF', '\x1b[4~', '\x1b[8~', '\x05'].includes(data)) {
      const next = ['\x1b[D', '\x1bOD'].includes(data) ? inputBoundary(buf, cursor, -1)
        : ['\x1b[C', '\x1bOC'].includes(data) ? inputBoundary(buf, cursor, 1)
        : ['\x1b[H', '\x1bOH', '\x1b[1~', '\x1b[7~'].includes(data) ? 0 : buf.length;
      if (next !== cursor) return redrawLine(buf, done, next);
      term.clearSelection();
      return done();
    }
    if (data === '\r') {
      term.clearSelection();
      if (cursor !== buf.length) return redrawLine(buf, () => { if (!disposed) submit(); done(); });
      submit();
    } else if (data === '\x7f' || data === '\x08' || data === '\x1b[3~') {
      if (replace) return redrawLine('', done);
      const start = data === '\x1b[3~' ? cursor : inputBoundary(buf, cursor, -1);
      const end = data === '\x1b[3~' ? inputBoundary(buf, cursor, 1) : cursor;
      if (start !== end) return redrawLine(buf.slice(0, start) + buf.slice(end), done, start);
    } else if (data === '\x03') {
      term.clearSelection();
      if (cursor !== buf.length) return redrawLine(buf, () => processInput(data, false, done));
      term.write('^C\r\n');
      buf = '';
      cursor = 0;
      hIdx = history.length;
      historyDraft = { text: '', cursor: 0 };
      term.write(promptStr());
    } else if (data >= ' ' && (data < '\x7f' || data >= '\xa0')) {
      return insertText(data, replace, done);
    }
    done();
  };

  const input = term.onData(enqueueInput);
  let editColumns = term.cols;
  const resize = term.onResize(({ cols }) => {
    const changed = cols !== editColumns;
    editColumns = cols;
    if (!changed || disposed || running || !buf) return;
    if (!inputQueue.some((action) => action.data === null)) inputQueue.push({ data: null, replace: false });
    drainInput();
  });
  const selection = term.onSelectionChange(() => {
    if (paintingSelection) return;
    const revision = ++selectionRevision;
    // xterm clears native selection immediately before onData. Let that input
    // capture the replacement intent first; mouse deselection clears it later.
    queueMicrotask(() => {
      if (!disposed && revision === selectionRevision && selectedCommand &&
        (!term.hasSelection() || term.getSelection() !== buf)) selectedCommand = false;
    });
  });

  // xterm marks both native paste events and term.paste() as a single payload,
  // so even a clipboard containing only CR cannot be mistaken for Enter.
  term.write('\x1b[?2004h');
  term.writeln(`\x1b[90mNetSim — ${device.name} (${device.kind}). ${shell.os === 'windows' ? 'Windows CMD simulation. ' : ''}Type 'help' for commands.\x1b[0m`);
  term.write(promptStr());

  const session: Session = {
    term, fit, opened: false,
    configure(next) { Object.assign(opts, next); },
    executeCommand(command) {
      if (disposed) return 'disposed';
      if (running || inputBusy || inputQueue.length) return 'busy';
      if (buf || term.hasSelection()) return 'unapplied-input';
      // Share the input queue, prompt/history and Shell.exec path with Enter.
      // Block concurrent typing until the rendered command has been submitted.
      if (!command.trim() || /[\r\n\x00-\x1f]/.test(command)) return 'unapplied-input';
      inputBusy = true;
      selectedCommand = false;
      promptOs = shell.os;
      redrawLine(command, () => {
        if (!disposed) submit();
        inputBusy = false;
        drainInput();
      });
      return 'accepted';
    },
    refreshProfile() {
      // Never disturb a running command, typed draft or selection. Their next
      // prompt adopts the profile; the existing buffer and renderer stay intact.
      if (disposed) return;
      // Serialize the redraw with xterm writes/input so fast typing cannot be
      // erased between measuring the old prompt and painting the new one.
      inputQueue.push({ data: null, replace: false, refreshProfile: true });
      drainInput();
    },
    dispose() {
      if (disposed) return;
      // Invalidate callbacks before cancel(), which may synchronously call done.
      disposed = true;
      if (sessions.get(device.id) === session) sessions.delete(device.id);
      input.dispose();
      resize.dispose();
      selection.dispose();
      inputQueue.length = 0;
      const command = running;
      running = null;
      try {
        command?.cancel();
      } finally {
        term.dispose();
      }
    },
  };
  sessions.set(device.id, session);
  return session;
}

export function disposeSession(deviceId: string): void {
  const s = sessions.get(deviceId);
  if (!s) return;
  s.dispose();
}

export function refreshSessionProfile(deviceId: string): void {
  sessions.get(deviceId)?.refreshProfile();
}

export function disposeAllSessions(): void {
  for (const id of [...sessions.keys()]) disposeSession(id);
}
