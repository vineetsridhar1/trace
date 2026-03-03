import { create } from 'zustand';
import type { Workspace } from '../types';

export interface CIStatus {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  loading: boolean;
  attentionWorkspaceIds: Set<string>;
  worktreeWorkspaceIds: Set<string>;
  deletingWorktreeIds: Set<string>;
  ciStatuses: Record<string, CIStatus>;
  latestTodos: Record<string, Array<{ content: string; status: string; activeForm?: string }>>;

  upsertWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  clearWorkspaces: () => void;
  addAttention: (workspaceId: string) => void;
  clearAttention: (workspaceId: string) => void;
  setWorktreeWorkspaceIds: (ids: Set<string>) => void;
  removeWorktreeWorkspaceId: (id: string) => void;
  addDeletingWorktreeId: (id: string) => void;
  removeDeletingWorktreeId: (id: string) => void;
  setCIStatus: (workspaceId: string, status: CIStatus) => void;
  clearCIStatuses: () => void;
  setLatestTodos: (workspaceId: string, todos: Array<{ content: string; status: string; activeForm?: string }>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  loading: false,
  attentionWorkspaceIds: new Set(),
  worktreeWorkspaceIds: new Set(),
  deletingWorktreeIds: new Set(),
  ciStatuses: {},
  latestTodos: {},

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

  clearWorkspaces: () => set({ workspaces: [], loading: true }),

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

  setWorktreeWorkspaceIds: (ids) => set({ worktreeWorkspaceIds: ids }),

  removeWorktreeWorkspaceId: (id) =>
    set((state) => {
      const next = new Set(state.worktreeWorkspaceIds);
      next.delete(id);
      return { worktreeWorkspaceIds: next };
    }),

  addDeletingWorktreeId: (id) =>
    set((state) => {
      const next = new Set(state.deletingWorktreeIds);
      next.add(id);
      return { deletingWorktreeIds: next };
    }),

  removeDeletingWorktreeId: (id) =>
    set((state) => {
      const next = new Set(state.deletingWorktreeIds);
      next.delete(id);
      return { deletingWorktreeIds: next };
    }),

  setCIStatus: (workspaceId, status) =>
    set((state) => ({
      ciStatuses: { ...state.ciStatuses, [workspaceId]: status },
    })),

  clearCIStatuses: () => set({ ciStatuses: {} }),

  setLatestTodos: (workspaceId, todos) =>
    set((state) => ({
      latestTodos: { ...state.latestTodos, [workspaceId]: todos },
    })),
}));
