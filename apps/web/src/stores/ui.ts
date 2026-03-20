import { create } from "zustand";

export type ActivePage = "main" | "settings" | "inbox";

interface UIState {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  refreshTick: number;
  triggerRefresh: () => void;
  /** Internal: update state without pushing browser history (used by popstate handler) */
  _restoreNav: (channelId: string | null, sessionId: string | null, page?: ActivePage, chatId?: string | null) => void;
}

export function buildPath(
  channelId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
): string {
  if (page === "settings") return "/settings";
  if (page === "inbox") return "/inbox";
  if (chatId) return `/dm/${chatId}`;
  if (channelId && sessionId) return `/c/${channelId}/s/${sessionId}`;
  if (channelId) return `/c/${channelId}`;
  return "/";
}

function pushNav(channelId: string | null, sessionId: string | null, page: ActivePage = "main", chatId: string | null = null) {
  const path = buildPath(channelId, sessionId, page, chatId);
  history.pushState({ channelId, sessionId, page, chatId }, "", path);
}

export const useUIStore = create<UIState>((set, get) => ({
  activePage: "main",
  activeChannelId: null, // initialized from URL in useHistorySync
  activeChatId: null,
  activeSessionId: null,
  activeThreadId: null,
  refreshTick: 0,
  triggerRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),

  setActivePage: (page) => {
    set({ activePage: page });
    if (page === "settings") {
      pushNav(null, null, "settings");
    } else if (page === "inbox") {
      pushNav(null, null, "inbox");
    } else {
      const channelId = get().activeChannelId;
      const sessionId = get().activeSessionId;
      const chatId = get().activeChatId;
      pushNav(channelId, sessionId, "main", chatId);
    }
  },

  setActiveChannelId: (id) => {
    if (id) {
      localStorage.setItem("trace:activeChannelId", id);
    } else {
      localStorage.removeItem("trace:activeChannelId");
    }
    set({ activePage: "main", activeChannelId: id, activeChatId: null, activeSessionId: null, activeThreadId: null });
    pushNav(id, null);
  },

  setActiveChatId: (id) => {
    set({ activePage: "main", activeChatId: id, activeChannelId: null, activeSessionId: null, activeThreadId: null });
    pushNav(null, null, "main", id);
  },

  setActiveSessionId: (id) => {
    const channelId = get().activeChannelId;
    set({ activeSessionId: id });
    pushNav(channelId, id);
  },

  setActiveThreadId: (id) => {
    set({ activeThreadId: id });
  },

  _restoreNav: (channelId, sessionId, page, chatId) => {
    if (channelId) {
      localStorage.setItem("trace:activeChannelId", channelId);
    }
    set({
      activePage: page ?? "main",
      activeChannelId: channelId,
      activeSessionId: sessionId,
      activeChatId: chatId ?? null,
      activeThreadId: null,
    });
  },
}));

/** Navigate to a session atomically — single state update, single history entry. */
export function navigateToSession(channelId: string | null, sessionId: string): void {
  useUIStore.getState()._restoreNav(channelId, sessionId, "main", null);
  const path = buildPath(channelId, sessionId, "main");
  history.pushState({ channelId, sessionId, page: "main", chatId: null }, "", path);
}
