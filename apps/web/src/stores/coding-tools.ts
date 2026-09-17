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
  setCheckOnLaunch: (enabled: boolean) => void;
  check: () => Promise<void>;
  installOrUpdate: (toolId: string) => Promise<void>;
  chooseExecutable: (toolId: string) => Promise<void>;
  clearExecutable: (toolId: string) => Promise<void>;
  updateAll: () => Promise<void>;
}

let checkPromise: Promise<void> | null = null;
let nextStatusRequestId = 0;
let activeStatusRequests = 0;

function beginStatusRequest(): number {
  activeStatusRequests += 1;
  nextStatusRequestId += 1;
  return nextStatusRequestId;
}

function finishStatusRequest(): boolean {
  activeStatusRequests = Math.max(0, activeStatusRequests - 1);
  return activeStatusRequests > 0;
}

function isLatestStatusRequest(requestId: number): boolean {
  return requestId === nextStatusRequestId;
}

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
  setCheckOnLaunch: (enabled) => {
    localStorage.setItem("trace:coding-tools:check-on-launch", String(enabled));
    set({ checkOnLaunch: enabled });
  },
  check: () => {
    if (!window.trace?.getCodingToolStatuses) return Promise.resolve();
    if (checkPromise) return checkPromise;
    const requestId = beginStatusRequest();
    set({ checking: true, failures: {}, recentlyUpdated: [] });
    checkPromise = window.trace
      .getCodingToolStatuses()
      .then((statuses) => {
        if (isLatestStatusRequest(requestId)) {
          set({ statuses, lastCheckedAt: Date.now() });
        }
      })
      .finally(() => {
        set({ checking: finishStatusRequest() });
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
  chooseExecutable: async (toolId) => {
    const api = window.trace?.chooseCodingToolExecutable;
    if (!api) return;
    const requestId = beginStatusRequest();
    set({ checking: true, failures: {}, recentlyUpdated: [] });
    try {
      const statuses = await api(toolId);
      if (statuses && isLatestStatusRequest(requestId)) {
        set({ statuses, lastCheckedAt: Date.now() });
      }
    } catch (error) {
      if (isLatestStatusRequest(requestId)) {
        set((state) => ({
          failures: {
            ...state.failures,
            [toolId]: error instanceof Error ? error.message : "Could not select executable",
          },
        }));
      }
      throw error;
    } finally {
      set({ checking: finishStatusRequest() });
    }
  },
  clearExecutable: async (toolId) => {
    const api = window.trace?.clearCodingToolExecutable;
    if (!api) return;
    const requestId = beginStatusRequest();
    set({ checking: true, failures: {}, recentlyUpdated: [] });
    try {
      const statuses = await api(toolId);
      if (isLatestStatusRequest(requestId)) {
        set({ statuses, lastCheckedAt: Date.now() });
      }
    } catch (error) {
      if (isLatestStatusRequest(requestId)) {
        set((state) => ({
          failures: {
            ...state.failures,
            [toolId]: error instanceof Error ? error.message : "Could not clear executable",
          },
        }));
      }
      throw error;
    } finally {
      set({ checking: finishStatusRequest() });
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
