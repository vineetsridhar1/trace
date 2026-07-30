import { create } from "zustand";

interface HomeDataState {
  organizationId: string | null;
  codingLoaded: boolean;
  generatedLoaded: boolean;
  ensureOrganization: (organizationId: string) => void;
  markCodingLoaded: (organizationId: string) => void;
  markGeneratedLoaded: (organizationId: string) => void;
}

export const useHomeDataStore = create<HomeDataState>((set) => ({
  organizationId: null,
  codingLoaded: false,
  generatedLoaded: false,
  ensureOrganization: (organizationId) =>
    set((state) =>
      state.organizationId === organizationId
        ? {}
        : { organizationId, codingLoaded: false, generatedLoaded: false },
    ),
  markCodingLoaded: (organizationId) =>
    set((state) => (state.organizationId === organizationId ? { codingLoaded: true } : {})),
  markGeneratedLoaded: (organizationId) =>
    set((state) => (state.organizationId === organizationId ? { generatedLoaded: true } : {})),
}));
