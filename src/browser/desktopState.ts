import {create} from 'zustand';
import type {Host} from '../engine/ipdevice';
export interface BrowserTab {
  id: number;
  device: Host;
}

interface DesktopState {
  device: Host | null;
  view: 'desktop' | 'browser';
  tabs: BrowserTab[];
  activeTab: number | null;
  limitReached: boolean;
  open(device: Host): void;
  openBrowser(device: Host): void;
  addTab(): void;
  selectTab(id: number): void;
  closeTab(id: number): void;
  showDesktop(): void;
  close(): void;
  prune(valid: (device: Host) => boolean): void;
}

export const MAX_BROWSER_TABS = 3;

const showTab = (tab: BrowserTab) => ({
  device: tab.device, view: 'browser' as const, activeTab: tab.id, limitReached: false,
});

/** Ephemeral state for the app's shared desktop and browser frame. */
export const useDesktop = create<DesktopState>((set, get) => {
  let nextId = 1;
  const createTab = (device: Host) => {
    const { tabs } = get();
    if (tabs.length >= MAX_BROWSER_TABS) {
      set({ ...showTab(tabs.find(tab => tab.id === get().activeTab) ?? tabs[0]), limitReached: true });
      return;
    }
    const tab = { id: nextId++, device };
    set({ ...showTab(tab), tabs: [...tabs, tab] });
  };
  return {
    device: null, view: 'desktop', tabs: [], activeTab: null, limitReached: false,
    open: device => set(state => state.device === device ? state : { device, view: 'desktop', limitReached: false }),
    openBrowser: device => {
      const { tabs, activeTab } = get();
      const existing = tabs.find(tab => tab.id === activeTab && tab.device === device)
        ?? tabs.find(tab => tab.device === device);
      if (existing) set(showTab(existing));
      else createTab(device);
    },
    addTab: () => {
      const { device } = get();
      if (device) createTab(device);
    },
    selectTab: id => {
      const tab = get().tabs.find(tab => tab.id === id);
      if (tab) set(showTab(tab));
    },
    closeTab: id => set(state => {
      const index = state.tabs.findIndex(tab => tab.id === id);
      if (index < 0 || state.tabs.length === 1) return state;
      const tabs = state.tabs.filter(tab => tab.id !== id);
      return state.activeTab === id
        ? { ...showTab(tabs[Math.min(index, tabs.length - 1)]), tabs }
        : { tabs, limitReached: false };
    }),
    showDesktop: () => set({ view: 'desktop', limitReached: false }),
    close: () => set({ device: null, view: 'desktop', limitReached: false }),
    prune: valid => set(state => {
      const tabs = state.tabs.filter(tab => valid(tab.device));
      const active = tabs.find(tab => tab.id === state.activeTab);
      if (tabs.length === state.tabs.length && (!state.device || valid(state.device))) return state;
      return { tabs, activeTab: active?.id ?? null, limitReached: false,
        ...(state.device && !valid(state.device) ? { device: null, view: 'desktop' as const } : {}) };
    }),
  };
});
