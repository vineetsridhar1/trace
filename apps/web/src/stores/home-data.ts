import { create } from "zustand";

export type HomeDataLoadStatus = "idle" | "loading" | "ready" | "error";

interface HomeDataState {
  organizationId: string | null;
  codingStatus: HomeDataLoadStatus;
  generatedStatus: HomeDataLoadStatus;
  retryRequest: number;
  ensureOrganization: (organizationId: string) => void;
  markCodingStatus: (organizationId: string, status: HomeDataLoadStatus) => void;
  markGeneratedStatus: (organizationId: string, status: HomeDataLoadStatus) => void;
  requestRetry: () => void;
}

export const useHomeDataStore = create<HomeDataState>((set) => ({
  organizationId: null,
  codingStatus: "idle",
  generatedStatus: "idle",
  retryRequest: 0,
  ensureOrganization: (organizationId) =>
    set((state) =>
      state.organizationId === organizationId
        ? {}
        : { organizationId, codingStatus: "idle", generatedStatus: "idle" },
    ),
  markCodingStatus: (organizationId, status) =>
    set((state) => (state.organizationId === organizationId ? { codingStatus: status } : {})),
  markGeneratedStatus: (organizationId, status) =>
    set((state) => (state.organizationId === organizationId ? { generatedStatus: status } : {})),
  requestRetry: () => set((state) => ({ retryRequest: state.retryRequest + 1 })),
}));
