import { create } from "zustand";
import type { CreatableGeneratedProjectKind } from "../components/sidebar/generated-project-types";

type GeneratedProjectDialogKind = CreatableGeneratedProjectKind | "choose" | "design-system";

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
  newGeneratedProjectKind: GeneratedProjectDialogKind | null;
  openGeneratedProjectDialog: (kind: GeneratedProjectDialogKind) => void;
  closeGeneratedProjectDialog: () => void;
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
  newGeneratedProjectKind: null,
  openGeneratedProjectDialog: (kind) => set({ newGeneratedProjectKind: kind }),
  closeGeneratedProjectDialog: () => set({ newGeneratedProjectKind: null }),
}));
