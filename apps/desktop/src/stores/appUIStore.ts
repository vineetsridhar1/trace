import { create } from 'zustand';
import type { MiddlePanelView, DragTarget, ChannelType, AiChat, ProductDocMode } from '../types';

const CHANNEL_VIEW_MAP_KEY = 'trace:channelViewMap';
const WORKSPACE_SIDEBAR_OPEN_KEY = 'trace:workspaceSidebarOpen';
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
  workspaceSidebarWidth: number;
  workspaceSidebarOpen: boolean;
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
  setWorkspaceSidebarWidth: (width: number) => void;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  toggleWorkspaceSidebarOpen: () => void;
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
  setPendingThreadOpen: (value: { channelId: string; workspaceId: string } | null) => void;
}

const initialChannelViewMap = loadChannelViewMap();
const initialActiveChannelId = localStorage.getItem('activeChannelId');
const initialMiddlePanelView: MiddlePanelView =
  (initialActiveChannelId && initialChannelViewMap[initialActiveChannelId]) || 'chat';

export const useAppUIStore = create<AppUIState>((set) => ({
  middlePanelView: initialMiddlePanelView,
  channelWidth: 220,
  workspaceSidebarWidth: Number(localStorage.getItem('trace:workspaceSidebarWidth')) || 280,
  workspaceSidebarOpen: loadWorkspaceSidebarOpen(),
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

  setWorkspaceSidebarWidth: (width) => set({ workspaceSidebarWidth: width }),

  setWorkspaceSidebarOpen: (open) => {
    saveWorkspaceSidebarOpen(open);
    set({ workspaceSidebarOpen: open });
  },
  toggleWorkspaceSidebarOpen: () =>
    set((state) => {
      const next = !state.workspaceSidebarOpen;
      saveWorkspaceSidebarOpen(next);
      return { workspaceSidebarOpen: next };
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

  setPendingThreadOpen: (value) => set({ pendingThreadOpen: value }),
}));
