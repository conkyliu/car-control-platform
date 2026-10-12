import { create } from 'zustand';
import { RoutePath } from '../router/routes.ts';

export interface NavTabItem {
  key: string;
  title: string;
  closable: boolean;
  icon?: string;
}

export interface NavTabsState {
  activeKey: string;
  tabs: NavTabItem[];
  refreshCount: Record<string, number>;

  openTab: (tab: { key: string; title: string; closable?: boolean; icon?: string }) => void;
  switchTab: (key: string) => void;
  closeTab: (key: string) => void;
  closeOthers: (key: string) => void;
  closeAll: () => void;
  refreshTab: (key: string) => void;
  resetTabs: () => void;
}

const DEFAULT_TAB: NavTabItem = {
  key: RoutePath.DASHBOARD,
  title: '运营看板',
  closable: false,
};

export const useNavTabsStore = create<NavTabsState>((set, get) => ({
  activeKey: DEFAULT_TAB.key,
  tabs: [DEFAULT_TAB],
  refreshCount: {},

  openTab: (tab) => {
    const { tabs } = get();
    const existingIndex = tabs.findIndex((t) => t.key === tab.key);

    if (existingIndex >= 0) {
      set({ activeKey: tab.key });
      return;
    }

    const newTabItem: NavTabItem = {
      key: tab.key,
      title: tab.title,
      closable: tab.closable ?? (tab.key !== DEFAULT_TAB.key),
      icon: tab.icon,
    };

    set({
      tabs: [...tabs, newTabItem],
      activeKey: tab.key,
    });
  },

  switchTab: (key) => {
    const { tabs } = get();
    if (tabs.some((t) => t.key === key)) {
      set({ activeKey: key });
    }
  },

  closeTab: (key) => {
    const { tabs, activeKey } = get();
    const targetTab = tabs.find((t) => t.key === key);

    // Non-closable tabs cannot be removed
    if (!targetTab || targetTab.closable === false) {
      return;
    }

    const targetIndex = tabs.findIndex((t) => t.key === key);
    let nextActiveKey = activeKey;

    if (activeKey === key) {
      if (targetIndex > 0) {
        nextActiveKey = tabs[targetIndex - 1]!.key;
      } else if (tabs.length > 1) {
        nextActiveKey = tabs[targetIndex + 1]!.key;
      } else {
        nextActiveKey = DEFAULT_TAB.key;
      }
    }

    const filtered = tabs.filter((t) => t.key !== key);
    set({
      tabs: filtered,
      activeKey: nextActiveKey,
    });
  },

  closeOthers: (targetKey) => {
    const { tabs } = get();
    const filtered = tabs.filter((t) => t.closable === false || t.key === targetKey);

    set({
      tabs: filtered,
      activeKey: targetKey,
    });
  },

  closeAll: () => {
    const { tabs } = get();
    const unclosable = tabs.filter((t) => t.closable === false);
    const fallbackTabs = unclosable.length > 0 ? unclosable : [DEFAULT_TAB];

    set({
      tabs: fallbackTabs,
      activeKey: fallbackTabs[0]!.key,
    });
  },

  refreshTab: (key) => {
    set((state) => ({
      refreshCount: {
        ...state.refreshCount,
        [key]: (state.refreshCount[key] ?? 0) + 1,
      },
    }));
  },

  resetTabs: () => {
    set({
      activeKey: DEFAULT_TAB.key,
      tabs: [DEFAULT_TAB],
      refreshCount: {},
    });
  },
}));
