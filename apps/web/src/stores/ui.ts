import { create } from "zustand";

export type ActivePage = "main" | "settings" | "inbox";

interface UIState {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  refreshTick: number;
  triggerRefresh: () => void;
  /** Internal: update state without pushing browser history (used by popstate handler) */
  _restoreNav: (channelId: string | null, sessionId: string | null, page?: ActivePage) => void;
}

function buildPath(channelId: string | null, sessionId: string | null, page: ActivePage = "main"): string {
  if (page === "settings") return "/settings";
  if (page === "inbox") return "/inbox";
  if (channelId && sessionId) return `/c/${channelId}/s/${sessionId}`;
  if (channelId) return `/c/${channelId}`;
  return "/";
}

function pushNav(channelId: string | null, sessionId: string | null, page: ActivePage = "main") {
  const path = buildPath(channelId, sessionId, page);
  history.pushState({ channelId, sessionId, page }, "", path);
}

export const useUIStore = create<UIState>((set, get) => ({
  activePage: "main",
  activeChannelId: null, // initialized from URL in useHistorySync
  activeSessionId: null,
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
      pushNav(channelId, sessionId, "main");
    }
  },

  setActiveChannelId: (id) => {
    if (id) {
      localStorage.setItem("trace:activeChannelId", id);
    } else {
      localStorage.removeItem("trace:activeChannelId");
    }
    const sessionId = null; // switching channels clears session
    set({ activePage: "main", activeChannelId: id, activeSessionId: sessionId });
    pushNav(id, sessionId);
  },

  setActiveSessionId: (id) => {
    const channelId = get().activeChannelId;
    set({ activeSessionId: id });
    pushNav(channelId, id);
  },

  _restoreNav: (channelId, sessionId, page) => {
    if (channelId) {
      localStorage.setItem("trace:activeChannelId", channelId);
    }
    set({ activePage: page ?? "main", activeChannelId: channelId, activeSessionId: sessionId });
  },
}));
