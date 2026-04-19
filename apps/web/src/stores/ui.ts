import { create } from "zustand";
import { useEntityStore } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";
import {
  buildPath as buildPathInternal,
  persistActiveChannelId,
  persistActiveChatId,
  persistActiveSessionNav,
  pushNav,
  replaceNav,
  resolveChannelIdForSession,
  resolveChannelIdForSessionGroup,
  resolveSessionGroupIdForSession,
} from "./ui-navigation";

export type ActivePage = "main" | "settings" | "inbox" | "tickets" | "agent-debug";
export type ChannelSubPage = "sessions" | "merged-archived" | null;
export interface NavigationState {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  page: ActivePage;
  chatId: string | null;
  channelSubPage: ChannelSubPage;
}

const optimisticSessionRedirects = new Map<string, NavigationState>();

function optimisticSessionRedirectKey(sessionGroupId: string, sessionId: string): string {
  return `${sessionGroupId}:${sessionId}`;
}

export interface UIState {
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
  channelSubPage: ChannelSubPage;
  setChannelSubPage: (subPage: ChannelSubPage) => void;
  settingsInitialTab: string | null;
  setSettingsInitialTab: (tab: string | null) => void;
  unreadChatIds: Record<string, boolean>;
  markChatUnread: (chatId: string) => void;
  markChatRead: (chatId: string) => void;
  showTerminalPanel: boolean;
  setShowTerminalPanel: (show: boolean) => void;
  channelDoneBadges: Record<string, boolean>;
  markChannelDone: (channelId: string) => void;
  sessionDoneBadges: Record<string, boolean>;
  markSessionDone: (sessionId: string) => void;
  sessionGroupDoneBadges: Record<string, boolean>;
  markSessionGroupDone: (sessionGroupId: string) => void;
  _restoreNav: (
    channelId: string | null,
    sessionGroupId: string | null,
    sessionId: string | null,
    page?: ActivePage,
    chatId?: string | null,
    channelSubPage?: ChannelSubPage,
  ) => void;
}

