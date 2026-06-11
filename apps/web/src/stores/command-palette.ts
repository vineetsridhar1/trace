import { create } from "zustand";

interface CommandPaletteState {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (open: boolean) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  shortcutsOpen: false,
  setShortcutsOpen: (open: boolean) => set({ shortcutsOpen: open }),
}));
