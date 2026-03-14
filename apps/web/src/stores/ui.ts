import { create } from "zustand";

interface UIState {
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeChannelId: null,
  setActiveChannelId: (id) => set({ activeChannelId: id }),
}));
