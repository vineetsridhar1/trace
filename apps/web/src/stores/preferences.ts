import { create } from "zustand";

const STORAGE_KEY = "trace:preferences";

interface Preferences {
  defaultTool: string | null;
  defaultModel: string | null;
}

interface PreferencesState extends Preferences {
  setDefaultTool: (tool: string | null) => void;
  setDefaultModel: (model: string | null) => void;
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Preferences;
  } catch {
    // ignore corrupt data
  }
  return { defaultTool: null, defaultModel: null };
}

function persist(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...load(),

  setDefaultTool: (tool) => {
    set({ defaultTool: tool });
    persist({ defaultTool: tool, defaultModel: get().defaultModel });
  },

  setDefaultModel: (model) => {
    set({ defaultModel: model });
    persist({ defaultTool: get().defaultTool, defaultModel: model });
  },
}));
