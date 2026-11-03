import type { Network } from './engine/network';

/** Local, read-only observation of the real xterm submission path. No replay or probes. */
export interface TerminalCommandContext {
  readonly id: number;
  readonly network: Network;
  readonly deviceId: string;
  readonly line: string;
  readonly source: 'keyboard' | 'quick-ping' | 'api';
}
export type TerminalCommandEvent = { command: TerminalCommandContext } &
  ({ type: 'started' } | { type: 'finished'; reason: 'completed' | 'interrupt' } | { type: 'output'; text: string });
const listeners = new Set<(event: TerminalCommandEvent) => void>();
let sequence = 0;
export function observeTerminalCommands(listener: (event: TerminalCommandEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function emitTerminalCommand(event: TerminalCommandEvent) {
  for (const listener of listeners) {
    try { listener(event); } catch { /* Help/learning observers cannot interrupt a terminal. */ }
  }
}
export function startTerminalCommand(context: Omit<TerminalCommandContext, 'id'>): TerminalCommandContext {
  const command = { ...context, id: ++sequence };
  emitTerminalCommand({ type: 'started', command });
  return command;
}
