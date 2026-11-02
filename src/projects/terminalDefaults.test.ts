import { expect, it } from 'vitest';
import { createEmptyProjectDocument, normalizeProjectDocument } from './projectDocument';
import { encodeDraftDocument } from './workspaceDocument';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { DEFAULT_TERMINAL_APPEARANCE, type TerminalAppearance } from '../terminalAppearance';

it('gives new projects explicit defaults that survive export, import and draft normalization', () => {
  const created = createEmptyProjectDocument();
  expect(created.topology.ui?.terminalAppearance).toEqual({ style: 'fx-signal-pulse', intensity: 100, fontFamily: 'consolas', fontSize: 14 });
  expect(created.topology.ui?.terminalAppearance).not.toBe(DEFAULT_TERMINAL_APPEARANCE);
  const imported = normalizeProjectDocument(JSON.parse(JSON.stringify(created)));
  expect(imported.topology.ui?.terminalAppearance).toEqual(created.topology.ui?.terminalAppearance);
  expect(encodeDraftDocument(imported).json).toBe(encodeDraftDocument(created).json);
  imported.topology.ui!.terminalAppearance!.intensity = 10;
  expect(createEmptyProjectDocument().topology.ui?.terminalAppearance?.intensity).toBe(100);
});

it.each([
  { style: 'diagonal', intensity: 80, fontFamily: 'system', fontSize: 14 },
  { style: 'dual-glow', intensity: 0, fontFamily: 'courier', fontSize: 18 },
  { style: 'fx-signal-pulse', intensity: 42, fontFamily: 'cascadia', fontSize: 12 },
] satisfies TerminalAppearance[])('preserves every existing saved/imported choice: %j', appearance => {
  const input = createEmptyProjectDocument();
  input.topology.ui = { terminalAppearance: { ...appearance } };
  const original = structuredClone(input);
  const normalized = normalizeProjectDocument(JSON.parse(JSON.stringify(input)));
  expect(normalized.topology.ui?.terminalAppearance).toEqual(appearance);
  const prepared = prepareTopologyDocument(normalized.topology);
  try { expect(prepared.presentation.terminalAppearance).toEqual(appearance); }
  finally { disposeNetwork(prepared.network); }
  expect(normalizeProjectDocument(normalized)).toEqual(normalized);
  expect(input).toEqual(original);
});

it.each([undefined, {}, { terminalAppearance: { intensity: 37 } }])('retains historical missing-field defaults in old documents: %j', ui => {
  const input = createEmptyProjectDocument();
  input.topology.ui = ui;
  const normalized = normalizeProjectDocument(input);
  expect(normalized.topology.ui?.terminalAppearance).toEqual({ style: 'diagonal', intensity: ui?.terminalAppearance?.intensity ?? 80, fontFamily: 'system', fontSize: 13 });
  expect(normalizeProjectDocument(normalized)).toEqual(normalized);
});