export function buildPath(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
): string {
  return buildPathInternal(channelId, sessionGroupId, sessionId, page, chatId);
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
type GetState<T> = () => T;

export const useUIStore = create<UIState>((set: SetState<UIState>, get: GetState<UIState>) => ({
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
  channelSubPage: null,
  settingsInitialTab: null,
  setSettingsInitialTab: (tab: string | null) => set({ settingsInitialTab: tab }),
  showTerminalPanel: false,
  setShowTerminalPanel: (show: boolean) => set({ showTerminalPanel: show }),
  setChannelSubPage: (subPage: ChannelSubPage) => {
    set({ channelSubPage: subPage });
    const state = get();
    replaceNav(
      state.activeChannelId,
      state.activeSessionGroupId,
      state.activeSessionId,
      state.activePage,
      state.activeChatId,
      subPage,
    );
  },
  unreadChatIds: {},
  channelDoneBadges: {},
  sessionDoneBadges: {},
  sessionGroupDoneBadges: {},
  triggerRefresh: () => set((s: UIState) => ({ refreshTick: s.refreshTick + 1 })),

  openSessionTab: (groupId: string, sessionId: string) => {
    set((s: UIState) => {
      const existing = s.openSessionTabsByGroup[groupId] ?? [];
      if (existing.includes(sessionId)) return {};
      return {
        openSessionTabsByGroup: {
          ...s.openSessionTabsByGroup,
          [groupId]: [...existing, sessionId],
        },
      };
    });
  },

  closeSessionTab: (groupId: string, sessionId: string) => {
    const state = get();
    const existing = state.openSessionTabsByGroup[groupId] ?? [];
    if (existing.length <= 1) return;
    const idx = existing.indexOf(sessionId);
    if (idx === -1) return;
    const next = existing.filter((id: string) => id !== sessionId);
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
      replaceNav(channelId, groupId, adjacentId, "main", null, state.channelSubPage);
    }
    set(updates);
  },

  initSessionTabs: (groupId: string, sessionIds: string[]) => {
    set((s: UIState) => {
      if (s.openSessionTabsByGroup[groupId]) return {};
      return {
        openSessionTabsByGroup: {
          ...s.openSessionTabsByGroup,
          [groupId]: sessionIds,
        },
      };
    });
  },

  setActivePage: (page: ActivePage) => {
    set({ activePage: page, channelSubPage: null });
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
      null,
    );
  },

  setActiveChannelId: (id: string | null) => {
    persistActiveChannelId(id);
    set((s: UIState) => {
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
        channelSubPage: null,
        channelDoneBadges,
      };
    });
    pushNav(id, null, null);
  },

  markChatUnread: (chatId: string) => {
    set((s: UIState) => {
      if (s.unreadChatIds[chatId]) return {};
      return { unreadChatIds: { ...s.unreadChatIds, [chatId]: true } };
    });
  },

  markChatRead: (chatId: string) => {
    set((s: UIState) => {
      if (!s.unreadChatIds[chatId]) return {};
      const { [chatId]: _, ...rest } = s.unreadChatIds;
      return { unreadChatIds: rest };
    });
  },

  markChannelDone: (channelId: string) => {
    set((s: UIState) => {
      if (s.channelDoneBadges[channelId]) return {};
      return { channelDoneBadges: { ...s.channelDoneBadges, [channelId]: true } };
    });
  },

  markSessionDone: (sessionId: string) => {
    set((s: UIState) => {
      if (s.sessionDoneBadges[sessionId]) return {};
      return { sessionDoneBadges: { ...s.sessionDoneBadges, [sessionId]: true } };
    });
  },

  markSessionGroupDone: (sessionGroupId: string) => {
    set((s: UIState) => {
      if (s.sessionGroupDoneBadges[sessionGroupId]) return {};
      return { sessionGroupDoneBadges: { ...s.sessionGroupDoneBadges, [sessionGroupId]: true } };
    });
  },

  setActiveChatId: (id: string | null) => {
    persistActiveChatId(id);
    set((s: UIState) => {
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
        channelSubPage: null,
        unreadChatIds,
      };
    });
    pushNav(null, null, null, "main", id);
  },

  setActiveSessionGroupId: (groupId: string | null, sessionId?: string | null) => {
    const currentChannelId = get().activeChannelId;
    const currentSubPage = get().channelSubPage;
    if (groupId === null) {
      set({
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
      });
      pushNav(currentChannelId, null, null, "main", null, currentSubPage);
      return;
    }

    const nextSessionId =
      sessionId ??
      getPreferredSessionIdForGroup(
        groupId,
        get().activeSessionGroupId === groupId ? get().activeSessionId : null,
      );
    const channelId = resolveChannelIdForSessionGroup(groupId, currentChannelId);
    const nextSubPage = channelId === currentChannelId ? currentSubPage : null;
    persistActiveChannelId(channelId);
    persistActiveSessionNav(groupId, nextSessionId);
    set((state: UIState) => {
      let channelDoneBadges = state.channelDoneBadges;
      if (channelId && channelDoneBadges[channelId]) {
        const { [channelId]: _, ...rest } = channelDoneBadges;
        channelDoneBadges = rest;
      }
      let sessionGroupDoneBadges = state.sessionGroupDoneBadges;
      if (sessionGroupDoneBadges[groupId]) {
        const { [groupId]: _, ...rest } = sessionGroupDoneBadges;
        sessionGroupDoneBadges = rest;
      }
      let sessionDoneBadges = state.sessionDoneBadges;
      if (nextSessionId && sessionDoneBadges[nextSessionId]) {
        const { [nextSessionId]: _, ...rest } = sessionDoneBadges;
        sessionDoneBadges = rest;
      }
      return {
        activePage: "main" as ActivePage,
        activeChatId: null,
        activeChannelId: channelId,
        activeSessionGroupId: groupId,
        activeSessionId: nextSessionId,
        activeTerminalId: null,
        channelSubPage: nextSubPage,
        channelDoneBadges,
        sessionDoneBadges,
        sessionGroupDoneBadges,
        lastSelectedSessionIdsByGroup: nextSessionId
          ? { ...state.lastSelectedSessionIdsByGroup, [groupId]: nextSessionId }
          : state.lastSelectedSessionIdsByGroup,
      };
    });
    pushNav(channelId, groupId, nextSessionId, "main", null, nextSubPage);
  },

  setActiveSessionId: (id: string | null) => {
    const currentChannelId = get().activeChannelId;
    const currentSessionGroupId = get().activeSessionGroupId;
    const currentSubPage = get().channelSubPage;
    if (id === null) {
      persistActiveSessionNav(null, null);
      set({
        activeSessionGroupId: null,
        activeSessionId: null,
        activeTerminalId: null,
      });
      pushNav(currentChannelId, null, null, "main", null, currentSubPage);
      return;
    }

    const sessionGroupId = resolveSessionGroupIdForSession(id, currentSessionGroupId);
    const channelId = resolveChannelIdForSessionGroup(
      sessionGroupId,
      resolveChannelIdForSession(id, currentChannelId),
    );
    const nextSubPage = channelId === currentChannelId ? currentSubPage : null;
    persistActiveChannelId(channelId);
    persistActiveSessionNav(sessionGroupId, id);
    // If staying within the same session group (tab switching), replace history
    // so browser back goes to the sessions table instead of the previous tab
    const stayingInGroup =
      sessionGroupId === currentSessionGroupId && currentSessionGroupId !== null;
    set((state: UIState) => {
      let sessionDoneBadges = state.sessionDoneBadges;
      if (sessionDoneBadges[id]) {
        const { [id]: _, ...rest } = sessionDoneBadges;
        sessionDoneBadges = rest;
      }
      return {
        activeChannelId: channelId,
        activeSessionGroupId: sessionGroupId,
        activeSessionId: id,
        activeTerminalId: null,
        channelSubPage: nextSubPage,
        sessionDoneBadges,
        lastSelectedSessionIdsByGroup: sessionGroupId
          ? { ...state.lastSelectedSessionIdsByGroup, [sessionGroupId]: id }
          : state.lastSelectedSessionIdsByGroup,
      };
    });
    if (stayingInGroup) {
      replaceNav(channelId, sessionGroupId, id, "main", null, nextSubPage);
    } else {
      pushNav(channelId, sessionGroupId, id, "main", null, nextSubPage);
    }
  },

  setActiveTerminalId: (id: string | null) => {
    set({ activeTerminalId: id });
  },

  setActiveThreadId: (id: string | null) => {
    set({ activeThreadId: id });
  },

  restoreLastVisited: (tab: "dm" | "main") => {
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
        set((state: UIState) => ({
          activePage: "main" as ActivePage,
          activeChannelId: channelId,
          activeSessionGroupId: sessionGroupId,
          activeSessionId: sessionId,
          activeTerminalId: null,
          activeChatId: null,
          activeThreadId: null,
          channelSubPage: null,
          lastSelectedSessionIdsByGroup:
            sessionGroupId && sessionId
              ? { ...state.lastSelectedSessionIdsByGroup, [sessionGroupId]: sessionId }
              : state.lastSelectedSessionIdsByGroup,
        }));
        pushNav(channelId, sessionGroupId, sessionId);
      }
    }
  },

  _restoreNav: (channelId: string | null, sessionGroupId: string | null, sessionId: string | null, page?: ActivePage, chatId?: string | null, channelSubPage?: ChannelSubPage) => {
    persistActiveChannelId(channelId);
    if (chatId) persistActiveChatId(chatId);
    if (page === "main" && !chatId) persistActiveSessionNav(sessionGroupId, sessionId);
    set((state: UIState) => {
      let channelDoneBadges = state.channelDoneBadges;
      if (channelId && channelDoneBadges[channelId]) {
        const { [channelId]: _, ...rest } = channelDoneBadges;
        channelDoneBadges = rest;
      }
      let sessionDoneBadges = state.sessionDoneBadges;
      if (sessionId && sessionDoneBadges[sessionId]) {
        const { [sessionId]: _, ...rest } = sessionDoneBadges;
        sessionDoneBadges = rest;
      }
      let sessionGroupDoneBadges = state.sessionGroupDoneBadges;
      if (sessionGroupId && sessionGroupDoneBadges[sessionGroupId]) {
        const { [sessionGroupId]: _, ...rest } = sessionGroupDoneBadges;
        sessionGroupDoneBadges = rest;
      }
      return {
        activePage: page ?? "main",
        activeChannelId: channelId,
        activeSessionGroupId: sessionGroupId,
        activeSessionId: sessionId,
        activeTerminalId: null,
        activeChatId: chatId ?? null,
        activeThreadId: null,
        channelSubPage: channelSubPage ?? null,
        channelDoneBadges,
        sessionDoneBadges,
        sessionGroupDoneBadges,
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
  const rememberedSessionId =
    useUIStore.getState().lastSelectedSessionIdsByGroup[sessionGroupId] ?? null;
  if (rememberedSessionId) {
    const rememberedSession = useEntityStore.getState().sessions[rememberedSessionId];
    if (rememberedSession?.sessionGroupId === sessionGroupId) {
      return rememberedSessionId;
    }
  }
  if (fallbackSessionId) return fallbackSessionId;

  // Fall through to the most recent session in the group
  const mostRecent = (Object.values(useEntityStore.getState().sessions) as SessionEntity[])
    .filter((s: SessionEntity) => s.sessionGroupId === sessionGroupId)
    .sort((a: SessionEntity, b: SessionEntity) => {
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
  const ui = useUIStore.getState();
  const fallbackChannelId = ui.activeChannelId;
  const sessionId = getPreferredSessionIdForGroup(sessionGroupId, fallbackSessionId);
  const resolvedChannelId = resolveChannelIdForSessionGroup(
    sessionGroupId,
    channelId ?? fallbackChannelId,
  );
  const channelSubPage = resolvedChannelId === ui.activeChannelId ? ui.channelSubPage : null;
  useUIStore
    .getState()
    ._restoreNav(resolvedChannelId, sessionGroupId, sessionId, "main", null, channelSubPage);
  const path = buildPath(resolvedChannelId, sessionGroupId, sessionId, "main");
  history.pushState(
    {
      channelId: resolvedChannelId,
      sessionGroupId,
      sessionId,
      page: "main",
      chatId: null,
      channelSubPage,
    },
    "",
    path,
  );
}

export function navigateToSession(
  channelId: string | null,
  sessionGroupId: string,
  sessionId: string,
  options?: { replace?: boolean },
): void {
  const ui = useUIStore.getState();
  const fallbackChannelId = ui.activeChannelId;
  const resolvedChannelId = resolveChannelIdForSessionGroup(
    sessionGroupId,
    resolveChannelIdForSession(sessionId, channelId ?? fallbackChannelId),
  );
  const channelSubPage = resolvedChannelId === ui.activeChannelId ? ui.channelSubPage : null;
  useUIStore
    .getState()
    ._restoreNav(resolvedChannelId, sessionGroupId, sessionId, "main", null, channelSubPage);
  const path = buildPath(resolvedChannelId, sessionGroupId, sessionId, "main");
  const navigate = options?.replace
    ? history.replaceState.bind(history)
    : history.pushState.bind(history);
  navigate(
    {
      channelId: resolvedChannelId,
      sessionGroupId,
      sessionId,
      page: "main",
      chatId: null,
      channelSubPage,
    },
    "",
    path,
  );
}

export function getCurrentNavigationState(): NavigationState {
  const state = useUIStore.getState();
  return {
    channelId: state.activeChannelId,
    sessionGroupId: state.activeSessionGroupId,
    sessionId: state.activeSessionId,
    page: state.activePage,
    chatId: state.activeChatId,
    channelSubPage: state.channelSubPage,
  };
}

export function replaceNavigationState(state: NavigationState): void {
  useUIStore
    .getState()
    ._restoreNav(
      state.channelId,
      state.sessionGroupId,
      state.sessionId,
      state.page,
      state.chatId,
      state.channelSubPage,
    );
  replaceNav(
    state.channelId,
    state.sessionGroupId,
    state.sessionId,
    state.page,
    state.chatId,
    state.channelSubPage,
  );
}

export function registerOptimisticSessionRedirect(
  sessionGroupId: string,
  sessionId: string,
  state: NavigationState,
): void {
  optimisticSessionRedirects.set(optimisticSessionRedirectKey(sessionGroupId, sessionId), state);
}

export function resolveOptimisticSessionRedirect(
  sessionGroupId: string | null,
  sessionId: string | null,
): NavigationState | null {
  if (!sessionGroupId || !sessionId) return null;
  return (
    optimisticSessionRedirects.get(optimisticSessionRedirectKey(sessionGroupId, sessionId)) ?? null
  );
}
