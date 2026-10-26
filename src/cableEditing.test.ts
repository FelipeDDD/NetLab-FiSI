import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CABLE_COLORS, readCableColors, type CableColor } from './cableAppearance';
import { serializeNetwork } from './engine/serialize';
import { sim } from './sim';
import { useStore } from './store';

// Keep the real store/history/engine, isolating the browser-only xterm boundary.
vi.mock('./terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
let saved: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); saved = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  useStore.getState().loadDemo();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const first = () => [...sim.net.links.values()][0];
const manual = (color: CableColor) => ({ mode: 'manual', color: CABLE_COLORS[color].value });

it('preview, occupied-target rejection and cancellation preserve the original engine, timers, history and color', () => {
  const link = first(), state = useStore.getState(); state.setCableColor(link.id, 'purple');
  const snapshot = serializeNetwork(sim.net, {}), pending = sim.net.scheduler.pending, history = useStore.getState().topologyHistory;
  state.beginCableReconnect(link.id, 'b');
  expect(useStore.getState().reconnectCable('dev-2', 'eth0')).toContain('belegt');
  state.cancelCableReconnect();
  expect(serializeNetwork(sim.net, {})).toEqual(snapshot); expect(sim.net.links.get(link.id)).toBe(link);
  expect(sim.net.scheduler.pending).toBe(pending); expect(useStore.getState().topologyHistory).toBe(history);
  expect(useStore.getState().cableColors[link.id]).toEqual(manual('purple')); expect(useStore.getState().reconnectingCable).toBeNull();
});

it.each(['a', 'b'] as const)('reconnects end %s as one undoable operation and preserves color, selection and unrelated devices', end => {
  const state = useStore.getState(), link = first(), before = link[end], other = link[end === 'a' ? 'b' : 'a'];
  state.setCableColor(link.id, 'green'); state.select('dev-4');
  const survivor = sim.net.devices.get('dev-5'), node = state.nodes.find(n => n.id === 'dev-5');
  state.beginCableReconnect(link.id, end);
  const dest = end === 'a' ? sim.net.devices.get('dev-4')! : sim.net.devices.get('dev-3')!;
  const port = end === 'a' ? 'eth3' : 'eth7';
  expect(state.reconnectCable(dest.id, port)).toBeNull();
  expect(link[end]).toBe(dest.getInterface(port)); expect(other.link).toBe(link);
  expect(useStore.getState().topologyHistory.past.at(-1)?.type).toBe('reconnect-link');
  state.undoTopology(); expect(link[end]).toBe(before); expect(sim.net.links.get(link.id)).toBe(link);
  state.redoTopology(); expect(link[end]).toBe(dest.getInterface(port));
  expect(useStore.getState().cableColors[link.id]).toEqual(manual('green')); expect(useStore.getState().selected).toBe('dev-4');
  expect(sim.net.devices.get('dev-5')).toBe(survivor);
  expect(useStore.getState().nodes.find(n => n.id === 'dev-5')?.position).toEqual(node?.position);
});

it('undo and redo color changes without changing the simulated network', () => {
  const state = useStore.getState(), link = first(), snapshot = serializeNetwork(sim.net, {});
  state.setCableColor(link.id, 'red'); state.setCableColor(link.id, 'blue');
  state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('red'));
  state.redoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('blue'));
  state.setCableColor(link.id, 'gray'); expect(useStore.getState().cableColors[link.id]).toEqual(manual('gray'));
  state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('blue'));
  expect(serializeNetwork(sim.net, {})).toEqual(snapshot);
});

it.each(['edge', 'device'] as const)('restores cable colors after %s deletion and undo, and removes orphan presentation data', kind => {
  const state = useStore.getState(), link = first(); state.setCableColor(link.id, 'yellow');
  if (kind === 'edge') state.onEdgesChange([{ id: link.id, type: 'remove' }]);
  else state.deleteTopologyElements([link.a.device.id]);
  expect(useStore.getState().cableColors[link.id]).toBeUndefined(); expect(sim.net.links.has(link.id)).toBe(false);
  state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('yellow')); expect(sim.net.links.has(link.id)).toBe(true);
  state.redoTopology(); expect(useStore.getState().cableColors[link.id]).toBeUndefined(); expect(sim.net.links.has(link.id)).toBe(false);
});

it('persists color and exact endpoints through autosave and JSON import, and loads old files without colors', () => {
  const state = useStore.getState(), id = first().id; state.setCableColor(id, 'purple');
  state.beginCableReconnect(id, 'b'); expect(state.reconnectCable('dev-3', 'eth7')).toBeNull(); state.flushAutosave();
  const json = saved.get('netsim:autosave:v1')!, data = JSON.parse(json);
  expect(data.ui.cableColors).toMatchObject({ [id]: manual('purple') }); expect(data.links.find((l: { id: string }) => l.id === id).b).toEqual(['dev-3', 'eth7']);
  expect(data.links.every((l: object) => !('color' in l))).toBe(true); // presentation is separate
  state.newTopology(); expect(useStore.getState().cableColors).toEqual({});
  expect(state.importJson(json)).toBeNull(); expect(useStore.getState().cableColors[id]).toEqual(manual('purple'));
  expect(sim.net.links.get(id)?.b.name).toBe('eth7');
  delete data.ui.cableColors; expect(state.importJson(JSON.stringify(data))).toBeNull(); expect(useStore.getState().cableColors).toEqual({});
});

