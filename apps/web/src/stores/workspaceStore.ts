import { create } from 'zustand';
import type { Workspace } from '../types';

interface WorkspaceState {
  workspaces: Workspace[];
  loading: boolean;
  attentionWorkspaceIds: Set<string>;
  latestTodos: Record<string, Array<{ content: string; status: string; activeForm?: string }>>;
  mergedCount: number;
  mergedWorkspacesLoaded: boolean;
  mergedWorkspacesLoading: boolean;

  upsertWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  clearWorkspaces: () => void;
  setMergedCount: (count: number) => void;
  setMergedWorkspacesLoaded: (loaded: boolean) => void;
  setMergedWorkspacesLoading: (loading: boolean) => void;
  addAttention: (workspaceId: string) => void;
  clearAttention: (workspaceId: string) => void;
  setLatestTodos: (workspaceId: string, todos: Array<{ content: string; status: string; activeForm?: string }>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  workspaces: [],
  loading: false,
  attentionWorkspaceIds: new Set(),
  latestTodos: {},
  mergedCount: 0,
  mergedWorkspacesLoaded: false,
  mergedWorkspacesLoading: false,

  upsertWorkspace: (workspace) =>
    set((state) => {
      const existingIndex = state.workspaces.findIndex((item) => item.id === workspace.id);
      const next = [...state.workspaces];
      if (existingIndex >= 0) {
        next[existingIndex] = workspace;
      } else {
        next.push(workspace);
      }
      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return { workspaces: next, loading: false };
    }),

  removeWorkspace: (workspaceId) =>
    set((state) => ({
      workspaces: state.workspaces.filter((item) => item.id !== workspaceId),
    })),

  setWorkspaces: (workspaces) => set({ workspaces, loading: false }),

  clearWorkspaces: () =>
    set({ workspaces: [], loading: true, mergedCount: 0, mergedWorkspacesLoaded: false, mergedWorkspacesLoading: false }),

  addAttention: (workspaceId) =>
    set((state) => {
      if (state.attentionWorkspaceIds.has(workspaceId)) return state;
      const next = new Set(state.attentionWorkspaceIds);
      next.add(workspaceId);
      return { attentionWorkspaceIds: next };
    }),

  clearAttention: (workspaceId) =>
    set((state) => {
      if (!state.attentionWorkspaceIds.has(workspaceId)) return state;
      const next = new Set(state.attentionWorkspaceIds);
      next.delete(workspaceId);
      return { attentionWorkspaceIds: next };
    }),

  setLatestTodos: (workspaceId, todos) =>
    set((state) => ({
      latestTodos: { ...state.latestTodos, [workspaceId]: todos },
    })),

  setMergedCount: (count) => set({ mergedCount: count }),
  setMergedWorkspacesLoaded: (loaded) => set({ mergedWorkspacesLoaded: loaded }),
  setMergedWorkspacesLoading: (loading) => set({ mergedWorkspacesLoading: loading }),
}));
