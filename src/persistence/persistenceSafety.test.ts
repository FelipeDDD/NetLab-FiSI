import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import { useStore } from '../store';
import { sim } from '../sim';
import { serializeNetwork } from '../engine/serialize';
import { LABS } from '../labs/library';
import { disposeAllSessions } from '../terminals';
import { confirmReplacement } from './replacement';

vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
const values = new Map<string, string>();
const key = 'netsim:autosave:v1';
const getItem = vi.fn((name: string) => values.get(name) ?? null);
const setItem = vi.fn((name: string, text: string) => { values.set(name, text); });
const store = () => useStore.getState();
let page: { origin: string; pathname: string; search: string; hash: string };

beforeEach(() => {
  vi.useFakeTimers(); values.clear(); getItem.mockReset(); setItem.mockReset();
  getItem.mockImplementation(name => values.get(name) ?? null);
  setItem.mockImplementation((name, text) => { values.set(name, text); });
  vi.stubGlobal('localStorage', { getItem, setItem });
  page = { origin: 'https://isolated.test', pathname: '/app.html', search: '?background=verde2', hash: '' };
  vi.stubGlobal('location', page);
  vi.stubGlobal('history', { replaceState: vi.fn((_a, _b, url: string) => { page.hash = url.startsWith('#') ? url : ''; }) });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } });
  store().boot(); store().newTopology(); store().flushAutosave();
  vi.mocked(disposeAllSessions).mockClear(); setItem.mockClear();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['{broken', '', JSON.stringify({ app: 'netsim', version: 2, devices: [], links: [] })])('protects an unreadable autosave through fallback, edits, flush and another boot (%#)', original => {
  values.set(key, original); store().boot();
  expect(store().nodes).toHaveLength(5);
  expect(store().autosaveBlocked).toBe(true); expect(store().protectedAutosave).toBe(original);
  expect(store().autosaveError).toContain('Original');
  store().addDeviceAt('host', { x: 0, y: 0 }); vi.advanceTimersByTime(1000); store().flushAutosave();
  expect(values.get(key)).toBe(original); expect(store().autosavePending).toBe(true);
  store().boot(); store().flushAutosave(); expect(values.get(key)).toBe(original);
});

it('downloads the exact original bytes without serializing the temporary demo', async () => {
  const original = ' \n{broken: ">ç"}'; values.set(key, original); store().boot();
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:isolated'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ click: vi.fn() }) });
  store().exportProtectedAutosave();
  expect(await blob!.text()).toBe(original); expect(values.get(key)).toBe(original);
});

it('starts despite read failure and never overwrites unknown stored data on retry', () => {
  const original = JSON.stringify(LABS[0]); values.set(key, original);
  getItem.mockImplementation(() => { throw Error('denied'); });
  expect(() => store().boot()).not.toThrow(); store().flushAutosave();
  expect(values.get(key)).toBe(original); expect(store().autosaveBlocked).toBe(true);
  getItem.mockImplementation(name => values.get(name) ?? null); store().retryAutosave();
  expect(values.get(key)).toBe(original); expect(store().protectedAutosave).toBe(original);
  expect(store().autosaveBlocked).toBe(true);
});

it('keeps failed writes pending and retries the latest in-memory configuration', () => {
  const original = values.get(key);
  setItem.mockImplementation(() => { throw Error('quota'); });
  store().addDeviceAt('host', { x: 1, y: 2 }); vi.advanceTimersByTime(500);
  expect(store().autosavePending).toBe(true); expect(store().autosaveError).toContain('Autosave fehlgeschlagen');
  expect(values.get(key)).toBe(original);
  const id = store().nodes[0].id; store().renameDevice(id, 'Emergency');
  setItem.mockImplementation((name, text) => { values.set(name, text); }); store().retryAutosave();
  expect(JSON.parse(values.get(key)!).devices[0].name).toBe('Emergency');
  expect(store().autosavePending).toBe(false); expect(store().autosaveError).toBeNull();
});

it('only replaces protected data through the explicit recovery action, refusing changed contents', () => {
  values.set(key, '{broken'); store().boot(); store().retryAutosave();
  expect(values.get(key)).toBe('{broken');
  values.set(key, 'changed externally'); store().saveTemporaryTopology();
  expect(values.get(key)).toBe('changed externally'); expect(store().autosaveBlocked).toBe(true);
  store().retryAutosave(); store().saveTemporaryTopology();
  expect(JSON.parse(values.get(key)!).devices).toHaveLength(5); expect(store().autosaveBlocked).toBe(false);
});

it('offers incoming Share Links without replacing local data and consumes the URL once', () => {
  store().addDeviceAt('host', { x: 4, y: 5 }); store().flushAutosave();
  const local = values.get(key)!;
  page.hash = '#t=' + LZString.compressToEncodedURIComponent(JSON.stringify(LABS[0]));
  store().boot();
  expect(store().nodes).toHaveLength(1); expect(values.get(key)).toBe(local); expect(store().pendingShare).not.toBeNull();
  expect(page.hash).toBe(''); expect(history.replaceState).toHaveBeenCalledWith(null, '', '/app.html?background=verde2');
  store().openPendingShare(); store().flushAutosave();
  expect(store().lab?.id).toBe(LABS[0].lab?.id); expect(store().pendingShare).toBeNull();
  const id = store().nodes[0].id; store().renameDevice(id, 'After shared import'); store().flushAutosave(); store().boot();
  expect(sim.net.devices.get(id)?.name).toBe('After shared import');
});

