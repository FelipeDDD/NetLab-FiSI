import type { Network } from '../engine/network';
import { disposeNetwork } from '../engine/networkLifecycle';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { readCableColors, type CableAppearances } from '../cableAppearance';
import { readTerminalAppearance, readTerminalColors, type AppearanceSaveFile, type TerminalAppearance } from '../terminalAppearance';
import { normalizeTerminalLayoutMode, type TerminalLayoutMode } from '../terminalPanels';
import type { LabDef, LabProgress } from '../labs/types';
import { readAreaMarkings, type AreaMarking } from '../areaMarkings';

export interface TopologyDocumentState {
  nodes: readonly { id: string; position: { x: number; y: number } }[];
  terminalColors: Record<string, string>;
  terminalAppearance: TerminalAppearance;
  cableColors: CableAppearances;
  areaMarkings?: readonly AreaMarking[];
  terminalLayoutMode: TerminalLayoutMode;
  lab: LabDef | null;
  labStep: number;
  labResults: LabProgress['results'];
  quizAnswers: LabProgress['quiz'];
}

/** Own the snapshot; subsequent UI, quiz and engine edits cannot mutate it. */
export function captureTopologyDocument(net: Network, state: TopologyDocumentState): AppearanceSaveFile {
  const positions = Object.fromEntries(state.nodes.map(n => [n.id, { ...n.position }]));
  const save: AppearanceSaveFile = serializeNetwork(net, positions);
  save.ui = { terminalAppearance: { ...state.terminalAppearance } };
  if (Object.keys(state.terminalColors).length) save.ui.terminalColors = { ...state.terminalColors };
  const colors = readCableColors(state.cableColors, net.links.keys());
  if (Object.keys(colors).length) save.ui.cableColors = colors;
  if (state.terminalLayoutMode !== 'free') save.ui.terminalLayoutMode = state.terminalLayoutMode;
  const markings = readAreaMarkings(state.areaMarkings, net.devices.keys());
  if (markings.length) save.ui.areaMarkings = markings;
  if (state.lab) {
    save.lab = state.lab;
    save.labProgress = { step: state.labStep, results: state.labResults, quiz: state.quizAnswers };
  }
  return structuredClone(save);
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validateLabMetadata(data: AppearanceSaveFile): void {
  const fail = () => { throw new Error('Invalid Lab metadata'); };
  if (data.lab !== undefined) {
    const lab = data.lab;
    if (!object(lab) || !['id', 'title', 'blurb'].every(k => typeof lab[k] === 'string') || !Array.isArray(lab.steps) || !lab.steps.length) fail();
    for (const step of lab.steps) {
      if (!object(step) || typeof step.title !== 'string' || typeof step.body !== 'string' || !Array.isArray(step.objectives)) fail();
      for (const objective of step.objectives) {
        if (!object(objective) || typeof objective.id !== 'string' || typeof objective.label !== 'string' || !object(objective.check)) fail();
        const check = objective.check as unknown as Record<string, unknown>;
        const fields: Record<string, string[]> = {
          'iface-ip': ['device', 'iface'], 'default-route': ['device'], forwarding: ['device'],
          'fw-policy': ['device', 'hook', 'policy'], ping: ['from', 'expect'], tcp: ['from', 'expect'],
          dns: ['from', 'name', 'expect'], http: ['from', 'url', 'expect'],
        };
        if (typeof check.type !== 'string' || !Object.hasOwn(fields, check.type) || !fields[check.type].every(k => typeof check[k] === 'string')) fail();
        if (check.type === 'forwarding' && typeof check.expect !== 'boolean') fail();
        if (check.type === 'tcp' && (!Number.isInteger(check.port) || Number(check.port) < 1 || Number(check.port) > 65535)) fail();
      }
      if (step.quiz !== undefined && (!Array.isArray(step.quiz) || step.quiz.some(q => !object(q) || typeof q.q !== 'string' || !Array.isArray(q.options) || !q.options.every((o: unknown) => typeof o === 'string') || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length))) fail();
    }
  }
  if (data.labProgress !== undefined) {
    const p = data.labProgress;
    if (!object(p)) fail();
    if (p.step !== undefined && (!Number.isInteger(p.step) || p.step < 0 || (data.lab && p.step >= data.lab.steps.length))) fail();
    if (p.results !== undefined && (!object(p.results) || Object.values(p.results).some(r => !object(r) || typeof r.pass !== 'boolean' || typeof r.detail !== 'string'))) fail();
    if (p.quiz !== undefined && (!object(p.quiz) || Object.values(p.quiz).some(v => !Number.isInteger(v) || v < 0))) fail();
  }
}

export interface PreparedTopology {
  document: AppearanceSaveFile;
  network: Network;
  presentation: {
    terminalColors: Record<string, string>;
    terminalAppearance: TerminalAppearance;
    cableColors: CableAppearances;
    terminalLayoutMode: TerminalLayoutMode;
    areaMarkings: AreaMarking[];
  };
}

/** Parse and fully prepare off to the side. No sim/store/storage/session access. */
export function prepareTopologyDocument(input: unknown): PreparedTopology {
  const document = (typeof input === 'string' ? JSON.parse(input) : structuredClone(input)) as AppearanceSaveFile;
  // restoreNetwork validates the structural boundary before allocating devices.
  const network = restoreNetwork(document);
  try {
    validateLabMetadata(document);
    return {
      document, network,
      presentation: {
        terminalColors: readTerminalColors(document), terminalAppearance: readTerminalAppearance(document),
        cableColors: readCableColors(document.ui?.cableColors, network.links.keys()),
        terminalLayoutMode: normalizeTerminalLayoutMode(document.ui?.terminalLayoutMode),
        areaMarkings: readAreaMarkings(document.ui?.areaMarkings, network.devices.keys()),
      },
    };
  } catch (error) {
    disposeNetwork(network);
    throw error;
  }
}
