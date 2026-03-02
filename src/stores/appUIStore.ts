import { create } from 'zustand';
import type { MiddlePanelView, DragTarget, ChannelType, AiChat } from '../types';

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
  return false;
}

interface AppUIState {
  middlePanelView: MiddlePanelView;
  channelWidth: number;
  dragging: DragTarget;
  isFullscreen: boolean;
  savedWidths: { channel: number; thread: number };
  settingsChannelId: string | null;
  joinChannelId: string | null;
  createChannelType: ChannelType | null;
  showCreateServer: boolean;
  activeAiChatId: string | null;
  aiChats: AiChat[];
  channelViewMap: Record<string, MiddlePanelView>;
  pendingThreadOpen: { channelId: string; workspaceId: string } | null;

  setMiddlePanelView: (view: MiddlePanelView) => void;
  setChannelView: (channelId: string, view: MiddlePanelView) => void;
  setChannelWidth: (width: number | ((prev: number) => number)) => void;
  setDragging: (target: DragTarget) => void;
  setIsFullscreen: (value: boolean) => void;
  setSavedWidths: (widths: { channel: number; thread: number }) => void;
  setSettingsChannelId: (id: string | null) => void;
  setJoinChannelId: (id: string | null) => void;
  setCreateChannelType: (type: ChannelType | null) => void;
  setShowCreateServer: (show: boolean) => void;
  setActiveAiChatId: (id: string | null) => void;
  setAiChats: (chats: AiChat[]) => void;
  upsertAiChat: (chat: Partial<AiChat> & { id: string }) => void;
  removeAiChat: (id: string) => void;
  prependAiChat: (chat: AiChat) => void;
  setPendingThreadOpen: (value: { channelId: string; workspaceId: string } | null) => void;
}

export const useAppUIStore = create<AppUIState>((set) => ({
  middlePanelView: 'chat',
  channelWidth: 220,
  dragging: null,
  isFullscreen: false,
  savedWidths: { channel: 220, thread: 0 },
  settingsChannelId: null,
  joinChannelId: null,
  createChannelType: null,
  showCreateServer: false,
  activeAiChatId: null,
  aiChats: [],
  channelViewMap: {},
  pendingThreadOpen: null,

  setMiddlePanelView: (view) => set({ middlePanelView: view }),

  setChannelView: (channelId, view) =>
    set((state) => ({
      middlePanelView: view,
      channelViewMap: { ...state.channelViewMap, [channelId]: view },
    })),

  setChannelWidth: (width) =>
    set((state) => ({
      channelWidth: typeof width === 'function' ? width(state.channelWidth) : width,
    })),

  setDragging: (target) => set({ dragging: target }),
  setIsFullscreen: (value) => set({ isFullscreen: value }),
  setSavedWidths: (widths) => set({ savedWidths: widths }),
  setSettingsChannelId: (id) => set({ settingsChannelId: id }),
  setJoinChannelId: (id) => set({ joinChannelId: id }),
  setCreateChannelType: (type) => set({ createChannelType: type }),
  setShowCreateServer: (show) => set({ showCreateServer: show }),
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
