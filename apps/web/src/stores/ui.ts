import { create } from "zustand";
import { useEntityStore } from "./entity";
import { getSessionChannelId, getSessionGroupChannelId } from "../lib/session-group";

export type ActivePage = "main" | "settings" | "inbox" | "tickets" | "agent-debug";

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
  lastSelectedSessionIdsByGroup: Record<string, string>;
  openSessionTabsByGroup: Record<string, string[]>;
  openSessionTab: (groupId: string, sessionId: string) => void;
  closeSessionTab: (groupId: string, sessionId: string) => void;
  initSessionTabs: (groupId: string, sessionIds: string[]) => void;
  restoreLastVisited: (tab: "dm" | "main") => void;
  unreadChatIds: Record<string, boolean>;
  markChatUnread: (chatId: string) => void;
  markChatRead: (chatId: string) => void;
  channelDoneBadges: Record<string, boolean>;
  markChannelDone: (channelId: string) => void;
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
  if (page === "tickets") return "/tickets";
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

function replaceNav(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
) {
  const path = buildPath(channelId, sessionGroupId, sessionId, page, chatId);
  history.replaceState({ channelId, sessionGroupId, sessionId, page, chatId }, "", path);
}

function persistActiveChannelId(channelId: string | null) {
  if (channelId) {
    localStorage.setItem("trace:activeChannelId", channelId);
  } else {
    localStorage.removeItem("trace:activeChannelId");
  }
}

function persistActiveChatId(chatId: string | null) {
  if (chatId) {
    localStorage.setItem("trace:activeChatId", chatId);
  } else {
    localStorage.removeItem("trace:activeChatId");
  }
}

function persistActiveSessionNav(sessionGroupId: string | null, sessionId: string | null) {
  if (sessionGroupId) {
    localStorage.setItem("trace:activeSessionGroupId", sessionGroupId);
  } else {
    localStorage.removeItem("trace:activeSessionGroupId");
  }
  if (sessionId) {
    localStorage.setItem("trace:activeSessionId", sessionId);
  } else {
    localStorage.removeItem("trace:activeSessionId");
  }
}

function resolveChannelIdForSessionGroup(
  sessionGroupId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionGroupId) return fallback;
  const sessions = Object.values(useEntityStore.getState().sessions).filter(
    (session) => session.sessionGroupId === sessionGroupId,
  );
  const sessionGroup = useEntityStore.getState().sessionGroups[sessionGroupId];
  return getSessionGroupChannelId(sessionGroup, sessions) ?? fallback;
}

