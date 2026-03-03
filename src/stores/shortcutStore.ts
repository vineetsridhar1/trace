import { create } from 'zustand';

export type ShortcutContext = 'global' | 'thread-open' | 'terminal-focused' | 'modal-open';
export type ShortcutCategory = 'navigation' | 'panels' | 'terminal' | 'thread' | 'creation' | 'general';

/** Priority order for context resolution — higher index wins. */
export const CONTEXT_PRIORITY: ShortcutContext[] = ['global', 'thread-open', 'terminal-focused', 'modal-open'];

export interface ShortcutDefinition {
  id: string;
  keys: string;
  label: string;
  category: ShortcutCategory;
  context: ShortcutContext;
  action: () => void;
  preventDefault?: boolean;
}

interface ShortcutState {
  shortcuts: Map<string, ShortcutDefinition>;
  activeContexts: Set<ShortcutContext>;
  helpDialogOpen: boolean;

  register: (shortcut: ShortcutDefinition) => void;
  unregister: (id: string) => void;
  setActiveContexts: (contexts: Set<ShortcutContext>) => void;
  setHelpDialogOpen: (open: boolean) => void;
}

export const useShortcutStore = create<ShortcutState>((set) => ({
  shortcuts: new Map(),
  activeContexts: new Set(['global']),
  helpDialogOpen: false,

  register: (shortcut) =>
    set((state) => {
      const next = new Map(state.shortcuts);
      next.set(shortcut.id, shortcut);
      return { shortcuts: next };
    }),

  unregister: (id) =>
    set((state) => {
      const next = new Map(state.shortcuts);
      next.delete(id);
      return { shortcuts: next };
    }),

  setActiveContexts: (contexts) => set({ activeContexts: contexts }),
  setHelpDialogOpen: (open) => set({ helpDialogOpen: open }),
}));
