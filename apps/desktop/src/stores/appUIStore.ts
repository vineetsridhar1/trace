import { create } from 'zustand';
import type { MiddlePanelView, DragTarget, ChannelType, AiChat, ProductDocMode } from '../types';

const CHANNEL_VIEW_MAP_KEY = 'trace:channelViewMap';
const MAIN_NAV_COLLAPSED_KEY = 'trace:mainNavCollapsed';
const WORKSPACE_SIDEBAR_OPEN_KEY = 'trace:workspaceSidebarOpen';
const WORKSPACE_SIDEBAR_DOCK_SIDE_KEY = 'trace:workspaceSidebarDockSide';
const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 220;
const MIN_WORKSPACE_SIDEBAR_WIDTH = 180;
const MAX_WORKSPACE_SIDEBAR_WIDTH = 500;
const VALID_VIEWS: MiddlePanelView[] = ['chat', 'workspaces', 'documents', 'board', 'projects'];

function loadChannelViewMap(): Record<string, MiddlePanelView> {
  try {
    const raw = localStorage.getItem(CHANNEL_VIEW_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: Record<string, MiddlePanelView> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && VALID_VIEWS.includes(value as MiddlePanelView)) {
        result[key] = value as MiddlePanelView;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveChannelViewMap(map: Record<string, MiddlePanelView>): void {
  try {
    localStorage.setItem(CHANNEL_VIEW_MAP_KEY, JSON.stringify(map));
  } catch {
    // Quota error — ignore
  }
}

function loadMainNavCollapsed(): boolean {
  try {
    return localStorage.getItem(MAIN_NAV_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveMainNavCollapsed(isCollapsed: boolean): void {
  try {
    localStorage.setItem(MAIN_NAV_COLLAPSED_KEY, String(isCollapsed));
  } catch {
    // Quota error — ignore
  }
}

function loadWorkspaceSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(WORKSPACE_SIDEBAR_OPEN_KEY);
    if (raw === null) return typeof window === 'undefined' ? true : window.innerWidth > 768;
    return raw === 'true';
  } catch {
    return true;
  }
}

function saveWorkspaceSidebarOpen(isOpen: boolean): void {
  try {
    localStorage.setItem(WORKSPACE_SIDEBAR_OPEN_KEY, String(isOpen));
  } catch {
    // Quota error — ignore
  }
}

function loadWorkspaceSidebarDockSide(): 'left' | 'right' {
  try {
    const raw = localStorage.getItem(WORKSPACE_SIDEBAR_DOCK_SIDE_KEY);
    return raw === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

function saveWorkspaceSidebarDockSide(side: 'left' | 'right'): void {
  try {
    localStorage.setItem(WORKSPACE_SIDEBAR_DOCK_SIDE_KEY, side);
  } catch {
    // Quota error — ignore
  }
}

function loadWorkspaceSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem('trace:workspaceSidebarWidth'));
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_WORKSPACE_SIDEBAR_WIDTH;
    return Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, Math.max(MIN_WORKSPACE_SIDEBAR_WIDTH, raw));
  } catch {
    return DEFAULT_WORKSPACE_SIDEBAR_WIDTH;
  }
}

/** Check whether a saved view is still valid for a given channel configuration. */
export function isViewValidForChannel(
  view: MiddlePanelView,
  channelType: ChannelType,
  workspacesEnabled: boolean,
): boolean {
  if (view === 'chat') return true;
  if (channelType === 'channel') return false;
  if (view === 'board') return true; // valid for team + project
  if (view === 'projects') return channelType === 'team';
  if (view === 'workspaces') return workspacesEnabled;
  if (view === 'documents') return workspacesEnabled;
  return false;
}

/** Return the default view for a channel based on its type and workspace config. */
export function getDefaultViewForChannel(
  channelType: ChannelType,
  workspacesEnabled: boolean,
): MiddlePanelView {
  if ((channelType === 'team' || channelType === 'project') && workspacesEnabled) {
    return 'workspaces';
  }
  return 'chat';
}

interface AppUIState {
  middlePanelView: MiddlePanelView;
  channelWidth: number;
  mainNavCollapsed: boolean;
  dragging: DragTarget;
  isFullscreen: boolean;
  savedWidths: { channel: number; thread: number };
  showSettings: boolean;
  settingsSection: string; // 'trace' or a channel ID
  settingsChannelId: string | null;
  joinChannelId: string | null;
  createChannelType: ChannelType | null;
  showCreateServer: boolean;
  showProductDocModal: boolean;
  activeProductDocId: string | null;
  productDocMode: ProductDocMode;
  productDocSessionMap: Record<ProductDocMode, string | null>;
  activeAiChatId: string | null;
  aiChats: AiChat[];
  channelViewMap: Record<string, MiddlePanelView>;
  showNewWorkspaceModal: boolean;
  addTabMenuOpen: boolean;
  pendingThreadOpen: { channelId: string; workspaceId: string } | null;
  workspaceSidebarWidth: number;
  workspaceSidebarOpen: boolean;
  workspaceSidebarDockSide: 'left' | 'right';
  mobileDrawerOpen: boolean;
  showInstanceSettings: boolean;

  openSettings: (section?: string) => void;
  closeSettings: () => void;
  setSettingsSection: (section: string) => void;
  setShowInstanceSettings: (show: boolean) => void;
  setShowNewWorkspaceModal: (show: boolean) => void;
  setAddTabMenuOpen: (open: boolean) => void;
  toggleAddTabMenuOpen: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setMiddlePanelView: (view: MiddlePanelView) => void;
  setChannelView: (channelId: string, view: MiddlePanelView) => void;
  setChannelWidth: (width: number | ((prev: number) => number)) => void;
  setMainNavCollapsed: (collapsed: boolean) => void;
  toggleMainNavCollapsed: () => void;
  setDragging: (target: DragTarget) => void;
  setIsFullscreen: (value: boolean) => void;
  setSavedWidths: (widths: { channel: number; thread: number }) => void;
  setSettingsChannelId: (id: string | null) => void;
  setJoinChannelId: (id: string | null) => void;
  setCreateChannelType: (type: ChannelType | null) => void;
  setShowCreateServer: (show: boolean) => void;
  setShowProductDocModal: (show: boolean) => void;
  setActiveProductDocId: (id: string | null) => void;
  setProductDocMode: (mode: ProductDocMode) => void;
  setProductDocSessionForMode: (mode: ProductDocMode, sessionId: string | null) => void;
  resetProductDocSessions: () => void;
  setActiveAiChatId: (id: string | null) => void;
  setAiChats: (chats: AiChat[]) => void;
  upsertAiChat: (chat: Partial<AiChat> & { id: string }) => void;
  removeAiChat: (id: string) => void;
  prependAiChat: (chat: AiChat) => void;
  setWorkspaceSidebarWidth: (width: number) => void;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  setWorkspaceSidebarDockSide: (side: 'left' | 'right') => void;
  toggleWorkspaceSidebarOpen: () => void;
  setPendingThreadOpen: (value: { channelId: string; workspaceId: string } | null) => void;
}

const initialChannelViewMap = loadChannelViewMap();
const initialActiveChannelId = localStorage.getItem('activeChannelId');
const initialMiddlePanelView: MiddlePanelView =
  (initialActiveChannelId && initialChannelViewMap[initialActiveChannelId]) || 'chat';

export const useAppUIStore = create<AppUIState>((set) => ({
  middlePanelView: initialMiddlePanelView,
  channelWidth: 220,
  mainNavCollapsed: loadMainNavCollapsed(),
  dragging: null,
  isFullscreen: false,
  savedWidths: { channel: 220, thread: 0 },
  showSettings: false,
  settingsSection: 'trace',
  settingsChannelId: null,
  joinChannelId: null,
  createChannelType: null,
  showCreateServer: false,
  showProductDocModal: false,
  activeProductDocId: null,
  productDocMode: 'prd',
  productDocSessionMap: { prd: null, 'tech-scope': null, tickets: null },
  activeAiChatId: null,
  aiChats: [],
  channelViewMap: initialChannelViewMap,
  showNewWorkspaceModal: false,
  addTabMenuOpen: false,
  pendingThreadOpen: null,
  workspaceSidebarWidth: loadWorkspaceSidebarWidth(),
  workspaceSidebarOpen: loadWorkspaceSidebarOpen(),
  workspaceSidebarDockSide: loadWorkspaceSidebarDockSide(),
  mobileDrawerOpen: false,
  showInstanceSettings: false,

  openSettings: (section) => set({ showSettings: true, settingsSection: section ?? 'trace' }),
  closeSettings: () => set({ showSettings: false }),
  setSettingsSection: (section) => set({ settingsSection: section }),
  setShowInstanceSettings: (show) => set(show ? { showSettings: true, settingsSection: 'trace' } : { showSettings: false }),
  setShowNewWorkspaceModal: (show) => set({ showNewWorkspaceModal: show }),
  setAddTabMenuOpen: (open) => set({ addTabMenuOpen: open }),
  toggleAddTabMenuOpen: () => set((state) => ({ addTabMenuOpen: !state.addTabMenuOpen })),
  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
  setMiddlePanelView: (view) => set({ middlePanelView: view }),

  setChannelView: (channelId, view) =>
    set((state) => {
      const channelViewMap = { ...state.channelViewMap, [channelId]: view };
      saveChannelViewMap(channelViewMap);
      return { middlePanelView: view, channelViewMap };
    }),

  setChannelWidth: (width) =>
    set((state) => ({
      channelWidth: typeof width === 'function' ? width(state.channelWidth) : width,
    })),

  setMainNavCollapsed: (collapsed) => {
    saveMainNavCollapsed(collapsed);
    set({ mainNavCollapsed: collapsed });
  },
  toggleMainNavCollapsed: () =>
    set((state) => {
      const next = !state.mainNavCollapsed;
      saveMainNavCollapsed(next);
      return { mainNavCollapsed: next };
    }),

  setDragging: (target) => set({ dragging: target }),
  setIsFullscreen: (value) => set({ isFullscreen: value }),
  setSavedWidths: (widths) => set({ savedWidths: widths }),
  setSettingsChannelId: (id) => set(id ? { settingsChannelId: id, showSettings: true, settingsSection: id } : { settingsChannelId: null }),
  setJoinChannelId: (id) => set({ joinChannelId: id }),
  setCreateChannelType: (type) => set({ createChannelType: type }),
  setShowCreateServer: (show) => set({ showCreateServer: show }),
  setShowProductDocModal: (show) => set({ showProductDocModal: show }),
  setActiveProductDocId: (id) => set({ activeProductDocId: id }),
  setProductDocMode: (mode) => set({ productDocMode: mode }),
  setProductDocSessionForMode: (mode, sessionId) =>
    set((state) => ({
      productDocSessionMap: { ...state.productDocSessionMap, [mode]: sessionId },
    })),
  resetProductDocSessions: () =>
    set({ productDocSessionMap: { prd: null, 'tech-scope': null, tickets: null } }),
  setActiveAiChatId: (id) => set({ activeAiChatId: id }),
  setAiChats: (chats) => set({ aiChats: chats }),

  upsertAiChat: (chat) =>
    set((state) => ({
      aiChats: state.aiChats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
    })),

  removeAiChat: (id) =>
    set((state) => ({
      aiChats: state.aiChats.filter((c) => c.id !== id),
    })),

  prependAiChat: (chat) =>
    set((state) => ({
      aiChats: [chat, ...state.aiChats],
    })),

  setWorkspaceSidebarWidth: (width) => set({ workspaceSidebarWidth: width }),

  setWorkspaceSidebarOpen: (open) => {
    saveWorkspaceSidebarOpen(open);
    set({ workspaceSidebarOpen: open });
  },
  setWorkspaceSidebarDockSide: (side) => {
    saveWorkspaceSidebarDockSide(side);
    set({ workspaceSidebarDockSide: side });
  },
  toggleWorkspaceSidebarOpen: () =>
    set((state) => {
      const next = !state.workspaceSidebarOpen;
      saveWorkspaceSidebarOpen(next);
      return { workspaceSidebarOpen: next };
    }),
  setPendingThreadOpen: (value) => set({ pendingThreadOpen: value }),
}));
