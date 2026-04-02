import { create } from "zustand";

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export interface ConnectionState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set: SetState<ConnectionState>) => ({
  connected: false,
  setConnected: (connected: boolean) => set({ connected }),
}));
