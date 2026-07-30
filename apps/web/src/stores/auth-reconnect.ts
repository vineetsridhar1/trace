import { create } from "zustand";

export interface AuthReconnectUIState {
  dialogOpen: boolean;
  reminderCollapsed: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  collapseReminder: () => void;
  reset: () => void;
}

export const useAuthReconnectStore = create<AuthReconnectUIState>((set) => ({
  dialogOpen: false,
  reminderCollapsed: false,
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
  collapseReminder: () => set({ dialogOpen: false, reminderCollapsed: true }),
  reset: () => set({ dialogOpen: false, reminderCollapsed: false }),
}));
