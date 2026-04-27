import { create } from "zustand";

const STORAGE_KEY = "trace:preferences";

export type DefaultHosting = "bridge" | "cloud";

interface Preferences {
  defaultTool: string | null;
  defaultModel: string | null;
  /** Preferred runtime: "bridge" prefers a connected local device, "cloud" uses on-demand cloud */
  defaultHosting: DefaultHosting;
}

interface PreferencesState extends Preferences {
  setDefaultTool: (tool: string | null) => void;
  setDefaultModel: (model: string | null) => void;
  setDefaultHosting: (hosting: DefaultHosting) => void;
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return {
        defaultTool: parsed.defaultTool ?? null,
        defaultModel: parsed.defaultModel ?? null,
        defaultHosting: parsed.defaultHosting ?? "bridge",
      };
    }
  } catch {
    // ignore corrupt data
  }
  return { defaultTool: null, defaultModel: null, defaultHosting: "bridge" };
}

function persist(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
type GetState<T> = () => T;

export const usePreferencesStore = create<PreferencesState>(
  (set: SetState<PreferencesState>, get: GetState<PreferencesState>) => ({
    ...load(),

    setDefaultTool: (tool: string | null) => {
      set({ defaultTool: tool });
      persist({ ...get(), defaultTool: tool });
    },

    setDefaultModel: (model: string | null) => {
      set({ defaultModel: model });
      persist({ ...get(), defaultModel: model });
    },

    setDefaultHosting: (hosting: DefaultHosting) => {
      set({ defaultHosting: hosting });
      persist({ ...get(), defaultHosting: hosting });
    },
  }),
);
