import { create } from 'zustand';
import type { ClaudeModel, EffortLevel } from '../types';

export type PlanResponseMode = 'clear-context' | 'keep-context' | 'revise';

// Registerable action slots provided by useClaudeWorkspaceActions
interface ClaudeWorkspaceActions {
  sendMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  runPendingWorkspace: (planMode: boolean, prompt: string) => Promise<void>;
  autoRunQueuedTicket: (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => Promise<void>;
  stopClaude: () => Promise<void>;
  sendThreadMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  sendPlanResponse: (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => Promise<void>;
  mergeToMain: () => Promise<void>;
  markMerged: () => Promise<void>;
}

const noopWarn = (_name: string) => (..._args: unknown[]) => {};

const defaultWorkspaceActions: ClaudeWorkspaceActions = {
  sendMessage: noopWarn('sendMessage') as ClaudeWorkspaceActions['sendMessage'],
  runPendingWorkspace: noopWarn('runPendingWorkspace') as ClaudeWorkspaceActions['runPendingWorkspace'],
  autoRunQueuedTicket: noopWarn('autoRunQueuedTicket') as ClaudeWorkspaceActions['autoRunQueuedTicket'],
  stopClaude: noopWarn('stopClaude') as ClaudeWorkspaceActions['stopClaude'],
  sendThreadMessage: noopWarn('sendThreadMessage') as ClaudeWorkspaceActions['sendThreadMessage'],
  sendPlanResponse: noopWarn('sendPlanResponse') as ClaudeWorkspaceActions['sendPlanResponse'],
  mergeToMain: noopWarn('mergeToMain') as ClaudeWorkspaceActions['mergeToMain'],
  markMerged: noopWarn('markMerged') as ClaudeWorkspaceActions['markMerged'],
};

interface ClaudeRunState {
  pendingRunWorkspaceId: string | null;
  pendingRunInitialPrompt: string;
  pendingRunFilePaths: string[];
  selectedModel: ClaudeModel;
  selectedEffort: EffortLevel;
  activeRunWorkspaceIds: Set<string>;
  spawnedWorkspaceIds: Set<string>;

  // Registered workspace actions
  workspaceActions: ClaudeWorkspaceActions;
  registerWorkspaceActions: (actions: ClaudeWorkspaceActions) => void;
  clearWorkspaceActions: () => void;

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

  // Registered workspace actions
  workspaceActions: { ...defaultWorkspaceActions },
  registerWorkspaceActions: (actions) => set({ workspaceActions: actions }),
  clearWorkspaceActions: () => set({ workspaceActions: { ...defaultWorkspaceActions } }),

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
