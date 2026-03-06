import { create } from 'zustand';
import type { AgentType, EffortOption, KanbanTicket } from '../types';

export type PlanResponseMode = 'clear-context' | 'keep-context' | 'revise';

const CLAUDE_EFFORT_OPTIONS: EffortOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Hardcoded Claude agent for web — no IPC detection needed
const CLAUDE_AGENT = {
  type: 'claude' as AgentType,
  capabilities: {
    displayName: 'Claude Code',
    supportsResume: true,
    supportsPlanMode: true,
    models: [
      { value: 'opus', label: 'Opus 4.6', effortOptions: CLAUDE_EFFORT_OPTIONS },
      { value: 'sonnet', label: 'Sonnet 4.6', effortOptions: CLAUDE_EFFORT_OPTIONS },
      { value: 'haiku', label: 'Haiku 4.5' },
    ],
    defaultModel: 'opus',
    effortLabel: 'Effort',
  },
};

// Registerable action slots provided by useWorkspaceActions
interface WorkspaceActions {
  sendMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  runPendingWorkspace: (
    planMode: boolean,
    prompt: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<void>;
  autoRunQueuedTicket: (
    workspaceId: string,
    runConfig: { prompt: string; model: string; effort: string; planMode: boolean },
  ) => Promise<void>;
  stopAgent: () => Promise<void>;
  sendThreadMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  sendPlanResponse: (
    text: string,
    mode: PlanResponseMode,
    planContent?: string,
    planFilePath?: string,
  ) => Promise<void>;
  mergeToMain: () => Promise<void>;
  markMerged: () => Promise<void>;
  createWorkspaceForTicket: (ticket: KanbanTicket) => Promise<void>;
  reviewCompletedTicket: (
    workspaceId: string,
    runConfig: { prompt: string; model: string; effort: string; planMode: boolean },
  ) => Promise<void>;
}

const noopWarn =
  (_name: string) =>
  (..._args: unknown[]) => {};

const defaultWorkspaceActions: WorkspaceActions = {
  sendMessage: noopWarn('sendMessage') as WorkspaceActions['sendMessage'],
  runPendingWorkspace: noopWarn('runPendingWorkspace') as WorkspaceActions['runPendingWorkspace'],
  autoRunQueuedTicket: noopWarn('autoRunQueuedTicket') as WorkspaceActions['autoRunQueuedTicket'],
  stopAgent: noopWarn('stopAgent') as WorkspaceActions['stopAgent'],
  sendThreadMessage: noopWarn('sendThreadMessage') as WorkspaceActions['sendThreadMessage'],
  sendPlanResponse: noopWarn('sendPlanResponse') as WorkspaceActions['sendPlanResponse'],
  mergeToMain: noopWarn('mergeToMain') as WorkspaceActions['mergeToMain'],
  markMerged: noopWarn('markMerged') as WorkspaceActions['markMerged'],
  createWorkspaceForTicket: noopWarn('createWorkspaceForTicket') as WorkspaceActions['createWorkspaceForTicket'],
  reviewCompletedTicket: noopWarn('reviewCompletedTicket') as WorkspaceActions['reviewCompletedTicket'],
};

interface AgentRunState {
  pendingRunWorkspaceId: string | null;
  pendingRunInitialPrompt: string;
  pendingRunFilePaths: string[];
  selectedAgent: AgentType;
  selectedModel: string;
  selectedEffort: string;
  activeRunWorkspaceIds: Set<string>;
  spawnedWorkspaceIds: Set<string>;
  handoffPickedUpIds: Set<string>;

  // Registered workspace actions
  workspaceActions: WorkspaceActions;
  registerWorkspaceActions: (actions: WorkspaceActions) => void;
  clearWorkspaceActions: () => void;

  setPendingRun: (workspaceId: string, prompt: string, filePaths: string[]) => void;
  clearPendingRun: () => void;
  setSelectedAgent: (agent: AgentType) => void;
  setSelectedModel: (model: string) => void;
  setSelectedEffort: (effort: string) => void;
  addActiveRun: (workspaceId: string) => void;
  clearActiveRun: (workspaceId: string) => void;
  clearAllActiveRuns: () => void;
  addSpawnedWorkspace: (workspaceId: string) => void;
  removeSpawnedWorkspace: (workspaceId: string) => void;
  isWorkspaceSpawned: (workspaceId: string) => boolean;
  addHandoffPickedUp: (workspaceId: string) => void;
  clearHandoffPickedUp: (workspaceId: string) => void;
  isHandoffPickedUp: (workspaceId: string) => boolean;
}

export const useAgentRunStore = create<AgentRunState>()((set, get) => ({
  pendingRunWorkspaceId: null,
  pendingRunInitialPrompt: '',
  pendingRunFilePaths: [],
  selectedAgent: 'claude',
  selectedModel: 'opus',
  selectedEffort: 'high',
  activeRunWorkspaceIds: new Set(),
  spawnedWorkspaceIds: new Set(),
  handoffPickedUpIds: new Set(),

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

  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
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

  addHandoffPickedUp: (workspaceId) =>
    set((state) => {
      const next = new Set(state.handoffPickedUpIds);
      next.add(workspaceId);
      return { handoffPickedUpIds: next };
    }),

  clearHandoffPickedUp: (workspaceId) =>
    set((state) => {
      if (!state.handoffPickedUpIds.has(workspaceId)) return state;
      const next = new Set(state.handoffPickedUpIds);
      next.delete(workspaceId);
      return { handoffPickedUpIds: next };
    }),

  isHandoffPickedUp: (workspaceId) => get().handoffPickedUpIds.has(workspaceId),
}));

export function getModels() {
  return CLAUDE_AGENT.capabilities.models;
}

export function getEffortOptions(model: string): EffortOption[] {
  return CLAUDE_AGENT.capabilities.models.find((m) => m.value === model)?.effortOptions ?? [];
}

export function getEffortLabel(): string {
  return CLAUDE_AGENT.capabilities.effortLabel ?? 'Effort';
}
