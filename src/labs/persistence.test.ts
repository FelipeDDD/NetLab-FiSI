import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import { useStore } from '../store';
import { sim } from '../sim';
import { serializeNetwork, type SaveFile } from '../engine/serialize';
import { disposeAllSessions } from '../terminals';
import { LABS } from './library';
import { EXAMPLES } from './examples';

// Exercise the real loading/persistence paths, without importing xterm's DOM renderer.
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));

const storage = new Map<string, string>();
const autosaveKey = 'netsim:autosave:v1';
let page: { origin: string; pathname: string; hash: string };
const writeText = vi.fn(async (_value: string) => {});
const cases = [...LABS.map((file, index) => ({ title: file.lab!.title, file, load: () => useStore.getState().loadBundledLab(index) })),
  ...EXAMPLES.map((example, index) => ({ title: example.title, file: example.file, load: () => useStore.getState().loadExample(index) }))];

beforeEach(() => {
  vi.useFakeTimers(); storage.clear(); writeText.mockClear();
  page = { origin: 'https://netlab.test', pathname: '/app.html', hash: '' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('location', page);
  vi.stubGlobal('history', { replaceState: (_state: unknown, _title: string, url: string) => { page.hash = url.startsWith('#') ? url : ''; } });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  useStore.getState().newTopology(); useStore.getState().flushAutosave();
  storage.clear(); vi.mocked(disposeAllSessions).mockClear();
});
afterEach(() => {
  useStore.getState().flushAutosave();
  useStore.getState().setNotice(null);
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

function assertLoaded(file: SaveFile) {
  const state = useStore.getState();
  expect(state.nodes.map(node => node.id)).toEqual(file.devices.map(device => device.id));
  expect(state.edges.map(edge => edge.id)).toEqual(file.links.map(link => link.id));
  expect(state.lab?.id).toBe(file.lab?.id);
  for (const saved of file.links) {
    const link = sim.net.links.get(saved.id)!;
    expect([link.a.device.id, link.a.name]).toEqual(saved.a);
    expect([link.b.device.id, link.b.name]).toEqual(saved.b);
  }
  for (const device of file.devices.filter(device => device.kind === 'switch')) {
    expect(sim.net.devices.get(device.id)!.interfaces).toHaveLength(8);
  }
}

it.each(cases)('$title loads through the store and survives autosave, import and Share Link', async ({ file, load }) => {
  load(); assertLoaded(file);
  useStore.getState().flushAutosave();
  const json = storage.get(autosaveKey)!;
  const saved = JSON.parse(json) as SaveFile;
  expect(saved.lab?.id).toBe(file.lab?.id);
  for (const device of saved.devices.filter(device => device.kind === 'switch')) expect(device.ifaces).toHaveLength(8);
  const canonical = serializeNetwork(sim.net, {});
  useStore.getState().boot(); assertLoaded(file);
  expect(serializeNetwork(sim.net, {})).toEqual(canonical);
  expect(useStore.getState().importJson(json)).toBeNull(); assertLoaded(file);
  expect(serializeNetwork(sim.net, {})).toEqual(canonical);
  useStore.getState().shareUrl(); await Promise.resolve();
  const url = writeText.mock.calls.at(-1)![0];
  const shared = JSON.parse(LZString.decompressFromEncodedURIComponent(new URL(url).hash.slice(3))!);
  expect(shared).toEqual(saved);
  useStore.getState().boot(); assertLoaded(file);
  expect(serializeNetwork(sim.net, {})).toEqual(canonical);
});

it.each(['import', 'autosave', 'share'] as const)('migrates a legacy empty interface list through %s without losing cables', channel => {
  const file = structuredClone(LABS[3]);
  for (const device of file.devices.filter(device => device.kind === 'switch')) device.ifaces = [];
  const json = JSON.stringify(file);
  if (channel === 'import') expect(useStore.getState().importJson(json)).toBeNull();
  else if (channel === 'autosave') { storage.set(autosaveKey, json); useStore.getState().boot(); }
  else { page.hash = '#t=' + LZString.compressToEncodedURIComponent(json); useStore.getState().boot(); useStore.getState().openPendingShare(); }
  assertLoaded(file);
  useStore.getState().flushAutosave();
  useStore.getState().shareUrl();
  const sharedHash = new URL(useStore.getState().shareLink!).hash;
  const saved = JSON.parse(LZString.decompressFromEncodedURIComponent(sharedHash.slice(3))!) as SaveFile;
  expect(saved.devices.find(device => device.kind === 'switch')!.ifaces).toHaveLength(8);
});

it('rejects an invalid import before disposing the current sessions or replacing the network', () => {
  useStore.getState().loadBundledLab(0);
  vi.mocked(disposeAllSessions).mockClear();
  const net = sim.net, nodes = useStore.getState().nodes;
  const invalid = structuredClone(LABS[0]);
  invalid.devices.find(device => device.kind === 'switch')!.ifaces = [{ name: 'eth9', ip: null, up: true }];
  expect(useStore.getState().importJson(JSON.stringify(invalid))).toContain('Invalid switch port layout');
  expect(disposeAllSessions).not.toHaveBeenCalled();
  expect(sim.net).toBe(net); expect(useStore.getState().nodes).toBe(nodes);
});
