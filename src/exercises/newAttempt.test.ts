import { beforeEach, expect, it, vi } from 'vitest';
import { openNewLearningAttempt } from './newAttempt';
import { createEmptyProjectDocument } from '../projects/projectDocument';
import type { ProjectDocument } from '../projects/types';
import type { SessionResult } from '../persistence/sessionTypes';
import type { TerminalAppearance } from '../terminalAppearance';
import type { TerminalLayoutMode } from '../terminalPanels';

const store = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }));
vi.mock('../store', () => ({ useStore: store }));
const appearance: TerminalAppearance = { style: 'dual-glow', intensity: 37, fontFamily: 'courier', fontSize: 18 };
let state: { terminalAppearance: TerminalAppearance; terminalLayoutMode: TerminalLayoutMode; terminalDockCollapsed: boolean;
  workspaceIdentity: { draftId: string }; terminals: string[]; terminalPanels: { id: string; tabs: string[] }[];
  terminalColors: Record<string,string>; terminalDockHeight: number };
beforeEach(() => {
  vi.clearAllMocks();
  state = { terminalAppearance: { ...appearance }, terminalLayoutMode: 'by-type', terminalDockCollapsed: true,
    workspaceIdentity: { draftId: 'personal' }, terminals: ['personal-host'], terminalPanels: [{ id: 'old', tabs: ['personal-host'] }],
    terminalColors: { 'personal-host': '#abcdef' }, terminalDockHeight: 310 };
  store.getState.mockImplementation(() => state);
  store.setState.mockImplementation(patch => Object.assign(state, patch));
});

it.each([true, false])('inherits only appearance/layout and initial collapsed=%s without modifying the template', async collapsed => {
  state.terminalDockCollapsed = collapsed;
  const template = createEmptyProjectDocument(), original = structuredClone(template);
  let received!: ProjectDocument;
  const openDocument = vi.fn(async (document: ProjectDocument): Promise<SessionResult<string>> => {
    received = document;
    state.workspaceIdentity = { draftId: 'attempt' }; state.terminals = []; state.terminalPanels = []; state.terminalDockCollapsed = false;
    return { ok: true, value: 'attempt' };
  });
  expect(await openNewLearningAttempt({ openDocument }, template)).toEqual({ ok: true, value: 'attempt' });
  expect(received.topology.ui).toEqual({ terminalAppearance: appearance, terminalLayoutMode: 'by-type' });
  expect(received.topology.ui?.terminalAppearance).not.toBe(state.terminalAppearance);
  expect(state.terminalDockCollapsed).toBe(collapsed);
  expect(store.setState).toHaveBeenCalledWith({ terminalDockCollapsed: collapsed });
  expect(state.terminalDockHeight).toBe(310); expect(template).toEqual(original);
  expect(received.topology.devices).toEqual([]); expect(state.terminals).toEqual([]); expect(state.terminalPanels).toEqual([]);
});

it('captures preferences before awaiting activation and gives each new attempt an independent copy', async () => {
  let resolve!: (result: SessionResult<string>) => void, received!: ProjectDocument;
  const openDocument = vi.fn((document: ProjectDocument) => { received = document; return new Promise<SessionResult<string>>(r => { resolve = r; }); });
  const pending = openNewLearningAttempt({ openDocument }, createEmptyProjectDocument());
  state.terminalAppearance.intensity = 99; state.terminalLayoutMode = 'free'; state.workspaceIdentity = { draftId: 'attempt' }; state.terminals = [];
  resolve({ ok: true, value: 'attempt' }); await pending;
  expect(received.topology.ui).toEqual({ terminalAppearance: appearance, terminalLayoutMode: 'by-type' });
});

it.each(['failure', 'other-draft', 'terminal-opened'] as const)('does not apply a stale collapsed flag after %s', async scenario => {
  const openDocument = vi.fn(async (): Promise<SessionResult<string>> => {
    state.terminalDockCollapsed = false;
    state.workspaceIdentity = { draftId: scenario === 'other-draft' ? 'another' : 'attempt' };
    state.terminals = scenario === 'terminal-opened' ? ['new-terminal'] : [];
    return scenario === 'failure' ? { ok: false, error: { code: 'not-started', message: 'Unavailable' } } : { ok: true, value: 'attempt' };
  });
  await openNewLearningAttempt({ openDocument }, createEmptyProjectDocument());
  expect(store.setState).not.toHaveBeenCalled(); expect(state.terminalDockCollapsed).toBe(false);
});
