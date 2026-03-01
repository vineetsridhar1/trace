import { create } from 'zustand';
import type { ClaudeModel, EffortLevel } from '../types';

interface ClaudeRunState {
  pendingRunWorkspaceId: string | null;
  pendingRunInitialPrompt: string;
  pendingRunFilePaths: string[];
  selectedModel: ClaudeModel;
  selectedEffort: EffortLevel;
  activeRunWorkspaceIds: Set<string>;
  spawnedWorkspaceIds: Set<string>;

  setPendingRun: (workspaceId: string, prompt: string, filePaths: string[]) => void;
  clearPendingRun: () => void;
  setSelectedModel: (model: ClaudeModel) => void;
  setSelectedEffort: (effort: EffortLevel) => void;
  addActiveRun: (workspaceId: string) => void;
  clearActiveRun: (workspaceId: string) => void;
  clearAllActiveRuns: () => void;
  addSpawnedWorkspace: (workspaceId: string) => void;
  removeSpawnedWorkspace: (workspaceId: string) => void;
  isWorkspaceSpawned: (workspaceId: string) => boolean;
}

export const useClaudeRunStore = create<ClaudeRunState>((set, get) => ({
  pendingRunWorkspaceId: null,
  pendingRunInitialPrompt: '',
  pendingRunFilePaths: [],
  selectedModel: 'opus',
  selectedEffort: 'high',
  activeRunWorkspaceIds: new Set(),
  spawnedWorkspaceIds: new Set(),

  setPendingRun: (workspaceId, prompt, filePaths) =>
    set({
      pendingRunWorkspaceId: workspaceId,
      pendingRunInitialPrompt: prompt,
      pendingRunFilePaths: filePaths,
    }),

  clearPendingRun: () =>
    set({
      pendingRunWorkspaceId: null,
      pendingRunInitialPrompt: '',
      pendingRunFilePaths: [],
    }),

  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedEffort: (effort) => set({ selectedEffort: effort }),

  addActiveRun: (workspaceId) =>
    set((state) => {
      if (state.activeRunWorkspaceIds.has(workspaceId)) return state;
      const next = new Set(state.activeRunWorkspaceIds);
      next.add(workspaceId);
      return { activeRunWorkspaceIds: next };
    }),

  clearActiveRun: (workspaceId) =>
    set((state) => {
      if (!state.activeRunWorkspaceIds.has(workspaceId)) return state;
      const next = new Set(state.activeRunWorkspaceIds);
      next.delete(workspaceId);
      return { activeRunWorkspaceIds: next };
    }),

  clearAllActiveRuns: () =>
    set((state) =>
      state.activeRunWorkspaceIds.size === 0 ? state : { activeRunWorkspaceIds: new Set() },
    ),

  addSpawnedWorkspace: (workspaceId) =>
    set((state) => {
      const next = new Set(state.spawnedWorkspaceIds);
      next.add(workspaceId);
      return { spawnedWorkspaceIds: next };
    }),

  removeSpawnedWorkspace: (workspaceId) =>
    set((state) => {
      const next = new Set(state.spawnedWorkspaceIds);
      next.delete(workspaceId);
      return { spawnedWorkspaceIds: next };
    }),

  isWorkspaceSpawned: (workspaceId) => get().spawnedWorkspaceIds.has(workspaceId),
}));
