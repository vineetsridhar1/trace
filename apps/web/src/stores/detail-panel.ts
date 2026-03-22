import { create } from "zustand";

interface DetailPanelState {
  isFullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  toggleFullscreen: () => void;
}

export const useDetailPanelStore = create<DetailPanelState>((set) => ({
  isFullscreen: false,
  setFullscreen: (v) => set({ isFullscreen: v }),
  toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),
}));
