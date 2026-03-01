import { create } from 'zustand';

interface SyncState {
  isChecking: boolean;
  isPulling: boolean;
  isUpToDate: boolean | null;
  commitsBehind: number;
  error: string | null;
  checkMainBranch: (repoPath: string, baseBranch: string, silent?: boolean) => Promise<void>;
  pullMainBranch: (repoPath: string, baseBranch: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  isChecking: false,
  isPulling: false,
  isUpToDate: null as boolean | null,
  commitsBehind: 0,
  error: null as string | null,
};

export const useSyncStore = create<SyncState>((set, get) => ({
  ...initialState,

  checkMainBranch: async (repoPath: string, baseBranch: string, silent = false) => {
    if (!repoPath || get().isPulling) return;
    if (!silent) set({ isChecking: true });
    try {
      const result = await window.traceAPI.checkMainStatus(repoPath, baseBranch);
      if (result.success) {
        set({
          isUpToDate: result.isUpToDate ?? null,
          commitsBehind: result.commitsBehind ?? 0,
          error: null,
        });
      } else {
        set({
          isUpToDate: null,
          error: result.error ?? 'Failed to check status',
        });
      }
    } catch (err) {
      set({ isUpToDate: null, error: String(err) });
    } finally {
      if (!silent) set({ isChecking: false });
    }
  },

  pullMainBranch: async (repoPath: string, baseBranch: string) => {
    if (!repoPath) return;
    set({ isPulling: true, error: null });
    try {
      const result = await window.traceAPI.pullMain(repoPath, baseBranch);
      if (result.success) {
        set({ isUpToDate: true, commitsBehind: 0 });
      } else {
        set({ error: result.error ?? 'Failed to pull' });
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ isPulling: false });
    }
  },

  reset: () => set(initialState),
}));
