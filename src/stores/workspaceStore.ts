import { create } from 'zustand';
import type { Workspace } from '../types';

interface WorkspaceState {
  workspaces: Workspace[];
  attentionWorkspaceIds: Set<string>;
  worktreeWorkspaceIds: Set<string>;
  deletingWorktreeIds: Set<string>;

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
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  attentionWorkspaceIds: new Set(),
  worktreeWorkspaceIds: new Set(),
  deletingWorktreeIds: new Set(),

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
      return { workspaces: next };
    }),

  removeWorkspace: (workspaceId) =>
    set((state) => ({
      workspaces: state.workspaces.filter((item) => item.id !== workspaceId),
    })),

  setWorkspaces: (workspaces) => set({ workspaces }),

  clearWorkspaces: () => set({ workspaces: [] }),

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
}));
