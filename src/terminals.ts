import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Shell, type Running } from './commands/shell';
import type { IpDevice } from './engine/ipdevice';
import { serializeNetwork } from './engine/serialize';

export interface SessionOpts {
  onAfterCommand?: (configurationChanged: boolean) => void;
}

export interface Session {
  term: Terminal;
  fit: FitAddon;
  opened: boolean;
  dispose(): void;
}

const sessions = new Map<string, Session>();

export function getSession(device: IpDevice, opts: SessionOpts = {}): Session {
  const existing = sessions.get(device.id);
  if (existing) return existing;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    scrollback: 2000,
    theme: {
      background: '#0b1220',
      foreground: '#d6e2f0',
      cursor: '#7dd3fc',
      selectionBackground: '#274867',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const shell = new Shell(device);
  const promptStr = () => `\x1b[1;32m${device.name}\x1b[0m:\x1b[1;34m~\x1b[0m$ `;
  let buf = '';
  let running: Running | null = null;
  let disposed = false;
  const history: string[] = [];
  let hIdx = 0;

  const redrawLine = (next: string) => {
    term.write(`\x1b[2K\r${promptStr()}${next}`);
    buf = next;
  };

  const submit = () => {
    const line = buf;
    buf = '';
    term.write('\r\n');
    const trimmed = line.trim();
    if (!trimmed) {
      term.write(promptStr());
      return;
    }
    history.push(line);
    hIdx = history.length;
    if (trimmed === 'clear') {
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
    });
    // Some commands call done synchronously and still return a cancel handle.
    running = completed ? null : command;
  };

  const input = term.onData((data) => {
    if (disposed) return;
    if (running) {
      if (data === '\x03') {
        term.write('^C\r\n');
        running.cancel();
      }
      return;
    }
    if (data === '\x1b[A') {
      if (history.length && hIdx > 0) redrawLine(history[--hIdx]);
      return;
    }
    if (data === '\x1b[B') {
      if (hIdx < history.length - 1) redrawLine(history[++hIdx]);
      else {
        hIdx = history.length;
        redrawLine('');
      }
      return;
    }
    for (const ch of data) {
      if (ch === '\r') {
        submit();
      } else if (ch === '\x7f') {
        if (buf.length) {
          buf = buf.slice(0, -1);
          term.write('\b \b');
        }
      } else if (ch === '\x03') {
        term.write('^C\r\n');
        buf = '';
        term.write(promptStr());
      } else if (ch >= ' ' && ch <= '~') {
        buf += ch;
        term.write(ch);
      }
    }
  });

  term.writeln(`\x1b[90mNetSim — ${device.name} (${device.kind}). Type 'help' for commands.\x1b[0m`);
  term.write(promptStr());

  const session: Session = {
    term, fit, opened: false,
    dispose() {
      if (disposed) return;
      // Invalidate callbacks before cancel(), which may synchronously call done.
      disposed = true;
      if (sessions.get(device.id) === session) sessions.delete(device.id);
      input.dispose();
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

export function disposeAllSessions(): void {
  for (const id of [...sessions.keys()]) disposeSession(id);
}