it('ignores unsupported colors, unknown links and malformed imported appearance data', () => {
  expect(readCableColors({ a: 'red', b: 'neon', c: 'gray', orphan: 'green' }, ['a', 'b', 'c'])).toEqual({ a: manual('red'), c: manual('gray') });
  expect(readCableColors(['red'], ['0'])).toEqual({});
  expect(readCableColors(null, ['a'])).toEqual({});
});

it('preserves a colored WLAN association when disconnected through its existing Inspector controls and undone', () => {
  const state = useStore.getState(); state.newTopology();
  state.addDeviceAt('notebook', { x: 0, y: 0 }); state.addDeviceAt('ap', { x: 50, y: 0 });
  const [notebook, ap] = [...sim.net.devices.values()];
  expect(state.associateWireless(notebook.id, ap.id)).toBeNull();
  const link = first(); state.setCableColor(link.id, 'blue');
  expect(state.associateWireless(notebook.id, null)).toBeNull();
  expect(useStore.getState().cableColors[link.id]).toBeUndefined();
  state.undoTopology();
  expect(sim.net.links.get(link.id)?.medium).toBe('wireless');
  expect(useStore.getState().cableColors[link.id]).toEqual(manual('blue'));
});

it('automatically reconnects into the first free port, reports occupied targets and preserves cancellation state', () => {
  const state = useStore.getState(), link = first(), original = link.b;
  state.beginCableReconnect(link.id, 'b');
  expect(state.reconnectCable('dev-2')).toContain('keine freie');
  expect(useStore.getState().reconnectingCable?.id).toBe(link.id); expect(link.b).toBe(original);
  expect(state.reconnectCable('dev-4')).toBeNull(); expect(link.b.name).toBe('eth2');
  expect(sim.net.links.get(link.id)).toBe(link);
});

it.each([
  { end: 'a' as const, manualColor: false }, { end: 'b' as const, manualColor: false },
  { end: 'a' as const, manualColor: true }, { end: 'b' as const, manualColor: true },
])('restores original end $end (manual: $manualColor) without changing ports, color, history or pending deliveries', ({ end, manualColor }) => {
  const state = useStore.getState(), link = first(), port = link[end];
  link.latency = 137;
  if (manualColor) state.setCableColor(link.id, 'purple');
  state.beginCableReconnect(link.id, end);
  const before = serializeNetwork(sim.net, {}), history = useStore.getState().topologyHistory;
  const colors = useStore.getState().cableColors, pending = sim.net.scheduler.pending;
  expect(state.reconnectCable(port.device.id)).toBeNull();
  expect(useStore.getState().reconnectingCable).toBeNull();
  expect(link[end]).toBe(port); expect(port.link).toBe(link); expect(sim.net.links.get(link.id)).toBe(link);
  expect(serializeNetwork(sim.net, {})).toEqual(before);
  expect(useStore.getState().cableColors).toBe(colors); expect(useStore.getState().topologyHistory).toBe(history);
  expect(sim.net.scheduler.pending).toBe(pending);
});

it('recalculates automatic color on reconnect, replays exact colors and ports, and keeps explicit gray manual', () => {
  const state = useStore.getState(), link = first(), before = useStore.getState().cableColors[link.id];
  state.addDeviceAt('ap', { x: 300, y: 100 }); const ap = [...sim.net.devices.values()].find(d => d.kind === 'ap')!;
  state.beginCableReconnect(link.id, 'a'); expect(state.reconnectCable(ap.id)).toBeNull();
  const after = useStore.getState().cableColors[link.id]; expect(after.mode).toBe('auto'); expect(after.color).toBe('#f472b6');
  state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(before); expect(link.a.device.id).toBe('dev-1');
  state.redoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(after); expect(link.a.device).toBe(ap);
  state.setCableColor(link.id, 'gray'); state.beginCableReconnect(link.id, 'a'); expect(state.reconnectCable('dev-1')).toBeNull();
  expect(useStore.getState().cableColors[link.id]).toEqual(manual('gray'));
  state.resetCableColor(link.id); expect(useStore.getState().cableColors[link.id].mode).toBe('auto');
  state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('gray'));
});

it('persists an automatically allocated new connection through add/delete history and imports legacy manual choices unchanged', () => {
  const state = useStore.getState(); state.addDeviceAt('ap', { x: 300, y: 100 });
  const ap = [...sim.net.devices.values()].find(d => d.kind === 'ap')!;
  state.onConnect({ source: 'dev-4', target: ap.id, sourceHandle: 'r', targetHandle: 'l' });
  const link = [...sim.net.links.values()].at(-1)!, color = useStore.getState().cableColors[link.id];
  expect(color).toEqual({ mode: 'auto', color: '#f472b6' });
  state.undoTopology(); expect(sim.net.links.has(link.id)).toBe(false);
  state.redoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(color);
  state.deleteTopologyElements([], [link.id]); state.undoTopology(); expect(useStore.getState().cableColors[link.id]).toEqual(color);
  const data = { ...serializeNetwork(sim.net, {}), ui: { cableColors: { [link.id]: 'red' } } };
  expect(state.importJson(JSON.stringify(data))).toBeNull(); expect(useStore.getState().cableColors[link.id]).toEqual(manual('red'));
});
