import { create } from "zustand";

export interface OrgRefreshStatus {
  channelsError: string | null;
  homeError: string | null;
}

interface RefreshStatusState {
  byOrg: Record<string, OrgRefreshStatus>;
  setOrgStatus: (orgId: string, status: OrgRefreshStatus) => void;
  clearOrgStatus: (orgId: string) => void;
  reset: () => void;
}

const EMPTY_STATUS: OrgRefreshStatus = {
  channelsError: null,
  homeError: null,
};

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useRefreshStatusStore = create<RefreshStatusState>((set: SetState<RefreshStatusState>) => ({
  byOrg: {},
  setOrgStatus: (orgId, status) =>
    set((state) => ({
      byOrg: { ...state.byOrg, [orgId]: status },
    })),
  clearOrgStatus: (orgId) =>
    set((state) => {
      const next = { ...state.byOrg };
      delete next[orgId];
      return { byOrg: next };
    }),
  reset: () => set({ byOrg: {} }),
}));

export function orgRefreshStatus(
  byOrg: Record<string, OrgRefreshStatus>,
  orgId: string | null | undefined,
): OrgRefreshStatus {
  if (!orgId) return EMPTY_STATUS;
  return byOrg[orgId] ?? EMPTY_STATUS;
}
