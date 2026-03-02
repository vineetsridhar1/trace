import { create } from 'zustand';
import type { MiddlePanelView, DragTarget, ChannelType, AiChat } from '../types';

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
  pendingThreadOpen: { channelId: string; workspaceId: string } | null;

  setMiddlePanelView: (view: MiddlePanelView) => void;
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
  pendingThreadOpen: null,

  setMiddlePanelView: (view) => set({ middlePanelView: view }),

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
