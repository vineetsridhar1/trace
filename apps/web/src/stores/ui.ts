import { create } from "zustand";

interface UIState {
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeChannelId: localStorage.getItem("trace:activeChannelId") ?? null,
  setActiveChannelId: (id) => {
    if (id) {
      localStorage.setItem("trace:activeChannelId", id);
    } else {
      localStorage.removeItem("trace:activeChannelId");
    }
    set({ activeChannelId: id });
  },
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));
