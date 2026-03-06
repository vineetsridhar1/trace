import { create } from "zustand";
import type {
  AgentType,
  DetectedAgent,
  EffortOption,
  KanbanTicket,
} from "../types";

export type PlanResponseMode = "clear-context" | "keep-context" | "revise";

// Fallback capabilities used before IPC detection completes
const CLAUDE_EFFORT_OPTIONS: EffortOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const DEFAULT_DETECTED_AGENTS: DetectedAgent[] = [
  {
    type: "claude",
    capabilities: {
      displayName: "Claude Code",
      supportsResume: true,
      supportsPlanMode: true,
      models: [
        {
          value: "opus",
          label: "Opus 4.6",
          effortOptions: CLAUDE_EFFORT_OPTIONS,
        },
        {
          value: "sonnet",
          label: "Sonnet 4.6",
          effortOptions: CLAUDE_EFFORT_OPTIONS,
        },
        { value: "haiku", label: "Haiku 4.5" },
      ],
      defaultModel: "opus",
      effortLabel: "Effort",
    },
    detectResult: { available: true },
  },
];

// Registerable action slots provided by useWorkspaceActions
interface WorkspaceActions {
  sendMessage: (
    text: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<boolean>;
  runPendingWorkspace: (
    planMode: boolean,
    prompt: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<void>;
  autoRunQueuedTicket: (
    workspaceId: string,
    runConfig: {
      prompt: string;
      model: string;
      effort: string;
      planMode: boolean;
    },
  ) => Promise<void>;
  stopAgent: () => Promise<void>;
  sendThreadMessage: (
    text: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<boolean>;
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
    runConfig: {
      prompt: string;
      model: string;
      effort: string;
      planMode: boolean;
    },
  ) => Promise<void>;
}

const noopWarn =
  (_name: string) =>
  (..._args: unknown[]) => {};

const defaultWorkspaceActions: WorkspaceActions = {
  sendMessage: noopWarn("sendMessage") as WorkspaceActions["sendMessage"],
  runPendingWorkspace: noopWarn(
    "runPendingWorkspace",
  ) as WorkspaceActions["runPendingWorkspace"],
  autoRunQueuedTicket: noopWarn(
    "autoRunQueuedTicket",
  ) as WorkspaceActions["autoRunQueuedTicket"],
  stopAgent: noopWarn("stopAgent") as WorkspaceActions["stopAgent"],
  sendThreadMessage: noopWarn(
    "sendThreadMessage",
  ) as WorkspaceActions["sendThreadMessage"],
  sendPlanResponse: noopWarn(
    "sendPlanResponse",
  ) as WorkspaceActions["sendPlanResponse"],
  mergeToMain: noopWarn("mergeToMain") as WorkspaceActions["mergeToMain"],
  markMerged: noopWarn("markMerged") as WorkspaceActions["markMerged"],
  createWorkspaceForTicket: noopWarn(
    "createWorkspaceForTicket",
  ) as WorkspaceActions["createWorkspaceForTicket"],
  reviewCompletedTicket: noopWarn(
    "reviewCompletedTicket",
  ) as WorkspaceActions["reviewCompletedTicket"],
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
  detectedAgents: DetectedAgent[];

  // Registered workspace actions
  workspaceActions: WorkspaceActions;
  registerWorkspaceActions: (actions: WorkspaceActions) => void;
  clearWorkspaceActions: () => void;

  setPendingRun: (
    workspaceId: string,
    prompt: string,
    filePaths: string[],
    attachmentIds?: string[],
  ) => void;
  clearPendingRun: () => void;
  setDetectedAgents: (agents: DetectedAgent[]) => void;
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

export const useAgentRunStore = create<AgentRunState>((set, get) => ({
  pendingRunWorkspaceId: null,
  pendingRunInitialPrompt: "",
  pendingRunFilePaths: [],
  selectedAgent: "claude",
  selectedModel: "opus",
  selectedEffort: "high",
  activeRunWorkspaceIds: new Set(),
  spawnedWorkspaceIds: new Set(),
  handoffPickedUpIds: new Set(),
  detectedAgents: DEFAULT_DETECTED_AGENTS,

  // Registered workspace actions
  workspaceActions: { ...defaultWorkspaceActions },
  registerWorkspaceActions: (actions) => set({ workspaceActions: actions }),
  clearWorkspaceActions: () =>
    set({ workspaceActions: { ...defaultWorkspaceActions } }),

  setPendingRun: (workspaceId, prompt, filePaths, _attachmentIds) =>
    set({
      pendingRunWorkspaceId: workspaceId,
      pendingRunInitialPrompt: prompt,
      pendingRunFilePaths: filePaths,
    }),

  clearPendingRun: () =>
    set({
      pendingRunWorkspaceId: null,
      pendingRunInitialPrompt: "",
      pendingRunFilePaths: [],
    }),

  setDetectedAgents: (agents) => set({ detectedAgents: agents }),
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
      state.activeRunWorkspaceIds.size === 0
        ? state
        : { activeRunWorkspaceIds: new Set() },
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

  isWorkspaceSpawned: (workspaceId) =>
    get().spawnedWorkspaceIds.has(workspaceId),

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

export function getEffortOptions(
  agentType: AgentType,
  model: string,
): EffortOption[] {
  const agent = useAgentRunStore
    .getState()
    .detectedAgents.find((a) => a.type === agentType);
  if (!agent) return [];
  return (
    agent.capabilities.models.find((m) => m.value === model)?.effortOptions ??
    []
  );
}

export function getEffortLabel(agentType: AgentType): string {
  const agent = useAgentRunStore
    .getState()
    .detectedAgents.find((a) => a.type === agentType);
  return agent?.capabilities.effortLabel ?? "Effort";
}
