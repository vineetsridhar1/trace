import { create } from 'zustand';
import type { Workspace } from '../types';

interface MyActivityState {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  mergedCount: number;
  mergedWorkspacesLoaded: boolean;
  mergedWorkspacesLoading: boolean;

  setWorkspaces: (workspaces: Workspace[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMergedCount: (count: number) => void;
  setMergedWorkspacesLoaded: (loaded: boolean) => void;
  setMergedWorkspacesLoading: (loading: boolean) => void;
  clearAll: () => void;
}

export const useMyActivityStore = create<MyActivityState>((set) => ({
  workspaces: [],
  loading: false,
  error: null,
  mergedCount: 0,
  mergedWorkspacesLoaded: false,
  mergedWorkspacesLoading: false,

  setWorkspaces: (workspaces) => set({ workspaces }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setMergedCount: (count) => set({ mergedCount: count }),
  setMergedWorkspacesLoaded: (loaded) => set({ mergedWorkspacesLoaded: loaded }),
  setMergedWorkspacesLoading: (loading) => set({ mergedWorkspacesLoading: loading }),
  clearAll: () =>
    set({
      workspaces: [],
      loading: false,
      error: null,
      mergedCount: 0,
      mergedWorkspacesLoaded: false,
      mergedWorkspacesLoading: false,
    }),
}));
