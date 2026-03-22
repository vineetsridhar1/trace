import { create } from "zustand";
import { useEntityStore } from "./entity";

export type ActivePage = "main" | "settings" | "inbox";

interface UIState {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  activeSessionGroupId: string | null;
  setActiveSessionGroupId: (groupId: string | null, sessionId?: string | null) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string | null) => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  refreshTick: number;
  triggerRefresh: () => void;
  unreadChatIds: Record<string, boolean>;
  markChatUnread: (chatId: string) => void;
  markChatRead: (chatId: string) => void;
  _restoreNav: (
    channelId: string | null,
    sessionGroupId: string | null,
    sessionId: string | null,
    page?: ActivePage,
    chatId?: string | null,
  ) => void;
}

export function buildPath(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
): string {
  if (page === "settings") return "/settings";
  if (page === "inbox") return "/inbox";
  if (chatId) return `/dm/${chatId}`;
  if (channelId && sessionGroupId && sessionId) return `/c/${channelId}/g/${sessionGroupId}/s/${sessionId}`;
  if (channelId && sessionGroupId) return `/c/${channelId}/g/${sessionGroupId}`;
  if (sessionGroupId && sessionId) return `/g/${sessionGroupId}/s/${sessionId}`;
  if (sessionGroupId) return `/g/${sessionGroupId}`;
  if (channelId) return `/c/${channelId}`;
  return "/";
}

function pushNav(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
) {
  const path = buildPath(channelId, sessionGroupId, sessionId, page, chatId);
  history.pushState({ channelId, sessionGroupId, sessionId, page, chatId }, "", path);
}

function persistActiveChannelId(channelId: string | null) {
  if (channelId) {
    localStorage.setItem("trace:activeChannelId", channelId);
  } else {
    localStorage.removeItem("trace:activeChannelId");
  }
}

function resolveChannelIdForSessionGroup(
  sessionGroupId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionGroupId) return fallback;
  const sessionGroup = useEntityStore.getState().sessionGroups[sessionGroupId];
  const channel = sessionGroup?.channel as { id: string } | null | undefined;
  return channel?.id ?? fallback;
}

function resolveChannelIdForSession(
  sessionId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionId) return fallback;
  const session = useEntityStore.getState().sessions[sessionId];
  const channel = session?.channel as { id: string } | null | undefined;
  if (channel?.id) return channel.id;
  return resolveChannelIdForSessionGroup(session?.sessionGroupId ?? null, fallback);
}

function resolveSessionGroupIdForSession(
  sessionId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionId) return fallback;
  const session = useEntityStore.getState().sessions[sessionId];
  return session?.sessionGroupId ?? fallback;
}

export const useUIStore = create<UIState>((set, get) => ({
  activePage: "main",
  activeChannelId: null,
  activeChatId: null,
  activeSessionGroupId: null,
  activeSessionId: null,
  activeTerminalId: null,
  activeThreadId: null,
  refreshTick: 0,
  unreadChatIds: {},
  triggerRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),

  setActivePage: (page) => {
    set({ activePage: page });
    if (page === "settings") {
      pushNav(null, null, null, "settings");
      return;
    }
    if (page === "inbox") {
      pushNav(null, null, null, "inbox");
      return;
    }

    pushNav(
      get().activeChannelId,
      get().activeSessionGroupId,
      get().activeSessionId,
      "main",
      get().activeChatId,
    );
  },

  setActiveChannelId: (id) => {
    persistActiveChannelId(id);
    set({
      activePage: "main",
      activeChannelId: id,
      activeChatId: null,
      activeSessionGroupId: null,
      activeSessionId: null,
      activeTerminalId: null,
      activeThreadId: null,
    });
    pushNav(id, null, null);
  },

  markChatUnread: (chatId) => {
    set((s) => {
      if (s.unreadChatIds[chatId]) return s;
      return { unreadChatIds: { ...s.unreadChatIds, [chatId]: true } };
    });
  },

  markChatRead: (chatId) => {
    set((s) => {
      if (!s.unreadChatIds[chatId]) return s;
      const { [chatId]: _, ...rest } = s.unreadChatIds;
      return { unreadChatIds: rest };
    });
  },

  setActiveChatId: (id) => {
    set((s) => {
      let unreadChatIds = s.unreadChatIds;
      if (id && unreadChatIds[id]) {
        const { [id]: _, ...rest } = unreadChatIds;
        unreadChatIds = rest;
      }
      return {
        activePage: "main" as ActivePage,
        activeChatId: id,
        activeChannelId: null,
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
        activeThreadId: null,
        unreadChatIds,
      };
    });
    pushNav(null, null, null, "main", id);
  },

  setActiveSessionGroupId: (groupId, sessionId) => {
    const currentChannelId = get().activeChannelId;
    if (groupId === null) {
      set({
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
      });
      pushNav(currentChannelId, null, null);
      return;
    }

    const nextSessionId = sessionId ?? get().activeSessionId;
    const channelId = resolveChannelIdForSessionGroup(groupId, currentChannelId);
    persistActiveChannelId(channelId);
    set({
      activePage: "main",
      activeChatId: null,
      activeChannelId: channelId,
      activeSessionGroupId: groupId,
      activeSessionId: nextSessionId,
      activeTerminalId: null,
    });
    pushNav(channelId, groupId, nextSessionId);
  },

  setActiveSessionId: (id) => {
    const currentChannelId = get().activeChannelId;
    const currentSessionGroupId = get().activeSessionGroupId;
    if (id === null) {
      set({
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
      });
      pushNav(currentChannelId, null, null);
      return;
    }

    const sessionGroupId = resolveSessionGroupIdForSession(id, currentSessionGroupId);
    const channelId = resolveChannelIdForSessionGroup(
      sessionGroupId,
      resolveChannelIdForSession(id, currentChannelId),
    );
    persistActiveChannelId(channelId);
    set({
      activeChannelId: channelId,
      activeSessionGroupId: sessionGroupId,
      activeSessionId: id,
      activeTerminalId: null,
    });
    pushNav(channelId, sessionGroupId, id);
  },

  setActiveTerminalId: (id) => {
    set({ activeTerminalId: id });
  },

  setActiveThreadId: (id) => {
    set({ activeThreadId: id });
  },

  _restoreNav: (channelId, sessionGroupId, sessionId, page, chatId) => {
    persistActiveChannelId(channelId);
    set({
      activePage: page ?? "main",
      activeChannelId: channelId,
      activeSessionGroupId: sessionGroupId,
      activeSessionId: sessionId,
      activeTerminalId: null,
      activeChatId: chatId ?? null,
      activeThreadId: null,
    });
  },
}));

export function navigateToSession(
  channelId: string | null,
  sessionGroupId: string,
  sessionId: string,
): void {
  const fallbackChannelId = useUIStore.getState().activeChannelId;
  const resolvedChannelId =
    resolveChannelIdForSessionGroup(
      sessionGroupId,
      resolveChannelIdForSession(sessionId, channelId ?? fallbackChannelId),
    );
  useUIStore.getState()._restoreNav(resolvedChannelId, sessionGroupId, sessionId, "main", null);
  const path = buildPath(resolvedChannelId, sessionGroupId, sessionId, "main");
  history.pushState(
    { channelId: resolvedChannelId, sessionGroupId, sessionId, page: "main", chatId: null },
    "",
    path,
  );
}
