import { expect, it, vi } from 'vitest';
import { useStore } from '../store';

vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));

it('fences the old key permanently before asynchronous normal boot, including legacy retry actions', () => {
  vi.useFakeTimers();
  const original = JSON.stringify({ app: 'netsim', version: 1, devices: [], links: [] });
  const getItem = vi.fn(() => original), setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem, setItem });
  try {
    const store = () => useStore.getState();
    store().protectLegacyAutosave();
    store().addDeviceAt('host', { x: 10, y: 20 });
    store().boot(); store().retryAutosave(); store().saveTemporaryTopology();
    vi.advanceTimersByTime(2000); store().flushAutosave();
    expect(store().nodes).toHaveLength(1); expect(store().autosaveBlocked).toBe(true);
    expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled();
    const changed = vi.fn(), flush = vi.fn();
    const detach = store().attachWorkspacePersistence({ changed, flush });
    store().renameDevice(store().nodes[0].id, 'workspace edit'); store().flushAutosave();
    expect(changed).toHaveBeenCalled(); expect(flush).toHaveBeenCalled(); detach();
    store().retryAutosave(); store().flushAutosave(); expect(setItem).not.toHaveBeenCalled();
  } finally { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
