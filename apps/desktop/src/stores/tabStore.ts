import { create } from 'zustand';
import type { ChannelType, MiddlePanelView } from '../types';

// ─── Types ────────────────────────────────────────────────────────────
export type GlobalTabType =
  | 'thread'
  | 'chat'
  | 'workspaces'
  | 'board'
  | 'projects'
  | 'documents'
  | 'pull-requests'
  | 'ai-chat'
  | 'terminal';

export interface GlobalTab {
  id: string;
  type: GlobalTabType;
  label: string;
  channelId?: string;
  channelName?: string;
  workspaceId?: string;
  aiChatId?: string;
  pinned?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────
const STORAGE_KEY = 'trace:globalTabs';
const TRANSIENT_VIEW_TAB_TYPES = new Set<GlobalTabType>(['workspaces', 'board']);

/** Map view tab types to their MiddlePanelView counterpart */
export const TAB_TYPE_TO_VIEW: Partial<Record<GlobalTabType, MiddlePanelView>> = {
  chat: 'chat',
  workspaces: 'workspaces',
  board: 'board',
  projects: 'projects',
  documents: 'documents',
  'pull-requests': 'pull-requests',
};

export const TAB_LABELS: Record<GlobalTabType, string> = {
  thread: 'Thread',
  chat: 'Chat',
  workspaces: 'Workspaces',
  board: 'Tracker',
  projects: 'Projects',
  documents: 'Docs',
  'pull-requests': 'PRs',
  'ai-chat': 'AI Chat',
  terminal: 'Terminal',
};

/** All view-type tabs that can be opened (excludes thread / ai-chat which have their own flows). */
export const VIEW_TAB_TYPES: GlobalTabType[] = [
  'chat',
  'projects',
  'documents',
  'pull-requests',
  'terminal',
];

/** Check whether a view tab type is available for the given channel configuration. */
export function isViewTabAvailable(
  type: GlobalTabType,
  channelType: ChannelType,
  workspacesEnabled: boolean,
  hasGithubUrl: boolean,
  hasRepoPath: boolean,
): boolean {
  if (type === 'chat') return true;
  if (type === 'terminal') return hasRepoPath;
  if (channelType === 'channel') return false;
  if (type === 'workspaces') return workspacesEnabled;
  if (type === 'board') return true;
  if (type === 'projects') return channelType === 'team';
  if (type === 'documents') return workspacesEnabled;
  if (type === 'pull-requests') return workspacesEnabled && hasGithubUrl;
  return false;
}

// ─── Persistence helpers ──────────────────────────────────────────────
interface PersistedState {
  tabs: GlobalTab[];
  activeTabId: string | null;
}

function loadPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { tabs: [], activeTabId: null };
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter((tab): tab is GlobalTab =>
          !!tab &&
          typeof tab === 'object' &&
          typeof tab.id === 'string' &&
          typeof tab.type === 'string' &&
          !TRANSIENT_VIEW_TAB_TYPES.has(tab.type as GlobalTabType),
        )
      : [];
    const activeTabId =
      typeof parsed.activeTabId === 'string' && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : null;
    return {
      tabs,
      activeTabId,
    };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function persistState(tabs: GlobalTab[], activeTabId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {
    // Quota error — ignore
  }
}

// ─── Store ────────────────────────────────────────────────────────────
interface GlobalTabStore {
  tabs: GlobalTab[];
  activeTabId: string | null;