function resolveChannelIdForSession(
  sessionId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionId) return fallback;
  const session = useEntityStore.getState().sessions[sessionId];
  const channelId = getSessionChannelId(session);
  if (channelId) return channelId;
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
  lastSelectedSessionIdsByGroup: {},
  openSessionTabsByGroup: {},
  unreadChatIds: {},
  channelDoneBadges: {},
  triggerRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),

  openSessionTab: (groupId, sessionId) => {
    set((s) => {
      const existing = s.openSessionTabsByGroup[groupId] ?? [];
      if (existing.includes(sessionId)) return s;
      return {
        openSessionTabsByGroup: {
          ...s.openSessionTabsByGroup,
          [groupId]: [...existing, sessionId],
        },
      };
    });
  },

  closeSessionTab: (groupId, sessionId) => {
    const state = get();
    const existing = state.openSessionTabsByGroup[groupId] ?? [];
    if (existing.length <= 1) return;
    const idx = existing.indexOf(sessionId);
    if (idx === -1) return;
    const next = existing.filter((id) => id !== sessionId);
    const updates: Partial<UIState> = {
      openSessionTabsByGroup: {
        ...state.openSessionTabsByGroup,
        [groupId]: next,
      },
    };
    if (state.activeSessionId === sessionId) {
      const adjacentIdx = Math.min(idx, next.length - 1);
      const adjacentId = next[adjacentIdx];
      updates.activeSessionId = adjacentId;
      updates.lastSelectedSessionIdsByGroup = {
        ...state.lastSelectedSessionIdsByGroup,
        [groupId]: adjacentId,
      };
      const channelId = resolveChannelIdForSessionGroup(groupId, state.activeChannelId);
      persistActiveSessionNav(groupId, adjacentId);
      replaceNav(channelId, groupId, adjacentId);
    }
    set(updates);
  },

  initSessionTabs: (groupId, sessionIds) => {
    set((s) => {
      if (s.openSessionTabsByGroup[groupId]) return s;
      return {
        openSessionTabsByGroup: {
          ...s.openSessionTabsByGroup,
          [groupId]: sessionIds,
        },
      };
    });
  },

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
    if (page === "tickets") {
      pushNav(null, null, null, "tickets");
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
    set((s) => {
      let channelDoneBadges = s.channelDoneBadges;
      if (id && channelDoneBadges[id]) {
        const { [id]: _, ...rest } = channelDoneBadges;
        channelDoneBadges = rest;
      }
      return {
        activePage: "main" as ActivePage,
        activeChannelId: id,
        activeChatId: null,
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
        activeThreadId: null,
        channelDoneBadges,
      };
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

  markChannelDone: (channelId) => {
    set((s) => {
      if (s.channelDoneBadges[channelId]) return s;
      return { channelDoneBadges: { ...s.channelDoneBadges, [channelId]: true } };
    });
  },

  setActiveChatId: (id) => {
    persistActiveChatId(id);
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

    const nextSessionId =
      sessionId
      ?? getPreferredSessionIdForGroup(
        groupId,
        get().activeSessionGroupId === groupId ? get().activeSessionId : null,
      );
    const channelId = resolveChannelIdForSessionGroup(groupId, currentChannelId);
    persistActiveChannelId(channelId);
    persistActiveSessionNav(groupId, nextSessionId);
    set((state) => {
      let channelDoneBadges = state.channelDoneBadges;
      if (channelId && channelDoneBadges[channelId]) {
        const { [channelId]: _, ...rest } = channelDoneBadges;
        channelDoneBadges = rest;
      }
      return {
        activePage: "main" as ActivePage,
        activeChatId: null,
        activeChannelId: channelId,
        activeSessionGroupId: groupId,
        activeSessionId: nextSessionId,
        activeTerminalId: null,
        channelDoneBadges,
        lastSelectedSessionIdsByGroup:
          nextSessionId
            ? { ...state.lastSelectedSessionIdsByGroup, [groupId]: nextSessionId }
            : state.lastSelectedSessionIdsByGroup,
      };
    });
    pushNav(channelId, groupId, nextSessionId);
  },

  setActiveSessionId: (id) => {
    const currentChannelId = get().activeChannelId;
    const currentSessionGroupId = get().activeSessionGroupId;
    if (id === null) {
      persistActiveSessionNav(null, null);
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
    persistActiveSessionNav(sessionGroupId, id);
    // If staying within the same session group (tab switching), replace history
    // so browser back goes to the sessions table instead of the previous tab
    const stayingInGroup = sessionGroupId === currentSessionGroupId && currentSessionGroupId !== null;
    set((state) => ({
      activeChannelId: channelId,
      activeSessionGroupId: sessionGroupId,
      activeSessionId: id,
      activeTerminalId: null,
      lastSelectedSessionIdsByGroup:
        sessionGroupId
          ? { ...state.lastSelectedSessionIdsByGroup, [sessionGroupId]: id }
          : state.lastSelectedSessionIdsByGroup,
    }));
    if (stayingInGroup) {
      replaceNav(channelId, sessionGroupId, id);
    } else {
      pushNav(channelId, sessionGroupId, id);
    }
  },

  setActiveTerminalId: (id) => {
    set({ activeTerminalId: id });
  },

  setActiveThreadId: (id) => {
    set({ activeThreadId: id });
  },

  restoreLastVisited: (tab) => {
    if (tab === "dm") {
      const chatId = localStorage.getItem("trace:activeChatId");
      if (chatId) get().setActiveChatId(chatId);
    } else {
      const storedChannelId = localStorage.getItem("trace:activeChannelId");
      const sessionGroupId = localStorage.getItem("trace:activeSessionGroupId");
      const sessionId = localStorage.getItem("trace:activeSessionId");
      // Resolve channel from session context so it's consistent even if
      // a plain channel click updated activeChannelId in localStorage
      const channelId = sessionGroupId
        ? resolveChannelIdForSessionGroup(sessionGroupId, storedChannelId)
        : storedChannelId;
      if (channelId || sessionGroupId) {
        // Set Zustand state directly — don't re-persist to localStorage
        // since we're reading from it and don't want cross-tab clearing
        set((state) => ({
          activePage: "main" as ActivePage,
          activeChannelId: channelId,
          activeSessionGroupId: sessionGroupId,
          activeSessionId: sessionId,
          activeTerminalId: null,
          activeChatId: null,
          activeThreadId: null,
          lastSelectedSessionIdsByGroup:
            sessionGroupId && sessionId
              ? { ...state.lastSelectedSessionIdsByGroup, [sessionGroupId]: sessionId }
              : state.lastSelectedSessionIdsByGroup,
        }));
        pushNav(channelId, sessionGroupId, sessionId);
      }
    }
  },

  _restoreNav: (channelId, sessionGroupId, sessionId, page, chatId) => {
    persistActiveChannelId(channelId);
    if (chatId) persistActiveChatId(chatId);
    if (page === "main" && !chatId) persistActiveSessionNav(sessionGroupId, sessionId);
    set((state) => {
      let channelDoneBadges = state.channelDoneBadges;
      if (channelId && channelDoneBadges[channelId]) {
        const { [channelId]: _, ...rest } = channelDoneBadges;
        channelDoneBadges = rest;
      }
      return {
        activePage: page ?? "main",
        activeChannelId: channelId,
        activeSessionGroupId: sessionGroupId,
        activeSessionId: sessionId,
        activeTerminalId: null,
        activeChatId: chatId ?? null,
        activeThreadId: null,
        channelDoneBadges,
        lastSelectedSessionIdsByGroup:
          sessionGroupId && sessionId
            ? { ...state.lastSelectedSessionIdsByGroup, [sessionGroupId]: sessionId }
            : state.lastSelectedSessionIdsByGroup,
      };
    });
  },
}));

export function getPreferredSessionIdForGroup(
  sessionGroupId: string,
  fallbackSessionId: string | null = null,
): string | null {
  const rememberedSessionId = useUIStore.getState().lastSelectedSessionIdsByGroup[sessionGroupId] ?? null;
  if (rememberedSessionId) {
    const rememberedSession = useEntityStore.getState().sessions[rememberedSessionId];
    if (rememberedSession?.sessionGroupId === sessionGroupId) {
      return rememberedSessionId;
    }
  }
  if (fallbackSessionId) return fallbackSessionId;

  // Fall through to the most recent session in the group
  const mostRecent = Object.values(useEntityStore.getState().sessions)
    .filter((s) => s.sessionGroupId === sessionGroupId)
    .sort((a, b) => {
      const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0];
  return mostRecent?.id ?? null;
}

export function navigateToSessionGroup(
  channelId: string | null,
  sessionGroupId: string,
  fallbackSessionId: string | null = null,
): void {
  const fallbackChannelId = useUIStore.getState().activeChannelId;
  const sessionId = getPreferredSessionIdForGroup(sessionGroupId, fallbackSessionId);
  const resolvedChannelId = resolveChannelIdForSessionGroup(
    sessionGroupId,
    channelId ?? fallbackChannelId,
  );
  useUIStore.getState()._restoreNav(resolvedChannelId, sessionGroupId, sessionId, "main", null);
  const path = buildPath(resolvedChannelId, sessionGroupId, sessionId, "main");
  history.pushState(
    { channelId: resolvedChannelId, sessionGroupId, sessionId, page: "main", chatId: null },
    "",
    path,
  );
}

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
