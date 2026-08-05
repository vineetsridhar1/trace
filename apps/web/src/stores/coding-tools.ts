import { create } from "zustand";

export type CodingToolOperation = "installing" | "updating";

export interface CodingToolsState {
  statuses: DesktopCodingToolStatus[] | null;
  checking: boolean;
  operations: Record<string, CodingToolOperation>;
  failures: Record<string, string>;
  recentlyUpdated: string[];
  lastCheckedAt: number | null;
  checkOnLaunch: boolean;
  showSidebarCount: boolean;
  setCheckOnLaunch: (enabled: boolean) => void;
  setShowSidebarCount: (enabled: boolean) => void;
  check: () => Promise<void>;
  installOrUpdate: (toolId: string) => Promise<void>;
  updateAll: () => Promise<void>;
}

let checkPromise: Promise<void> | null = null;

function readPreference(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

export const useCodingToolsStore = create<CodingToolsState>((set, get) => ({
  statuses: null,
  checking: false,
  operations: {},
  failures: {},
  recentlyUpdated: [],
  lastCheckedAt: null,
  checkOnLaunch: readPreference("trace:coding-tools:check-on-launch", true),
  showSidebarCount: readPreference("trace:coding-tools:show-sidebar-count", true),
  setCheckOnLaunch: (enabled) => {
    localStorage.setItem("trace:coding-tools:check-on-launch", String(enabled));
    set({ checkOnLaunch: enabled });
  },
  setShowSidebarCount: (enabled) => {
    localStorage.setItem("trace:coding-tools:show-sidebar-count", String(enabled));
    set({ showSidebarCount: enabled });
  },
  check: () => {
    if (!window.trace?.getCodingToolStatuses) return Promise.resolve();
    if (checkPromise) return checkPromise;
    set({ checking: true, failures: {}, recentlyUpdated: [] });
    checkPromise = window.trace
      .getCodingToolStatuses()
      .then((statuses) => set({ statuses, lastCheckedAt: Date.now() }))
      .finally(() => {
        set({ checking: false });
        checkPromise = null;
      });
    return checkPromise;
  },
  installOrUpdate: async (toolId) => {
    const api = window.trace?.installOrUpdateCodingTool;
    if (!api || get().operations[toolId]) return;
    const current = get().statuses?.find((status) => status.tool === toolId);
    const operation: CodingToolOperation =
      current?.status === "missing" ? "installing" : "updating";
    set((state) => ({
      operations: { ...state.operations, [toolId]: operation },
      failures: Object.fromEntries(Object.entries(state.failures).filter(([id]) => id !== toolId)),
    }));
    try {
      const updated = await api(toolId);
      set((state) => ({
        statuses: (state.statuses ?? []).map((status) =>
          status.tool === toolId ? updated : status,
        ),
        recentlyUpdated: [...new Set([...state.recentlyUpdated, toolId])],
        lastCheckedAt: Date.now(),
      }));
    } catch (error) {
      set((state) => ({
        failures: {
          ...state.failures,
          [toolId]: error instanceof Error ? error.message : "Install failed.",
        },
      }));
      throw error;
    } finally {
      set((state) => ({
        operations: Object.fromEntries(
          Object.entries(state.operations).filter(([id]) => id !== toolId),
        ),
      }));
    }
  },
  updateAll: async () => {
    const pending = (get().statuses ?? []).filter((status) => status.status === "update_available");
    await Promise.allSettled(pending.map((status) => get().installOrUpdate(status.tool)));
  },
}));

export type CodingToolsSummary =
  | "checking"
  | "updates"
  | "updating"
  | "updated"
  | "failed"
  | "ready"
  | "missing";

export function getCodingToolsSummary(state: CodingToolsState): CodingToolsSummary {
  if (state.checking && !state.statuses) return "checking";
  if (Object.keys(state.operations).length > 0) return "updating";
  if (Object.keys(state.failures).length > 0) return "failed";
  if (state.statuses?.some((status) => status.status === "update_available")) return "updates";
  const primaryMissing = state.statuses?.some(
    (status) =>
      (status.tool === "claude_code" || status.tool === "codex") && status.status === "missing",
  );
  if (primaryMissing) return "missing";
  if (state.recentlyUpdated.length > 0) return "updated";
  return "ready";
}