  openTab: (tab: GlobalTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  openThreadTab: (channelId: string, channelName: string, workspaceId: string, label: string) => void;
  openViewTab: (channelId: string, channelName: string, viewType: GlobalTabType) => void;
  openAiChatTab: (chatId: string, title: string) => void;
  openTerminalTab: (channelId: string, channelName: string) => void;
  closeTabsForWorkspace: (workspaceId: string) => void;
  closeTabsForAiChat: (chatId: string) => void;
  updateTabLabel: (tabId: string, label: string) => void;
}

const initial = loadPersistedState();

/** Pick the nearest neighbor tab after removing the tab at `closedIdx`. */
function selectNeighbor(remainingTabs: GlobalTab[], closedIdx: number): string | null {
  if (remainingTabs.length === 0) return null;
  const neighborIdx = closedIdx > 0 ? closedIdx - 1 : 0;
  return remainingTabs[Math.min(neighborIdx, remainingTabs.length - 1)].id;
}

export const useTabStore = create<GlobalTabStore>((set, get) => ({
  tabs: initial.tabs,
  activeTabId: initial.activeTabId,

  openTab: (tab) => {
    set((s) => {
      // Check if tab already exists
      const existing = s.tabs.find((t) => t.id === tab.id);
      if (existing) {
        persistState(s.tabs, existing.id);
        return { activeTabId: existing.id };
      }
      const newTabs = [...s.tabs, tab];
      persistState(newTabs, tab.id);
      return { tabs: newTabs, activeTabId: tab.id };
    });
  },

  closeTab: (tabId) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return s;

      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      const newActiveId = s.activeTabId === tabId
        ? selectNeighbor(newTabs, idx)
        : s.activeTabId;

      persistState(newTabs, newActiveId);
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId) => {
    set((s) => {
      if (tabId === null) {
        persistState(s.tabs, null);
        return { activeTabId: null };
      }
      if (!s.tabs.some((t) => t.id === tabId)) return s;
      persistState(s.tabs, tabId);
      return { activeTabId: tabId };
    });
  },

  openThreadTab: (channelId, channelName, workspaceId, label) => {
    const tabId = `thread-${workspaceId}`;
    const existing = get().tabs.find((t) => t.type === 'thread' && t.workspaceId === workspaceId);
    if (existing) {
      // Update label if changed, then activate
      set((s) => {
        const updatedTabs = s.tabs.map((t) =>
          t.id === existing.id ? { ...t, label: `${label} — #${channelName}` } : t,
        );
        persistState(updatedTabs, existing.id);
        return { tabs: updatedTabs, activeTabId: existing.id };
      });
      return;
    }
    const tab: GlobalTab = {
      id: tabId,
      type: 'thread',
      label: `${label} — #${channelName}`,
      channelId,
      channelName,
      workspaceId,
    };
    get().openTab(tab);
  },

  openViewTab: (channelId, channelName, viewType) => {
    const tabId = `view-${viewType}-${channelId}`;
    const existing = get().tabs.find(
      (t) => t.type === viewType && t.channelId === channelId,
    );
    if (existing) {
      set((s) => {
        persistState(s.tabs, existing.id);
        return { activeTabId: existing.id };
      });
      return;
    }
    const label = `${TAB_LABELS[viewType]} — #${channelName}`;
    const tab: GlobalTab = {
      id: tabId,
      type: viewType,
      label,
      channelId,
      channelName,
    };
    get().openTab(tab);
  },

  openAiChatTab: (chatId, title) => {
    const existing = get().tabs.find((t) => t.type === 'ai-chat' && t.aiChatId === chatId);
    if (existing) {
      set((s) => {
        const updatedTabs = s.tabs.map((t) =>
          t.id === existing.id ? { ...t, label: title || 'AI Chat' } : t,
        );
        persistState(updatedTabs, existing.id);
        return { tabs: updatedTabs, activeTabId: existing.id };
      });
      return;
    }
    const tab: GlobalTab = {
      id: `ai-chat-${chatId}`,
      type: 'ai-chat',
      label: title || 'AI Chat',
      aiChatId: chatId,
    };
    get().openTab(tab);
  },

  openTerminalTab: (channelId, channelName) => {
    const tabId = `terminal-${channelId}`;
    const existing = get().tabs.find((t) => t.id === tabId);
    if (existing) {
      set((s) => {
        persistState(s.tabs, existing.id);
        return { activeTabId: existing.id };
      });
      return;
    }
    const tab: GlobalTab = {
      id: tabId,
      type: 'terminal',
      label: `Terminal — #${channelName}`,
      channelId,
      channelName,
    };
    get().openTab(tab);
  },

  closeTabsForWorkspace: (workspaceId) => {
    const tab = get().tabs.find((t) => t.type === 'thread' && t.workspaceId === workspaceId);
    if (tab) get().closeTab(tab.id);
  },

  closeTabsForAiChat: (chatId) => {
    const tab = get().tabs.find((t) => t.type === 'ai-chat' && t.aiChatId === chatId);
    if (tab) get().closeTab(tab.id);
  },

  updateTabLabel: (tabId, label) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return s;
      const newTabs = s.tabs.map((t) => (t.id === tabId ? { ...t, label } : t));
      persistState(newTabs, s.activeTabId);
      return { tabs: newTabs };
    });
  },
}));
