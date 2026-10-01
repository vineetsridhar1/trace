import { create } from "zustand";
import type { HostingMode } from "@trace/gql";
import { isLocalMode } from "../lib/runtime-mode";

const STORAGE_KEY = "trace:default-session-environment";

function readDefaultEnvironment(): HostingMode {
  if (isLocalMode) return "local";
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "cloud" || value === "local") return value;
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return "local";
}

export const useSessionEnvironmentStore = create<{
  defaultEnvironment: HostingMode;
  setDefaultEnvironment: (environment: HostingMode) => void;
}>((set) => ({
  defaultEnvironment: readDefaultEnvironment(),
  setDefaultEnvironment: (environment) => {
    if (isLocalMode && environment === "cloud") return;
    try {
      localStorage.setItem(STORAGE_KEY, environment);
    } catch {
      // Keep the preference in memory when storage is unavailable.
    }
    set({ defaultEnvironment: environment });
  },
}));
