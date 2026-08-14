import { create } from "zustand";

interface CommandPaletteState {
  paletteOpen: boolean;
  /** Seed text the palette opens with (e.g. from ⌘F). Consumed on open, then cleared. */
  pendingQuery: string;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  /** Open the palette in search mode, seeded with `initialQuery` (blank if none). */
  openForSearch: (initialQuery: string) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** Whether the "new app session" prompt dialog is open. */
  newAppSessionOpen: boolean;
  setNewAppSessionOpen: (open: boolean) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  paletteOpen: false,
  pendingQuery: "",
  setPaletteOpen: (open: boolean) => set({ paletteOpen: open, pendingQuery: "" }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, pendingQuery: "" })),
  // A non-empty selection is wrapped in quotes so the palette lands in Slack-style
  // "search only" mode (see CommandPaletteBody); an empty seed just opens it.
  openForSearch: (initialQuery: string) =>
    set({ paletteOpen: true, pendingQuery: initialQuery ? `"${initialQuery}"` : "" }),
  shortcutsOpen: false,
  setShortcutsOpen: (open: boolean) => set({ shortcutsOpen: open }),
  newAppSessionOpen: false,
  setNewAppSessionOpen: (open: boolean) => set({ newAppSessionOpen: open }),
}));
