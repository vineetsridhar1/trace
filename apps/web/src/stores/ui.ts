import { create } from "zustand";

interface UIState {
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  /** Internal: update state without pushing browser history (used by popstate handler) */
  _restoreNav: (channelId: string | null, sessionId: string | null) => void;
}

function buildPath(channelId: string | null, sessionId: string | null): string {
  if (channelId && sessionId) return `/c/${channelId}/s/${sessionId}`;
  if (channelId) return `/c/${channelId}`;
  return "/";
}

function pushNav(channelId: string | null, sessionId: string | null) {
  const path = buildPath(channelId, sessionId);
  history.pushState({ channelId, sessionId }, "", path);
}

export const useUIStore = create<UIState>((set, get) => ({
  activeChannelId: null, // initialized from URL in useHistorySync
  activeSessionId: null,

  setActiveChannelId: (id) => {
    if (id) {
      localStorage.setItem("trace:activeChannelId", id);
    } else {
      localStorage.removeItem("trace:activeChannelId");
    }
    const sessionId = null; // switching channels clears session
    set({ activeChannelId: id, activeSessionId: sessionId });
    pushNav(id, sessionId);
  },

  setActiveSessionId: (id) => {
    const channelId = get().activeChannelId;
    set({ activeSessionId: id });
    pushNav(channelId, id);
  },

  _restoreNav: (channelId, sessionId) => {
    if (channelId) {
      localStorage.setItem("trace:activeChannelId", channelId);
    }
    set({ activeChannelId: channelId, activeSessionId: sessionId });
  },
}));
