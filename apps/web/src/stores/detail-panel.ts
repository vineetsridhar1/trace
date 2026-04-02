import { create } from "zustand";

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export interface DetailPanelState {
  isFullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  toggleFullscreen: () => void;
}

export const useDetailPanelStore = create<DetailPanelState>((set: SetState<DetailPanelState>) => ({
  isFullscreen: false,
  setFullscreen: (v: boolean) => set({ isFullscreen: v }),
  toggleFullscreen: () => set((s: DetailPanelState) => ({ isFullscreen: !s.isFullscreen })),
}));