it('sharing never leaves a stale hash that can beat a newer autosave', async () => {
  store().addDeviceAt('host', { x: 0, y: 0 }); const id = store().nodes[0].id;
  store().shareUrl(); await Promise.resolve(); expect(store().shareLink).toContain('#t='); expect(page.hash).toBe('');
  store().renameDevice(id, 'Newest'); store().flushAutosave(); store().boot();
  expect(sim.net.devices.get(id)?.name).toBe('Newest');
});

it('offers a same-document Share Link without rebooting, disposing sessions or flushing pending edits', () => {
  store().addDeviceAt('host', { x: 0, y: 0 }); const net = sim.net, generation = store().topologyGeneration;
  vi.mocked(disposeAllSessions).mockClear();
  page.hash = '#t=' + LZString.compressToEncodedURIComponent(JSON.stringify(LABS[0])); store().receiveShareLink();
  expect(sim.net).toBe(net); expect(store().topologyGeneration).toBe(generation);
  expect(store().autosavePending).toBe(true); expect(disposeAllSessions).not.toHaveBeenCalled();
  expect(store().pendingShare).toBe(JSON.stringify(LABS[0])); expect(page.hash).toBe('');
  store().dismissPendingShare(); store().flushAutosave();
  expect(JSON.parse(values.get(key)!).devices).toHaveLength(1);
});

it.each(['missing-device', 'missing-interface', 'duplicate-link', 'unknown-kind', 'bad-position', 'bad-lab'] as const)('rejects %s without changing the network, sessions, history or saved bytes', problem => {
  store().loadBundledLab(0); store().flushAutosave();
  const net = sim.net, nodes = store().nodes, history = store().topologyHistory, original = values.get(key);
  const data = serializeNetwork(net, Object.fromEntries(nodes.map(n => [n.id, n.position])));
  if (problem === 'missing-device') data.links[0].a[0] = 'missing';
  if (problem === 'missing-interface') data.links[0].a[1] = 'eth999';
  if (problem === 'duplicate-link') data.links.push(data.links[0]);
  if (problem === 'unknown-kind') (data.devices[0] as { kind: string }).kind = 'future-device';
  if (problem === 'bad-position') data.devices[0].x = Infinity;
  if (problem === 'bad-lab') data.lab = { ...LABS[0].lab!, steps: null as never };
  const text = JSON.stringify(data); vi.mocked(disposeAllSessions).mockClear();
  expect(store().importJson(text)).not.toBeNull();
  expect(sim.net).toBe(net); expect(store().nodes).toBe(nodes); expect(store().topologyHistory).toBe(history);
  expect(disposeAllSessions).not.toHaveBeenCalled(); expect(values.get(key)).toBe(original);
  expect(store().rejectedDocument?.text).toBe(text);
});

it('captures A, prepares and activates B, then restores A without carrying runtime events or selections', () => {
  store().loadBundledLab(0); store().flushAutosave();
  const savedA = values.get(key)!, netA = sim.net;
  const idA = store().nodes[0].id; store().select(idA);
  store().startPacketCapture();
  const lateEvent = vi.fn(); netA.scheduler.schedule(500, lateEvent);
  const generation = store().topologyGeneration;
  expect(store().importJson(JSON.stringify(LABS[1]))).toBeNull();
  expect(store().topologyGeneration).toBe(generation + 1);
  expect(netA.scheduler.pending).toBe(0); expect(netA.devices.get(idA)?.disposed).toBe(true);
  expect(netA.onWireTransfer).toBeNull(); expect(netA.onClientConfiguration).toBeNull();
  netA.scheduler.advanceTo(5000); expect(lateEvent).not.toHaveBeenCalled();
  expect(store().selected).toBeNull(); expect(store().clock).toBe(0); expect(store().packetAnimationClock).toBe(0);
  expect(store().packets).toEqual([]); expect(store().packetCapture.records).toEqual([]);
  expect(store().packetCapture.status).toBe('stopped'); expect(store().topologyHistory).toEqual({ past: [], future: [] });
  expect(store().importJson(savedA)).toBeNull(); store().flushAutosave();
  expect(JSON.parse(values.get(key)!)).toEqual(JSON.parse(savedA));
});

it('validates import before asking to replace, and cancellation leaves pending work intact', () => {
  store().addDeviceAt('host', { x: 0, y: 0 }); const net = sim.net;
  const approve = vi.fn(() => false);
  expect(store().importJson('{broken', approve)).not.toBeNull(); expect(approve).not.toHaveBeenCalled();
  expect(store().importJson(JSON.stringify(LABS[0]), approve)).toBeNull(); expect(approve).toHaveBeenCalledOnce();
  expect(sim.net).toBe(net); expect(store().autosavePending).toBe(true);
});

it('requires conscious confirmation before UI replacement actions', () => {
  const action = vi.fn(); confirmReplacement(action, () => false); expect(action).not.toHaveBeenCalled();
  confirmReplacement(action, () => true); expect(action).toHaveBeenCalledOnce();
});
