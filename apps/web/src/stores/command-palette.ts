import { create } from "zustand";

interface CommandPaletteState {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** Whether the "new app session" prompt dialog is open. */
  newAppSessionOpen: boolean;
  setNewAppSessionOpen: (open: boolean) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (open: boolean) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  shortcutsOpen: false,
  setShortcutsOpen: (open: boolean) => set({ shortcutsOpen: open }),
  newAppSessionOpen: false,
  setNewAppSessionOpen: (open: boolean) => set({ newAppSessionOpen: open }),
}));
